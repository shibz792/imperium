import type { Property, Requirement } from "@/generated/prisma/client";
import { formatCurrency, titleCase } from "@/lib/format";

// /api/drive-media/[fileId] resizes on the fly when given a ?w= hint (see
// that route) — every small thumbnail render (list rows, cards, gallery
// tiles) should ask for one instead of paying for the full original Drive
// file just to show it at 60px. Full-size contexts (the media grid's
// lightbox, a share page's own hero photo) call the bare url instead.
export function thumbUrl(url: string, width = 400): string {
  return `${url}${url.includes("?") ? "&" : "?"}w=${width}`;
}

// One place for the business contact details every outbound message signs
// off with.
export const BUSINESS_WEBSITE = "imperiumrealty.co";
export const BUSINESS_PHONE = "+94 777 143 774";
const SIGNATURE = ["Imperium Realty", `🌐 ${BUSINESS_WEBSITE}`, `📞 ${BUSINESS_PHONE}`].join("\n");

// Spec §8 "Property completeness score" — 0-100 with a short qualitative
// label agents recognise at a glance. Only high-completeness, verified
// records should be eligible for public/marketing promotion.
export function completenessScore(p: Pick<Property, "heroImageUrl" | "description" | "totalPrice" | "monthlyRental" | "annualLeaseValue" | "sizeSqft" | "sizePerches" | "sizeAcres" | "warehouseFloorSqft" | "lat" | "lng" | "address" | "deedAvailable" | "surveyPlanAvailable" | "cocAvailable" | "approvedPlanAvailable" | "municipalDocsAvailable" | "taxDocsAvailable" | "ownerAuthorityConfirmed" | "legalVerificationStatus" | "ownerId">) {
  let score = 0;
  const gaps: string[] = [];

  if (p.heroImageUrl) score += 12;
  else gaps.push("hero image");

  if (p.description && p.description.length > 40) score += 10;
  else gaps.push("description");

  if (p.totalPrice || p.monthlyRental || p.annualLeaseValue) score += 12;
  else gaps.push("pricing");

  if (p.sizeSqft || p.sizePerches || p.sizeAcres || p.warehouseFloorSqft) score += 10;
  else gaps.push("size");

  if (p.lat && p.lng) score += 10;
  else gaps.push("map pin");

  if (p.address) score += 6;
  else gaps.push("address");

  if (p.ownerId) score += 8;
  else gaps.push("owner record");

  if (p.ownerAuthorityConfirmed) score += 8;
  else gaps.push("owner authority");

  const docCount = [p.deedAvailable, p.surveyPlanAvailable, p.cocAvailable, p.approvedPlanAvailable, p.municipalDocsAvailable, p.taxDocsAvailable].filter(Boolean).length;
  score += Math.round((docCount / 6) * 16);
  if (docCount < 6) gaps.push("documents");

  if (p.legalVerificationStatus === "VERIFIED") score += 8;
  else gaps.push("legal verification");

  score = Math.min(100, score);

  let label: string;
  if (score >= 90) label = "Ready to market";
  else if (score >= 70) label = `Missing ${gaps.slice(0, 2).join(" and ")}`;
  else label = `Incomplete: ${gaps.slice(0, 2).join(", ")}`;

  return { score, label, gaps };
}

export function isStale(p: Pick<Property, "lastVerifiedDate" | "listingStatus">, thresholdDays = 30) {
  if (p.listingStatus !== "ACTIVE") return false;
  if (!p.lastVerifiedDate) return true;
  const ageDays = (Date.now() - p.lastVerifiedDate.getTime()) / 86_400_000;
  return ageDays > thresholdDays;
}

// The client's real price (totalPrice/monthlyRental/annualLeaseValue) vs.
// what's actually shown to a buyer (advertisedPrice) can differ when a
// client authorizes a markup — advertisedPrice wins everywhere buyer-facing
// (cards, WhatsApp, matching) whenever it's set; falls back to the client's
// own price for the (still-common) case of no markup.
export function relevantAskingPrice(p: Pick<Property, "transactionType" | "totalPrice" | "monthlyRental" | "annualLeaseValue" | "advertisedPrice">) {
  if (p.transactionType === "RENT" || p.transactionType === "SHORT_TERM_RENTAL") return p.advertisedPrice ?? p.monthlyRental;
  if (p.transactionType === "LEASE") return p.advertisedPrice ?? p.annualLeaseValue;
  return p.advertisedPrice ?? p.totalPrice;
}

// The client's own, un-marked-up price — for the confidential-gated "client
// price vs. advertised" comparison on the property detail page.
export function clientPrice(p: Pick<Property, "transactionType" | "totalPrice" | "monthlyRental" | "annualLeaseValue">) {
  if (p.transactionType === "RENT" || p.transactionType === "SHORT_TERM_RENTAL") return p.monthlyRental;
  if (p.transactionType === "LEASE") return p.annualLeaseValue;
  return p.totalPrice;
}

