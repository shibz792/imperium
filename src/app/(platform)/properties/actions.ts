"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, isAdmin, requireRole, ADMIN_ROLES } from "@/lib/auth";
import { nextPropertyRef, nextContactRef } from "@/lib/refs";
import { writeAudit, logActivity } from "@/lib/audit";
import { districtForCity } from "@/lib/locations";
import { applyMarkup } from "@/lib/property";
import { downloadDriveFile, ensurePropertyDriveFolder, uploadToPropertyFolder, trashDriveFile, storageAccountIssue } from "@/lib/google";
import { deleteGuarded } from "@/lib/deleteGuard";
import type { BulkActionResult } from "@/lib/bulk";
import crypto from "node:crypto";

function str(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}
function num(fd: FormData, key: string): number | undefined {
  const v = str(fd, key);
  if (v === undefined) return undefined;
  const n = Number(v.replace(/,/g, ""));
  return Number.isNaN(n) ? undefined : n;
}
function int(fd: FormData, key: string): number | undefined {
  const n = num(fd, key);
  return n === undefined ? undefined : Math.round(n);
}
function bool(fd: FormData, key: string): boolean {
  return fd.get(key) === "on" || fd.get(key) === "true";
}
function date(fd: FormData, key: string): Date | undefined {
  const v = str(fd, key);
  return v ? new Date(v) : undefined;
}

function extractFeatures(fd: FormData): Record<string, boolean> {
  const raw = fd.getAll("features");
  const out: Record<string, boolean> = {};
  for (const f of raw) if (typeof f === "string") out[f] = true;
  return out;
}

async function resolveOwner(fd: FormData, agentId: string): Promise<string | undefined> {
  const existing = str(fd, "ownerId");
  if (existing) return existing;
  const name = str(fd, "ownerNewName");
  const phone = str(fd, "ownerNewPhone");
  if (!name || !phone) return undefined;
  const contact = await prisma.contact.create({
    data: {
      contactRef: await nextContactRef(),
      name,
      contactType: "OWNER",
      phone,
      whatsapp: phone,
      assignedAgentId: agentId,
      source: "Property intake",
    },
  });
  return contact.id;
}

function buildPropertyData(fd: FormData) {
  const city = str(fd, "city");
  const transactionType = str(fd, "transactionType") ?? "SALE";
  const isRent = transactionType === "RENT" || transactionType === "SHORT_TERM_RENTAL";
  const isLease = transactionType === "LEASE";
  const basePrice = isRent ? num(fd, "monthlyRental") : isLease ? num(fd, "annualLeaseValue") : num(fd, "totalPrice");
  const markupType = (str(fd, "markupType") ?? "NONE") as "NONE" | "PERCENT" | "FIXED";
  const markupValue = num(fd, "markupValue");

  return {
    title: str(fd, "title") ?? "Untitled property",
    description: str(fd, "description"),
    category: (str(fd, "category") ?? "RESIDENTIAL") as never,
    subtype: str(fd, "subtype") ?? "House",
    transactionType: transactionType as never,
    listingStatus: (str(fd, "listingStatus") ?? "DRAFT") as never,
    exclusivity: (str(fd, "exclusivity") ?? "OPEN") as never,
    source: str(fd, "source"),

    province: str(fd, "province"),
    district: str(fd, "district") ?? (city ? districtForCity(city) : undefined),
    city,
    suburb: str(fd, "suburb"),
    address: str(fd, "address"),
    landmark: str(fd, "landmark"),
    lat: num(fd, "lat"),
    lng: num(fd, "lng"),
    locationVisibility: (str(fd, "locationVisibility") ?? "APPROXIMATE") as never,
    roadAccess: str(fd, "roadAccess"),
    roadWidthFt: num(fd, "roadWidthFt"),
    distanceMajorRoadKm: num(fd, "distanceMajorRoadKm"),

    sizePerches: num(fd, "sizePerches"),
    sizeAcres: num(fd, "sizeAcres"),
    sizeSqft: num(fd, "sizeSqft"),
    sizeSqm: num(fd, "sizeSqm"),
    builtUpSqft: num(fd, "builtUpSqft"),
    warehouseFloorSqft: num(fd, "warehouseFloorSqft"),
    frontageFt: num(fd, "frontageFt"),
    buildingHeightFt: num(fd, "buildingHeightFt"),
    clearHeightFt: num(fd, "clearHeightFt"),
    floors: int(fd, "floors"),
    bedrooms: int(fd, "bedrooms"),
    bathrooms: int(fd, "bathrooms"),

    totalPrice: num(fd, "totalPrice"),
    priceNegotiable: bool(fd, "priceNegotiable"),
    pricePerPerch: num(fd, "pricePerPerch"),
    pricePerSqft: num(fd, "pricePerSqft"),
    monthlyRental: num(fd, "monthlyRental"),
    annualLeaseValue: num(fd, "annualLeaseValue"),
    keyMoney: num(fd, "keyMoney"),
    securityDeposit: num(fd, "securityDeposit"),
    minLeaseTermMonths: int(fd, "minLeaseTermMonths"),
    expectedYieldPct: num(fd, "expectedYieldPct"),
    currency: str(fd, "currency") ?? "LKR",
    ownerMinPrice: num(fd, "ownerMinPrice"),
    markupType: markupType as never,
    markupValue,
    advertisedPrice: applyMarkup(basePrice, markupType, markupValue) ?? undefined,

    featuresJson: extractFeatures(fd),

    ownerAuthorityConfirmed: bool(fd, "ownerAuthorityConfirmed"),
    deedAvailable: bool(fd, "deedAvailable"),
    surveyPlanAvailable: bool(fd, "surveyPlanAvailable"),
    cocAvailable: bool(fd, "cocAvailable"),
    approvedPlanAvailable: bool(fd, "approvedPlanAvailable"),
    municipalDocsAvailable: bool(fd, "municipalDocsAvailable"),
    taxDocsAvailable: bool(fd, "taxDocsAvailable"),
    mortgageStatus: str(fd, "mortgageStatus"),
    legalVerificationStatus: (str(fd, "legalVerificationStatus") ?? "UNVERIFIED") as never,
    internalLegalNotes: str(fd, "internalLegalNotes"),

    heroImageUrl: str(fd, "heroImageUrl"),
    expiryDate: date(fd, "expiryDate"),
  };
}

