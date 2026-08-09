"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { generateMarketingContent, CONTENT_TYPE_LABELS, type ContentType } from "@/lib/marketing";

export async function generateAsset(propertyId: string, contentType: ContentType, language: "EN" | "SI" | "TA") {
  const user = await requireUser();
  const property = await prisma.property.findUniqueOrThrow({ where: { id: propertyId } });
  const { content } = await generateMarketingContent(property, contentType, language);

  const asset = await prisma.marketingAsset.create({
    data: { propertyId, contentType, language, content, approved: false },
  });

  await logActivity({ entityType: "property", propertyId, type: "MARKETING_GENERATED", message: `${user.name} generated ${contentType.replace(/_/g, " ").toLowerCase()} content.`, userId: user.id });
  revalidatePath("/marketing-studio");
  revalidatePath(`/properties/${propertyId}`);
  return asset;
}

// One click instead of repeating property/type/language/Generate ten times
// for a new listing — every content type, same property and language, in
// parallel. Each still lands as its own row, reviewed/approved individually;
// this only replaces the repetitive part of getting them made.
export async function generateAllAssets(propertyId: string, language: "EN" | "SI" | "TA") {
  await requireUser();
  const contentTypes = Object.keys(CONTENT_TYPE_LABELS) as ContentType[];
  const assets = await Promise.all(contentTypes.map((contentType) => generateAsset(propertyId, contentType, language)));
  return assets;
}

export async function approveAsset(id: string) {
  const user = await requireUser();
  const asset = await prisma.marketingAsset.update({ where: { id }, data: { approved: true, approvedById: user.id } });
  await logActivity({ entityType: "property", propertyId: asset.propertyId, type: "MARKETING_APPROVED", message: `${user.name} approved marketing content for use.`, userId: user.id });
  revalidatePath("/marketing-studio");
  revalidatePath(`/properties/${asset.propertyId}`);
}

// Re-runs generation for the same property/type/language and overwrites the
// existing row instead of creating a new one — trying again for a result
// you don't like shouldn't leave an abandoned draft behind every time.
// Resets approval: a re-generated approved asset needs a fresh look before
// it goes back to being what gets copied everywhere.
export async function regenerateAsset(id: string) {
  const user = await requireUser();
  const existing = await prisma.marketingAsset.findUniqueOrThrow({ where: { id }, include: { property: true } });
  const { content } = await generateMarketingContent(existing.property, existing.contentType as ContentType, existing.language);

  const asset = await prisma.marketingAsset.update({
    where: { id },
    data: { content, approved: false, approvedById: null },
  });

  await logActivity({ entityType: "property", propertyId: existing.propertyId, type: "MARKETING_GENERATED", message: `${user.name} regenerated ${existing.contentType.replace(/_/g, " ").toLowerCase()} content.`, userId: user.id });
  revalidatePath("/marketing-studio");
  revalidatePath(`/properties/${existing.propertyId}`);
  return asset;
}

// Unapproved only — an approved asset may already be what the app's own
// WhatsApp buttons are copying; deleting it out from under that needs an
// explicit un-approve first, not a stray click here.
export async function deleteMarketingAsset(id: string) {
  await requireUser();
  const asset = await prisma.marketingAsset.findUnique({ where: { id } });
  if (!asset || asset.approved) return;
  await prisma.marketingAsset.delete({ where: { id } });
  revalidatePath("/marketing-studio");
  revalidatePath(`/properties/${asset.propertyId}`);
}