export function applyMarkup(basePrice: number | null | undefined, markupType: "NONE" | "PERCENT" | "FIXED", markupValue: number | null | undefined): number | null {
  if (basePrice == null) return null;
  if (markupType === "PERCENT" && markupValue) return Math.round(basePrice * (1 + markupValue / 100));
  if (markupType === "FIXED" && markupValue) return Math.round(basePrice + markupValue);
  return basePrice;
}

export function priceUnit(p: Pick<Property, "transactionType">) {
  if (p.transactionType === "RENT" || p.transactionType === "SHORT_TERM_RENTAL") return "/month";
  if (p.transactionType === "LEASE") return "/year";
  return "";
}

function saleHeader(t: Property["transactionType"]) {
  if (t === "RENT" || t === "SHORT_TERM_RENTAL") return "🏠 *FOR RENT*";
  if (t === "LEASE") return "🏠 *FOR LEASE*";
  return "🏠 *FOR SALE*";
}

const DIVIDER = "▫️▫️▫️▫️▫️▫️▫️▫️▫️▫️";

// Ready-to-send WhatsApp copy for a single property — one consistent
// structure every agent sends, signed off with the same business contact
// details every time instead of everyone typing their own. A status header
// (FOR SALE/RENT/LEASE) up top so it reads at a glance in a chat thread,
// same as a real listing card would.
//
// approvedContent: an admin/marketing-approved AI generation for this
// property (Marketing Studio, contentType WHATSAPP) takes over completely
// when present — approving one there is supposed to actually change what
// every copy button in the app sends, not just sit in a list. Callers
// resolve this themselves (a single extra `marketingAssets` include) so
// this stays a pure function with no Prisma dependency of its own.
export function whatsAppMessage(p: Property, approvedContent?: string | null) {
  if (approvedContent) return approvedContent;
  const price = relevantAskingPrice(p);
  const size = primarySize(p);
  const features = p.featuresJson && typeof p.featuresJson === "object" ? Object.keys(p.featuresJson as object) : [];
  const lines = [
    saleHeader(p.transactionType),
    `*${p.title}*`,
    [p.subtype, size].filter(Boolean).join(" · "),
    "",
    price ? `💰 ${formatCurrency(price, p.currency)}${priceUnit(p)}${p.priceNegotiable ? " (negotiable)" : ""}` : undefined,
    [p.city, p.district].filter(Boolean).join(", ") ? `📍 ${[p.city, p.district].filter(Boolean).join(", ")}` : undefined,
    features.length ? `✨ ${features.map((f) => titleCase(f)).join(", ")}` : undefined,
    p.description ? `\n${p.description}` : undefined,
    "",
    DIVIDER,
    SIGNATURE,
  ].filter((l) => l !== undefined);
  return lines.join("\n");
}

// Same idea, for sharing a client's requirement — with a broker who might
// have matching inventory, or as a record of exactly what was promised.
export function whatsAppMessageForRequirement(r: Requirement) {
  const locations = Array.isArray(r.preferredLocationsJson) ? (r.preferredLocationsJson as string[]) : [];
  const budget =
    r.budgetMax && r.budgetMin
      ? `${formatCurrency(r.budgetMin)} to ${formatCurrency(r.budgetMax)}`
      : r.budgetMax
        ? `up to ${formatCurrency(r.budgetMax)}`
        : r.budgetMin
          ? `from ${formatCurrency(r.budgetMin)}`
          : undefined;
  const size = r.sizeMin && r.sizeMax ? `${r.sizeMin.toLocaleString()}-${r.sizeMax.toLocaleString()} sqft` : undefined;
  const lines = [
    "🔍 *PROPERTY WANTED*",
    `*${r.title}*`,
    [titleCase(r.category), titleCase(r.dealType)].filter(Boolean).join(" · "),
    "",
    budget ? `💰 Budget: ${budget}` : undefined,
    size ? `📐 Size: ${size}` : undefined,
    locations.length ? `📍 Preferred: ${locations.join(", ")}` : undefined,
    r.urgency ? `⏱ Urgency: ${titleCase(r.urgency)}` : undefined,
    r.intendedUse ? `\n${r.intendedUse}` : undefined,
    "",
    "Have something that fits? Get in touch.",
    "",
    DIVIDER,
    SIGNATURE,
  ].filter((l) => l !== undefined);
  return lines.join("\n");
}

export function primarySize(p: Pick<Property, "sizeSqft" | "sizePerches" | "sizeAcres" | "warehouseFloorSqft" | "builtUpSqft">) {
  if (p.warehouseFloorSqft) return `${p.warehouseFloorSqft.toLocaleString()} sqft`;
  if (p.sizeSqft) return `${p.sizeSqft.toLocaleString()} sqft`;
  if (p.builtUpSqft) return `${p.builtUpSqft.toLocaleString()} sqft built-up`;
  if (p.sizePerches) return `${p.sizePerches} perches`;
  if (p.sizeAcres) return `${p.sizeAcres} acres`;
  return null;
}