function collaboratorIds(fd: FormData): string[] {
  return fd.getAll("collaboratorIds").filter((v): v is string => typeof v === "string" && v.length > 0);
}

export async function createProperty(formData: FormData) {
  const user = await requireUser();
  const ownerId = await resolveOwner(formData, user.id);
  const data = buildPropertyData(formData);

  const property = await prisma.property.create({
    data: {
      ...data,
      propertyRef: await nextPropertyRef(),
      ownerId,
      assignedAgentId: str(formData, "assignedAgentId") ?? user.id,
      lastVerifiedDate: new Date(),
      collaborators: { connect: collaboratorIds(formData).map((id) => ({ id })) },
    } as never,
  });

  await writeAudit({ userId: user.id, action: "CREATE", entityType: "property", entityId: property.id, after: data });
  await logActivity({ entityType: "property", propertyId: property.id, type: "CREATED", message: `${user.name} created this property listing.`, userId: user.id });

  revalidatePath("/properties");
  redirect(`/properties/${property.id}`);
}

export async function updateProperty(id: string, formData: FormData) {
  const user = await requireUser();
  const before = await prisma.property.findUniqueOrThrow({ where: { id } });
  const ownerId = await resolveOwner(formData, user.id);
  const data = buildPropertyData(formData);

  await prisma.property.update({
    where: { id },
    data: {
      ...data,
      ownerId: ownerId ?? before.ownerId,
      assignedAgentId: str(formData, "assignedAgentId") ?? before.assignedAgentId,
      collaborators: { set: collaboratorIds(formData).map((id) => ({ id })) },
    } as never,
  });

  await writeAudit({ userId: user.id, action: "UPDATE", entityType: "property", entityId: id, before, after: data });
  await logActivity({ entityType: "property", propertyId: id, type: "UPDATED", message: `${user.name} updated this property record.`, userId: user.id });

  revalidatePath("/properties");
  revalidatePath(`/properties/${id}`);
  redirect(`/properties/${id}`);
}

export async function verifyProperty(id: string) {
  const user = await requireUser();
  await prisma.property.update({ where: { id }, data: { lastVerifiedDate: new Date() } });
  await logActivity({ entityType: "property", propertyId: id, type: "VERIFIED", message: `${user.name} reconfirmed this listing is current.`, userId: user.id });
  await writeAudit({ userId: user.id, action: "VERIFY", entityType: "property", entityId: id });
  revalidatePath(`/properties/${id}`);
  revalidatePath("/properties");
}

export async function changeListingStatus(id: string, status: string) {
  const user = await requireUser();
  await prisma.property.update({ where: { id }, data: { listingStatus: status as never } });
  await logActivity({ entityType: "property", propertyId: id, type: "STATUS", message: `${user.name} changed listing status to ${status.replace("_", " ")}.`, userId: user.id });
  await writeAudit({ userId: user.id, action: "STATUS_CHANGE", entityType: "property", entityId: id, after: { status } });
  revalidatePath(`/properties/${id}`);
  revalidatePath("/properties");
}

