import type { Property, Requirement } from "@/generated/prisma/client";
import { ALL_DISTRICTS, locationsMatch } from "@/lib/locations";

// Imperium matching engine — spec §6.
// Hard filters exclude a pairing outright; the weighted score only runs on
// survivors. Weights: location 30, budget 20, type 15, size 15, features 10,
// availability/urgency 5, freshness/verification 5.

export type MatchResult = {
  score: number;
  reasons: string[]; // positive factors, human readable
  gaps: string[]; // unmet / unconfirmed factors
  breakdown: { label: string; weight: number; earned: number }[];
};

function dealTypeMatchesTransaction(dealType: Requirement["dealType"], txn: Property["transactionType"]) {
  if (dealType === "BUY") return txn === "SALE" || txn === "INVESTMENT" || txn === "OFF_MARKET" || txn === "JOINT_VENTURE" || txn === "DEVELOPMENT";
  if (dealType === "RENT") return txn === "RENT" || txn === "SHORT_TERM_RENTAL";
  if (dealType === "LEASE") return txn === "LEASE";
  return false;
}

function relevantPrice(property: Property, dealType: Requirement["dealType"]): number | null {
  if (dealType === "BUY") return property.totalPrice ?? property.advertisedPrice ?? null;
  if (dealType === "RENT") return property.monthlyRental ?? null;
  if (dealType === "LEASE") return property.annualLeaseValue ?? null;
  return null;
}

function relevantSize(property: Property): number | null {
  return (
    property.sizeSqft ??
    property.builtUpSqft ??
    property.warehouseFloorSqft ??
    (property.sizePerches ? property.sizePerches * 272.25 : null) ??
    (property.sizeAcres ? property.sizeAcres * 43_560 : null) ??
    null
  );
}

function locationList(json: unknown): string[] {
  if (!Array.isArray(json)) return [];
  return json.filter((x): x is string => typeof x === "string").map((s) => s.toLowerCase());
}

function featureMap(json: unknown): Record<string, unknown> {
  if (!json || typeof json !== "object") return {};
  return json as Record<string, unknown>;
}

/**
 * Returns null when a hard filter excludes the pairing outright.
 */
