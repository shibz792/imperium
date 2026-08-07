"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { nextPropertyRef, nextContactRef } from "@/lib/refs";
import { writeAudit, logActivity } from "@/lib/audit";
import { districtForCity } from "@/lib/locations";

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
  return {
    title: str(fd, "title") ?? "Untitled property",
    description: str(fd, "description"),
    category: (str(fd, "category") ?? "RESIDENTIAL") as never,
    subtype: str(fd, "subtype") ?? "House",
    transactionType: (str(fd, "transactionType") ?? "SALE") as never,
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
    advertisedPrice: num(fd, "advertisedPrice") ?? num(fd, "totalPrice") ?? num(fd, "monthlyRental") ?? num(fd, "annualLeaseValue"),

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
