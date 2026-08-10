"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { generateMarketingContent, CONTENT_TYPE_LABELS, type ContentType } from "@/lib/marketing";
import { composeSocialImage, type SocialImageFormat } from "@/lib/marketingImage";
import { streamPropertyPhoto, ensurePropertyDriveFolder, uploadToPropertyFolder, getStorageAccountUserId } from "@/lib/google";
import { relevantAskingPrice, priceUnit } from "@/lib/property";
import { formatCurrency } from "@/lib/format";
import { scoreMatch } from "@/lib/match";
import { waLink, whatsappCloudConfigured, sendWhatsAppMessage } from "@/lib/whatsapp";

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

// Composes a real, postable social tile: the property's actual cover
// photo with the generated headline/tagline and the database's own price
// overlaid — see src/lib/marketingImage.ts for why this isn't a pure
// text-to-image model. Only valid for SOCIAL_1_1 / STORY_9_16 rows, whose
// content is two plain lines (headline, tagline) by construction — see
// CHANNEL_SPECS in lib/marketing.ts.
export async function generateSocialImage(assetId: string): Promise<{ ok: true; imageUrl: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const asset = await prisma.marketingAsset.findUniqueOrThrow({ where: { id: assetId }, include: { property: true } });
  if (asset.contentType !== "SOCIAL_1_1" && asset.contentType !== "STORY_9_16") {
    return { ok: false, error: "Image generation is only available for the 1:1 and 9:16 social formats." };
  }

  const storageUserId = await getStorageAccountUserId();
  if (!storageUserId) {
    return { ok: false, error: "Connect Google Drive storage (Settings → Integrations) to generate postable images." };
  }

  const cover = await prisma.propertyMedia.findFirst({
    where: { propertyId: asset.propertyId, type: "PHOTO" },
    orderBy: { isCover: "desc" },
  });
  if (!cover?.driveFileId) {
    return { ok: false, error: "Add a property photo first — Media tab on the listing." };
  }

  const photo = await streamPropertyPhoto(cover.driveFileId);
  if (!photo) {
    return { ok: false, error: "Could not load the property's photo from storage. Try again shortly." };
  }

  const [headline, tagline] = asset.content.split("\n");
  const price = relevantAskingPrice(asset.property);
  const priceLine = price ? `${formatCurrency(price, asset.property.currency)}${priceUnit(asset.property)}` : "Price on request";
  const format: SocialImageFormat = asset.contentType === "STORY_9_16" ? "9:16" : "1:1";

  const png = await composeSocialImage(photo.buffer, { headline: headline ?? asset.property.title, tagline: tagline ?? "", priceLine, format });

  const folderId = await ensurePropertyDriveFolder(asset.propertyId, asset.property.propertyRef, asset.property.title);
  if (!folderId) {
    return { ok: false, error: "Could not access Drive storage. Confirm the storage account is still connected." };
  }
  const fileName = `${asset.property.propertyRef}-${asset.contentType.toLowerCase()}-${Date.now()}.png`;
  const fileId = await uploadToPropertyFolder(folderId, png, fileName, "image/png");
  if (!fileId) {
    return { ok: false, error: "Upload to Drive failed. Try again shortly." };
  }

  const imageUrl = `/api/drive-media/${fileId}`;
  await prisma.marketingAsset.update({ where: { id: assetId }, data: { imageDriveFileId: fileId, imageUrl } });

  await logActivity({ entityType: "property", propertyId: asset.propertyId, type: "MARKETING_GENERATED", message: `${user.name} composed a ${format} social image.`, userId: user.id });
  revalidatePath("/marketing-studio");
  revalidatePath(`/properties/${asset.propertyId}`);
  return { ok: true, imageUrl };
}

// The message a "Send via WhatsApp" click should carry: the approved
// WHATSAPP asset if one exists (same content the app's own WhatsApp copy
// buttons already use, see whatsAppMessage() in lib/property.ts), else the
// most recent draft, else nothing to send yet.
export async function whatsAppContentForProperty(propertyId: string): Promise<string | null> {
  await requireUser();
  const asset = await prisma.marketingAsset.findFirst({
    where: { propertyId, contentType: "WHATSAPP" },
    orderBy: [{ approved: "desc" }, { createdAt: "desc" }],
  });
  return asset?.content ?? null;
}

export type MatchedContact = {
  requirementId: string;
  clientName: string;
  clientPhone: string;
  score: number;
};

// Marketing content generated in a vacuum has no destination — this reuses
// the exact same scoring engine Matchmaker is built on (src/lib/match.ts)
// to answer "who is this listing actually relevant to", right inside
// Marketing Studio, so approving content and sending it don't require
// hopping to a different screen.
export async function matchedAudience(propertyId: string): Promise<MatchedContact[]> {
  await requireUser();
  const [property, requirements] = await Promise.all([
    prisma.property.findUniqueOrThrow({ where: { id: propertyId } }),
    prisma.requirement.findMany({
      where: { status: { in: ["NEW", "UNVERIFIED", "QUALIFIED", "ACTIVELY_SEARCHING", "OPTIONS_SHARED", "VIEWING_ARRANGED", "NEGOTIATING"] } },
      include: { client: true },
    }),
  ]);

  return requirements
    .map((r) => {
      const result = scoreMatch(property, r);
      if (!result || result.score < 60 || !r.client.phone) return null;
      return { requirementId: r.id, clientName: r.client.name, clientPhone: r.client.phone, score: result.score };
    })
    .filter((m): m is MatchedContact => m !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

// wa.me link prefilled with the given content for one specific contact —
// same helper CopyWhatsAppButton already uses elsewhere, just aimed at a
// matched contact instead of a generic copy button. Cloud API auto-send
// stays dormant (same two-tier pattern as the rest of this app) until real
// Meta credentials are configured.
export async function whatsAppSendLink(phone: string, content: string): Promise<{ link: string; cloudConfigured: boolean }> {
  await requireUser();
  return { link: waLink(phone, content), cloudConfigured: whatsappCloudConfigured() };
}

// Real one-click send via the WhatsApp Business Cloud API — dormant until
// WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN are configured (same
// two-tier pattern as everywhere else this app talks to WhatsApp); the
// click-to-chat link above always works regardless.
export async function sendMatchedContact(phone: string, content: string) {
  await requireUser();
  return sendWhatsAppMessage(phone, content);
}