// ---------------------------------------------------------------------------
// Media — photos, drone shots, floor plans. Every property gets its own
// folder in the company's shared Google Drive (created on first upload,
// under "Imperium Realty — Property Media") — nothing is kept in our own
// storage. Anyone signed in can upload or view; only an admin can delete
// (deletePropertyMedia). The first photo a property ever gets is
// automatically its cover.
// ---------------------------------------------------------------------------

export async function uploadPropertyPhotos(propertyId: string, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: true };

  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { propertyRef: true, title: true } });
  if (!property) return { ok: false, error: "Property not found." };

  const folderId = await ensurePropertyDriveFolder(propertyId, property.propertyRef, property.title);
  if (!folderId) return { ok: false, error: (await storageAccountIssue()) ?? "Could not access Drive storage — try again shortly." };

  const existingCount = await prisma.propertyMedia.count({ where: { propertyId } });
  let uploaded = 0;
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileId = await uploadToPropertyFolder(folderId, buffer, file.name, file.type || "image/jpeg");
    if (!fileId) continue;
    await prisma.propertyMedia.create({
      data: { propertyId, url: `/api/drive-media/${fileId}`, driveFileId: fileId, type: "PHOTO", isCover: existingCount === 0 && uploaded === 0 },
    });
    uploaded++;
  }
  if (uploaded === 0) return { ok: false, error: "Upload to Drive failed — try again." };

  await logActivity({ entityType: "property", propertyId, type: "MEDIA_UPLOADED", message: `${user.name} added ${uploaded} photo${uploaded === 1 ? "" : "s"}.`, userId: user.id });
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/properties");
  return { ok: true };
}

export async function setCoverPhoto(propertyId: string, mediaId: string) {
  await requireUser();
  await prisma.$transaction([
    prisma.propertyMedia.updateMany({ where: { propertyId }, data: { isCover: false } }),
    prisma.propertyMedia.update({ where: { id: mediaId }, data: { isCover: true } }),
  ]);
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/properties");
}

export async function deletePropertyMedia(propertyId: string, mediaId: string) {
  const user = await requireUser();
  if (!isAdmin(user)) throw new Error("Only an admin can delete property media.");
  const media = await prisma.propertyMedia.findUnique({ where: { id: mediaId } });
  if (!media || media.propertyId !== propertyId) return;

  await prisma.propertyMedia.delete({ where: { id: mediaId } });
  if (media.driveFileId) await trashDriveFile(media.driveFileId).catch(() => {});

  if (media.isCover) {
    const next = await prisma.propertyMedia.findFirst({ where: { propertyId }, orderBy: { createdAt: "asc" } });
    if (next) await prisma.propertyMedia.update({ where: { id: next.id }, data: { isCover: true } });
  }
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/properties");
}

export async function importPhotosFromDrive(propertyId: string, fileIds: string[]): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (fileIds.length === 0) return { ok: true };

  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { propertyRef: true, title: true } });
  if (!property) return { ok: false, error: "Property not found." };

  const folderId = await ensurePropertyDriveFolder(propertyId, property.propertyRef, property.title);
  if (!folderId) return { ok: false, error: (await storageAccountIssue()) ?? "Could not access Drive storage — try again shortly." };

  const existingCount = await prisma.propertyMedia.count({ where: { propertyId } });
  let imported = 0;
  for (const fileId of fileIds) {
    // Downloaded using the browsing user's own Drive connection (wherever
    // the file actually lives), then re-uploaded into the storage
    // account's property folder — the two can be different accounts.
    const file = await downloadDriveFile(user.id, fileId);
    if (!file || !file.mimeType.startsWith("image/")) continue;
    const newFileId = await uploadToPropertyFolder(folderId, file.buffer, file.name, file.mimeType);
    if (!newFileId) continue;
    await prisma.propertyMedia.create({
      data: { propertyId, url: `/api/drive-media/${newFileId}`, driveFileId: newFileId, type: "PHOTO", isCover: existingCount === 0 && imported === 0 },
    });
    imported++;
  }

  if (imported > 0) {
    await logActivity({ entityType: "property", propertyId, type: "MEDIA_UPLOADED", message: `${user.name} imported ${imported} photo${imported === 1 ? "" : "s"} from Google Drive.`, userId: user.id });
  }
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/properties");
  return { ok: true };
}

export async function deleteProperty(id: string) {
  const admin = await requireRole(ADMIN_ROLES);
  const result = await deleteGuarded(() => prisma.property.delete({ where: { id } }), "deals, viewings, documents or marketing content on this property");
  if (!result.ok) redirect(`/properties/${id}?deleteError=${encodeURIComponent(result.error)}`);

  await writeAudit({ userId: admin.id, action: "DELETE", entityType: "property", entityId: id });
  revalidatePath("/properties");
  redirect("/properties");
}

