import type { Property } from "@/generated/prisma/client";
import { formatCurrency } from "@/lib/format";

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

export function relevantAskingPrice(p: Pick<Property, "transactionType" | "totalPrice" | "monthlyRental" | "annualLeaseValue" | "advertisedPrice">) {
  if (p.transactionType === "RENT" || p.transactionType === "SHORT_TERM_RENTAL") return p.monthlyRental ?? p.advertisedPrice;
  if (p.transactionType === "LEASE") return p.annualLeaseValue ?? p.advertisedPrice;
  return p.totalPrice ?? p.advertisedPrice;
}

export function priceUnit(p: Pick<Property, "transactionType">) {
  if (p.transactionType === "RENT" || p.transactionType === "SHORT_TERM_RENTAL") return "/month";
  if (p.transactionType === "LEASE") return "/year";
  return "";
}

export function whatsAppMessage(p: Property) {
  const price = relevantAskingPrice(p);
  const size = primarySize(p);
  const lines = [
    `*${p.title}*`,
    [p.subtype, size].filter(Boolean).join(" · "),
    price ? `${formatCurrency(price, p.currency)}${priceUnit(p)}${p.priceNegotiable ? " (negotiable)" : ""}` : undefined,
    [p.city, p.district].filter(Boolean).join(", "),
    "",
    "Imperium Realty · Property intelligence. Precisely matched.",
  ].filter(Boolean);
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