export function scoreMatch(property: Property, requirement: Requirement): MatchResult | null {
  const reasons: string[] = [];
  const gaps: string[] = [];

  // --- Hard filters -----------------------------------------------------
  if (property.category !== requirement.category) return null;
  if (!dealTypeMatchesTransaction(requirement.dealType, property.transactionType)) return null;

  const price = relevantPrice(property, requirement.dealType);
  if (requirement.budgetMax != null && price != null && price > requirement.budgetMax * 1.05) return null;

  const size = relevantSize(property);
  if (requirement.sizeMin != null && size != null && size < requirement.sizeMin * 0.85) return null;

  const preferred = locationList(requirement.preferredLocationsJson);
  const surrounding = locationList(requirement.acceptableSurroundingJson);
  const propCity = (property.city ?? "").toLowerCase();
  const propDistrict = (property.district ?? "").toLowerCase();
  let locationHardOk = true;
  if (preferred.length > 0) {
    locationHardOk =
      preferred.some((l) => locationsMatch(l, propCity) || locationsMatch(l, propDistrict)) ||
      surrounding.some((l) => locationsMatch(l, propCity) || locationsMatch(l, propDistrict));
  }
  if (!locationHardOk) return null;

  // --- Weighted scoring ---------------------------------------------------
  const breakdown: MatchResult["breakdown"] = [];

  // Location — 30
  let locationScore = 0;
  if (preferred.length === 0) {
    locationScore = 18; // no stated preference — neutral-positive
    reasons.push("no strict location constraint");
  } else if (preferred.some((l) => locationsMatch(l, propCity))) {
    locationScore = 30;
    reasons.push(`located in preferred area (${property.city})`);
  } else if (preferred.some((l) => locationsMatch(l, propDistrict))) {
    locationScore = 24;
    reasons.push(`located in preferred district (${property.district})`);
  } else if (surrounding.some((l) => locationsMatch(l, propCity) || locationsMatch(l, propDistrict))) {
    locationScore = 16;
    reasons.push(`located in an acceptable surrounding area (${property.city ?? property.district})`);
  }
  breakdown.push({ label: "Location", weight: 30, earned: locationScore });

  // Budget — 20
  let budgetScore = 0;
  if (price == null) {
    budgetScore = 8;
    gaps.push("property price not confirmed");
  } else if (requirement.budgetMax == null && requirement.budgetMin == null) {
    budgetScore = 14;
  } else {
    const max = requirement.budgetMax ?? Infinity;
    const min = requirement.budgetMin ?? 0;
    if (price >= min && price <= max) {
      budgetScore = 20;
      reasons.push("within budget");
    } else if (price < min) {
      budgetScore = 16;
      reasons.push("below stated minimum budget (good value)");
    } else {
      const overagePct = (price - max) / max;
      budgetScore = Math.max(0, Math.round(20 * (1 - overagePct / 0.05)));
      gaps.push(`slightly above maximum budget (by ${(overagePct * 100).toFixed(0)}%)`);
    }
  }
  breakdown.push({ label: "Budget", weight: 20, earned: budgetScore });

  // Property type / subtype — 15
  let typeScore = 10; // category already guaranteed equal
  if (requirement.subtype && property.subtype) {
    if (requirement.subtype.toLowerCase() === property.subtype.toLowerCase()) {
      typeScore = 15;
      reasons.push(`correct property type (${property.subtype})`);
    } else {
      gaps.push(`subtype differs (requested ${requirement.subtype}, listed ${property.subtype})`);
    }
  } else {
    typeScore = 12;
  }
  breakdown.push({ label: "Property type", weight: 15, earned: typeScore });

  // Size — 15
  let sizeScore = 8;
  if (size == null) {
    sizeScore = 5;
    gaps.push("floor/land area not confirmed");
  } else if (requirement.sizeMin == null && requirement.sizeMax == null) {
    sizeScore = 12;
  } else {
    const min = requirement.sizeMin ?? 0;
    const max = requirement.sizeMax ?? Infinity;
    if (size >= min && size <= max) {
      sizeScore = 15;
      reasons.push("correct floor area for requirement");
    } else if (size > max) {
      const overagePct = (size - max) / max;
      sizeScore = Math.max(4, Math.round(15 * (1 - overagePct)));
      gaps.push("larger than requested size range");
    } else {
      const shortfallPct = (min - size) / min;
      sizeScore = Math.max(0, Math.round(15 * (1 - shortfallPct / 0.15)));
      gaps.push("slightly under requested minimum size");
    }
  }
  breakdown.push({ label: "Size", weight: 15, earned: sizeScore });

  // Required features — 10
  const required = featureMap(requirement.requiredFeaturesJson);
  const available = featureMap(property.featuresJson);
  const requiredKeys = Object.keys(required).filter((k) => required[k] === true || (typeof required[k] === "string" && required[k] !== ""));
  let featureScore = 10;
  if (requiredKeys.length > 0) {
    let matched = 0;
    const unmatchedNames: string[] = [];
    for (const key of requiredKeys) {
      const have = available[key];
      if (have === true || (typeof have === "string" && have.length > 0) || (typeof have === "number" && have > 0)) {
        matched++;
      } else {
        unmatchedNames.push(key);
      }
    }
    featureScore = Math.round((matched / requiredKeys.length) * 10);
    if (unmatchedNames.length > 0) {
      gaps.push(`${unmatchedNames.join(", ")} not confirmed`);
    }
    if (matched === requiredKeys.length) reasons.push("all required features confirmed");
  }
  breakdown.push({ label: "Required features", weight: 10, earned: featureScore });

  // Availability & urgency — 5
  let availScore = 3;
  if (property.listingStatus === "ACTIVE") {
    availScore = requirement.urgency === "CRITICAL" || requirement.urgency === "HIGH" ? 5 : 4;
    reasons.push("listing currently active");
  } else {
    gaps.push(`listing status is ${property.listingStatus.toLowerCase().replace("_", " ")}`);
    availScore = 1;
  }
  breakdown.push({ label: "Availability & urgency", weight: 5, earned: availScore });

  // Freshness & verification — 5
  let freshScore = 1;
  if (property.lastVerifiedDate) {
    const ageDays = (Date.now() - property.lastVerifiedDate.getTime()) / 86_400_000;
    if (ageDays <= 14) {
      freshScore = 5;
      reasons.push("recently verified listing");
    } else if (ageDays <= 30) {
      freshScore = 3;
    } else {
      freshScore = 1;
      gaps.push("listing not recently reverified");
    }
  } else {
    gaps.push("listing has never been verified");
  }
  if (property.legalVerificationStatus === "VERIFIED") freshScore = Math.min(5, freshScore + 0);
  breakdown.push({ label: "Freshness & verification", weight: 5, earned: freshScore });

  const score = Math.min(100, breakdown.reduce((sum, b) => sum + b.earned, 0));

  return { score: Math.round(score), reasons, gaps, breakdown };
}

export function explainMatch(result: MatchResult): string {
  const positives = result.reasons.slice(0, 3).join(", ");
  const gap = result.gaps[0];
  let sentence = `${result.score}% match`;
  if (positives) sentence += `: ${positives}`;
  if (gap) sentence += `. ${gap.charAt(0).toUpperCase() + gap.slice(1)}.`;
  else sentence += ".";
  return sentence;
}

export function isKnownDistrict(name: string) {
  return ALL_DISTRICTS.some((d) => d.toLowerCase() === name.toLowerCase());
}