// ---------------------------------------------------------------------------
// Bulk actions — for the multi-select toolbar on the Properties list page.
// Same gating as their single-row equivalents (delete stays admin-only via
// deleteGuarded; status/reassign stay open to any signed-in viewer of this
// list, matching changeListingStatus's existing precedent). Can't redirect
// mid-loop like the single-row actions do, so each returns a
// BulkActionResult the client toolbar renders as a partial-failure summary.
// ---------------------------------------------------------------------------

export async function bulkDeleteProperties(ids: string[]): Promise<BulkActionResult> {
  const admin = await requireRole(ADMIN_ROLES);
  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];

  await Promise.all(
    ids.map(async (id) => {
      const result = await deleteGuarded(() => prisma.property.delete({ where: { id } }), "deals, viewings, documents or marketing content on this property");
      if (!result.ok) {
        failed.push({ id, error: result.error });
        return;
      }
      await writeAudit({ userId: admin.id, action: "DELETE", entityType: "property", entityId: id });
      succeeded.push(id);
    }),
  );

  if (succeeded.length) revalidatePath("/properties");
  return { succeeded, failed };
}

export async function bulkChangeListingStatus(ids: string[], status: string): Promise<BulkActionResult> {
  const user = await requireUser();
  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];

  await Promise.all(
    ids.map(async (id) => {
      try {
        await prisma.property.update({ where: { id }, data: { listingStatus: status as never } });
        await logActivity({ entityType: "property", propertyId: id, type: "STATUS", message: `${user.name} changed listing status to ${status.replace("_", " ")} (bulk update).`, userId: user.id });
        await writeAudit({ userId: user.id, action: "STATUS_CHANGE", entityType: "property", entityId: id, after: { status } });
        succeeded.push(id);
      } catch (e) {
        failed.push({ id, error: e instanceof Error ? e.message : "Update failed." });
      }
    }),
  );

  if (succeeded.length) {
    revalidatePath("/properties");
    succeeded.forEach((id) => revalidatePath(`/properties/${id}`));
  }
  return { succeeded, failed };
}

export async function bulkReassignPropertyAgent(ids: string[], agentId: string): Promise<BulkActionResult> {
  const user = await requireUser();
  const agent = await prisma.user.findUnique({ where: { id: agentId }, select: { name: true, active: true } });
  if (!agent?.active) {
    return { succeeded: [], failed: ids.map((id) => ({ id, error: "Selected agent is not valid or inactive." })) };
  }

  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];

  await Promise.all(
    ids.map(async (id) => {
      try {
        const before = await prisma.property.findUnique({ where: { id }, select: { assignedAgentId: true } });
        await prisma.property.update({ where: { id }, data: { assignedAgentId: agentId } });
        await logActivity({ entityType: "property", propertyId: id, type: "REASSIGNED", message: `${user.name} reassigned this property to ${agent.name} (bulk update).`, userId: user.id });
        await writeAudit({ userId: user.id, action: "REASSIGN", entityType: "property", entityId: id, before: { assignedAgentId: before?.assignedAgentId }, after: { assignedAgentId: agentId } });
        succeeded.push(id);
      } catch (e) {
        failed.push({ id, error: e instanceof Error ? e.message : "Update failed." });
      }
    }),
  );

  if (succeeded.length) revalidatePath("/properties");
  return { succeeded, failed };
}

// ---------------------------------------------------------------------------
// Public share pages — the schema (SharePage) and the Marketing tab's list
// UI already existed; nothing ever created a row or served /share/[slug].
// ---------------------------------------------------------------------------

export async function createSharePage(propertyId: string, formData: FormData) {
  const user = await requireUser();
  const password = str(formData, "password");
  const expiresInDays = num(formData, "expiresInDays");
  const watermarkClientName = str(formData, "watermarkClientName");

  await prisma.sharePage.create({
    data: {
      propertyId,
      slug: crypto.randomBytes(5).toString("hex"),
      visibility: (str(formData, "visibility") === "PUBLIC" ? "PUBLIC" : "UNLISTED") as never,
      password,
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000) : undefined,
      watermarkClientName,
      hideOwnerContact: formData.get("hideOwnerContact") === "on",
      hideExactLocation: formData.get("hideExactLocation") === "on",
    },
  });

  await logActivity({ entityType: "property", propertyId, type: "SHARE_PAGE_CREATED", message: `${user.name} created a public share link.`, userId: user.id });
  revalidatePath(`/properties/${propertyId}`);
}

export async function deleteSharePage(propertyId: string, id: string) {
  const user = await requireUser();
  await prisma.sharePage.delete({ where: { id } });
  await logActivity({ entityType: "property", propertyId, type: "SHARE_PAGE_REVOKED", message: `${user.name} revoked a public share link.`, userId: user.id });
  revalidatePath(`/properties/${propertyId}`);
}
