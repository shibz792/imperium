"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, ADMIN_ROLES } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { generateMarketingContent, CONTENT_TYPE_LABELS, type ContentType } from "@/lib/marketing";
import { composeSocialImage, brandGradientBackground, type SocialImageFormat } from "@/lib/marketingImage";
import { generatePollinationsImage, enhancePropertyPhoto } from "@/lib/pollinations";
import { streamPropertyPhoto } from "@/lib/google";
import { relevantAskingPrice, priceUnit } from "@/lib/property";
import { formatCurrency, titleCase } from "@/lib/format";
import { scoreMatch } from "@/lib/match";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { composeBrochure } from "@/lib/brochurePdf";
import { appBaseUrl } from "@/lib/url";
import { sendEmail, parseEmailContent } from "@/lib/email";

export async function generateAsset(propertyId: string, contentType: ContentType, language: "EN" | "SI" | "TA") {
  const user = await requireRole(ADMIN_ROLES);
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
// this only replaces the repetitive part of getting them made. A full
// campaign means the two social tiles too, not just text — those are
// composed automatically right after — using the listing's own photo, or a
// labeled AI concept background if there isn't one yet (see
// generateSocialImage) — with any remaining failure silently skipped, not
// surfaced as an error here; each row still has its own manual "Generate
// image" retry in Recent generations.
export async function generateAllAssets(propertyId: string, language: "EN" | "SI" | "TA") {
  await requireRole(ADMIN_ROLES);
  const contentTypes = Object.keys(CONTENT_TYPE_LABELS) as ContentType[];
  const assets = await Promise.all(contentTypes.map((contentType) => generateAsset(propertyId, contentType, language)));

  await Promise.all(
    assets
      .filter((a) => a.contentType === "SOCIAL_1_1" || a.contentType === "STORY_9_16")
      .map((a) => generateSocialImage(a.id).catch(() => undefined)),
  );

  return assets;
}

// "Get everyone caught up" — every ACTIVE listing with no approved
// marketing content yet. Returned to the client so it can drive the
// sequential loop itself (see MarketingStudioClient.tsx) and show real
// per-property progress, rather than one opaque server call that only
// resolves at the very end.
export async function propertiesNeedingCampaign(): Promise<{ id: string; title: string }[]> {
  await requireRole(ADMIN_ROLES);
  const properties = await prisma.property.findMany({
    where: { listingStatus: "ACTIVE" },
    select: { id: true, title: true, marketingAssets: { where: { approved: true }, take: 1 } },
    orderBy: { title: "asc" },
  });
  return properties.filter((p) => p.marketingAssets.length === 0).map((p) => ({ id: p.id, title: p.title }));
}

export async function approveAsset(id: string) {
  const user = await requireRole(ADMIN_ROLES);
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
  const user = await requireRole(ADMIN_ROLES);
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
  await requireRole(ADMIN_ROLES);
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
// Placeholder stand-in used by the old (pre-Drive) property form's default
// value — a handful of early records have this saved as if it were a real
// photo. Compositing the company logo as though it were the listing would
// be actively wrong, not just unavailable, so it's explicitly excluded
// rather than treated as a usable source.
const PLACEHOLDER_MEDIA_URL = "/brand/logo-icon-gold.png";

// Property photos have come from two pipelines over this app's life:
// Drive-backed (driveFileId set, url is our own /api/drive-media proxy)
// and an earlier direct-URL upload (Supabase storage, or anything else
// external). Image generation shouldn't care which one a given photo came
// from — only that it's a real photo.
async function fetchSourcePhoto(url: string): Promise<Buffer | null> {
  if (url.startsWith("/api/drive-media/")) {
    const fileId = url.split("/").pop();
    if (!fileId) return null;
    const result = await streamPropertyPhoto(fileId);
    return result?.buffer ?? null;
  }
  if (/^https?:\/\//.test(url)) {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }
  return null; // relative paths that aren't the Drive proxy are static app assets, not property photos
}

// Best-effort scene description for the Pollinations fallback below — never
// invents specifics (no bedroom count, no interior claims) since this isn't
// describing the actual unit, just a generic, on-brand exterior mood shot
// for a listing that has no photo of its own yet.
function conceptImagePrompt(property: { subtype: string; city: string | null; district: string | null; transactionType: string }): string {
  const kind = titleCase(property.subtype).toLowerCase();
  const place = [property.city, property.district].filter(Boolean).join(", ") || "Sri Lanka";
  return `professional real estate photography, exterior of a modern ${kind} in ${place}, golden hour lighting, architectural photography, wide angle, no people, no text, no watermark, high quality`;
}

// Pollinations' Kontext (image-to-image) model fetches the source image
// itself from a URL — there's no raw-bytes upload on the free endpoint —
// so the real photo's URL has to be publicly reachable, not a relative
// app-internal path. A legacy direct-upload URL already is; the Drive
// proxy path needs the app's own origin prefixed.
function toAbsoluteMediaUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  return `${appBaseUrl()}${url.startsWith("/") ? url : `/${url}`}`;
}

// Composes the tile and stores the PNG bytes directly on the row in
// Postgres — deliberately not routed through Google Drive. Property photos
// may still live there, but generating a postable image is core platform
// functionality and shouldn't depend on an external account being
// connected. See src/lib/marketingImage.ts for what actually gets drawn.
export async function generateSocialImage(assetId: string): Promise<{ ok: true; imageUrl: string; aiConcept?: boolean; aiEnhanced?: boolean } | { ok: false; error: string }> {
  const user = await requireRole(ADMIN_ROLES);
  const asset = await prisma.marketingAsset.findUniqueOrThrow({ where: { id: assetId }, include: { property: true } });
  if (asset.contentType !== "SOCIAL_1_1" && asset.contentType !== "STORY_9_16") {
    return { ok: false, error: "Image generation is only available for the 1:1 and 9:16 social formats." };
  }

  const candidates = await prisma.propertyMedia.findMany({
    where: { propertyId: asset.propertyId, type: "PHOTO", url: { not: PLACEHOLDER_MEDIA_URL } },
    orderBy: { isCover: "desc" },
  });

  let photoBuffer: Buffer | null = null;
  let sourceUrl: string | null = null;
  for (const candidate of candidates) {
    photoBuffer = await fetchSourcePhoto(candidate.url);
    if (photoBuffer) {
      sourceUrl = candidate.url;
      break;
    }
  }

  const format0: SocialImageFormat = asset.contentType === "STORY_9_16" ? "9:16" : "1:1";
  const dims0 = format0 === "9:16" ? { width: 1080, height: 1920 } : { width: 1080, height: 1080 };

  // A real photo was found — try a subtle AI retouch (lighting/color/sky
  // only, never altering the room itself) before it goes to compositing.
  // Best-effort and silent: on any failure (offline dev server, Pollinations
  // down, unreachable URL) the original, untouched photo is used instead —
  // this must never block or degrade the tile just because the polish step
  // didn't work.
  let aiEnhanced = false;
  if (photoBuffer && sourceUrl) {
    const enhanced = await enhancePropertyPhoto(toAbsoluteMediaUrl(sourceUrl), dims0);
    if (enhanced) {
      photoBuffer = enhanced;
      aiEnhanced = true;
    }
  }

  // No real photo (either none uploaded, or Drive couldn't be reached) —
  // fall back to a free, keyless AI-generated concept background rather
  // than hard-failing. Always visibly labeled as a concept image, never
  // presented as the real unit — see composeSocialImage's aiConcept badge.
  let aiConcept = false;
  if (!photoBuffer) {
    photoBuffer = await generatePollinationsImage(conceptImagePrompt(asset.property), dims0);
    aiConcept = photoBuffer !== null;
  }
  // Guaranteed last resort — a content piece should never fail to get an
  // image just because a free, best-effort external service was slow or
  // unreachable (this also keeps things working against a local dev server,
  // where Pollinations' image-to-image step above can't reach back in, and
  // covers the rare case where even the text-to-image call times out).
  if (!photoBuffer) {
    photoBuffer = await brandGradientBackground(format0);
  }

  const [headline, tagline] = asset.content.split("\n");
  const price = relevantAskingPrice(asset.property);
  const priceLine = price ? `${formatCurrency(price, asset.property.currency)}${priceUnit(asset.property)}` : "Price on request";

  const png = await composeSocialImage(photoBuffer, { headline: headline ?? asset.property.title, tagline: tagline ?? "", priceLine, format: format0, aiConcept, aiEnhanced });

  const imageUrl = `/api/marketing-image/${assetId}`;
  await prisma.marketingAsset.update({ where: { id: assetId }, data: { imageData: new Uint8Array(png), imageMimeType: "image/png", imageUrl } });

  await logActivity({
    entityType: "property",
    propertyId: asset.propertyId,
    type: "MARKETING_GENERATED",
    message: aiConcept
      ? `${user.name} composed a ${format0} social image using an AI-generated concept background (no property photo available yet).`
      : aiEnhanced
        ? `${user.name} composed a ${format0} social image using an AI-enhanced version of the listing photo.`
        : `${user.name} composed a ${format0} social image.`,
    userId: user.id,
  });
  revalidatePath("/marketing-studio");
  revalidatePath(`/properties/${asset.propertyId}`);
  return { ok: true, imageUrl, aiConcept, aiEnhanced };
}

// A real, multi-page PDF brochure — not just the BROCHURE content type's
// text sitting unused. Stored and served exactly like generateSocialImage's
// composed tiles: the imageData/imageMimeType columns and the
// /api/marketing-image/[assetId] route are already generic (any bytes,
// any mimetype), so a PDF needs no schema change, just a different
// mimetype value. If the property already has a public share page (see
// properties/actions.ts createSharePage), its link becomes the brochure's
// QR code; otherwise the brochure is generated without one.
export async function generateBrochurePdf(assetId: string): Promise<{ ok: true; imageUrl: string } | { ok: false; error: string }> {
  const user = await requireRole(ADMIN_ROLES);
  const asset = await prisma.marketingAsset.findUniqueOrThrow({ where: { id: assetId }, include: { property: true } });
  if (asset.contentType !== "BROCHURE") {
    return { ok: false, error: "PDF generation is only available for the brochure content type." };
  }

  const [cover, sharePage] = await Promise.all([
    prisma.propertyMedia.findFirst({
      where: { propertyId: asset.propertyId, type: "PHOTO", url: { not: PLACEHOLDER_MEDIA_URL } },
      orderBy: { isCover: "desc" },
    }),
    prisma.sharePage.findFirst({ where: { propertyId: asset.propertyId }, orderBy: { createdAt: "desc" } }),
  ]);
  const photoBuffer = cover ? await fetchSourcePhoto(cover.url) : null;
  const shareUrl = sharePage ? `${appBaseUrl()}/share/${sharePage.slug}` : null;

  const pdf = await composeBrochure({ property: asset.property, brochureText: asset.content, photoBuffer, shareUrl });

  const imageUrl = `/api/marketing-image/${assetId}`;
  await prisma.marketingAsset.update({ where: { id: assetId }, data: { imageData: new Uint8Array(pdf), imageMimeType: "application/pdf", imageUrl } });

  await logActivity({ entityType: "property", propertyId: asset.propertyId, type: "MARKETING_GENERATED", message: `${user.name} generated a PDF brochure.`, userId: user.id });
  revalidatePath("/marketing-studio");
  revalidatePath(`/properties/${asset.propertyId}`);
  return { ok: true, imageUrl };
}

// The message a "Send via WhatsApp" click should carry: the approved
// WHATSAPP asset if one exists (same content the app's own WhatsApp copy
// buttons already use, see whatsAppMessage() in lib/property.ts), else the
// most recent draft, else nothing to send yet.
export async function whatsAppContentForProperty(propertyId: string): Promise<string | null> {
  await requireRole(ADMIN_ROLES);
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
  clientEmail: string | null;
  score: number;
};

// Marketing content generated in a vacuum has no destination — this reuses
// the exact same scoring engine Matchmaker is built on (src/lib/match.ts)
// to answer "who is this listing actually relevant to", right inside
// Marketing Studio, so approving content and sending it don't require
// hopping to a different screen.
export async function matchedAudience(propertyId: string): Promise<MatchedContact[]> {
  await requireRole(ADMIN_ROLES);
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
      return { requirementId: r.id, clientName: r.client.name, clientPhone: r.client.phone, clientEmail: r.client.email, score: result.score };
    })
    .filter((m): m is MatchedContact => m !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

// The EMAIL_CAMPAIGN content type is already written as "Subject: ...\n\n
// <body>" (see CHANNEL_SPECS, lib/marketing.ts) — parseEmailContent just
// splits that, it doesn't regenerate anything.
export async function emailContentForProperty(propertyId: string): Promise<{ subject: string; body: string } | null> {
  await requireRole(ADMIN_ROLES);
  const asset = await prisma.marketingAsset.findFirst({
    where: { propertyId, contentType: "EMAIL_CAMPAIGN" },
    orderBy: [{ approved: "desc" }, { createdAt: "desc" }],
  });
  return asset ? parseEmailContent(asset.content) : null;
}

export async function sendMatchedContactEmail(email: string, subject: string, body: string) {
  await requireRole(ADMIN_ROLES);
  return sendEmail(email, subject, body);
}

// Real one-click send via the WhatsApp Business Cloud API — dormant until
// WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN are configured (same
// two-tier pattern as everywhere else this app talks to WhatsApp); the
// click-to-chat link above always works regardless.
export async function sendMatchedContact(phone: string, content: string) {
  await requireRole(ADMIN_ROLES);
  return sendWhatsAppMessage(phone, content);
}
