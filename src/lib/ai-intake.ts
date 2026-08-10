import { groqJson, groqConfigured } from "@/lib/groq";
import { prisma } from "@/lib/prisma";
import { ALL_CITIES, ALL_DISTRICTS, PROPERTY_SUBTYPES, districtForCity } from "@/lib/locations";
import type { Draft, DuplicateHint, IntakeResult, PropertyDraftFields, RequirementDraftFields } from "@/lib/intake-types";

type IntakeMode = "PROPERTY" | "REQUIREMENT" | "AUTO" | "UPDATE";

// ---------------------------------------------------------------------------
// Groq (LLM) extraction path
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are the extraction engine for Imperium Realty OS, a Sri Lankan real estate CRM.
You convert raw pasted text (WhatsApp conversations, emails, notes) into structured draft records.

Rules:
- Separate the input into distinct people/opportunities. One message can contain multiple properties or requirements.
- Classify each item as "property" (someone offering/listing a property) or "requirement" (someone looking for one).
- Convert all sizes to a consistent unit where possible but keep the original number if unsure.
- Sri Lankan currency is LKR. "lakhs" = 100,000. "Cr"/"crore" = 10,000,000. "mn"/"million" = 1,000,000.
- Detect sale vs rent vs lease intent from context.
- Give an overall confidence (0-100) per draft, and a per-field confidence (0-100) in "fieldConfidence".
- List "missingFields": important fields that are genuinely absent from the source and should be confirmed with the client — not fields you simply chose not to fill.
- Extract a short "sourceExcerpt" — the portion of the input this draft was derived from.

DO NOT LOSE INFORMATION. This is the most important rule and overrides brevity:
- "If a field is missing or uncertain, omit it — do not invent data" applies ONLY to the named structured fields (city, price, bedrooms, etc.) — never fabricate a number or fact that wasn't stated. It does NOT mean discarding real information the source text actually contains just because it doesn't fit one of those named fields.
- Every concrete fact mentioned in the source text must end up somewhere in the draft: in a named field if there's a match, in "features"/"requiredFeatures" if it's a property detail without its own field, or in "description"/"notes" otherwise. Nothing gets silently dropped.
- "description" (property) and "notes" (requirement) must be a complete, faithful rewrite of everything in the source text relevant to that item — reworded for clarity, never shortened into a summary. Keep every condition, nuance, timing detail, negotiation term, and specific circumstance the source mentions (e.g. "flexible on move-in date", "seller relocating end of month", "prefers tenants without pets", "price includes furniture", a second phone number, a specific unit/floor).
- If some context in the source applies to more than one item (a shared instruction, or a detail mentioned once but relevant to several listings/requirements in the same message), include it in every draft it applies to rather than only the first.
- "features"/"requiredFeatures" values: use \`true\` for a plain yes/no amenity ("pool": true). Use a string or number when the source gives a specific detail worth keeping ("parkingSpaces": 3, "furnishing": "semi-furnished", "floor": "3rd floor") instead of dropping that specificity down to a boolean.
- If more than one phone number is given for the same person, put the clearest/primary one in ownerPhone/clientPhone and any other number(s) in "alternatePhone" (comma-separated if there's more than one) — never drop a phone number just because there's already one in the structured field.

Return strict JSON only, matching this shape:
{
  "drafts": [
    {
      "kind": "property" | "requirement",
      "sourceExcerpt": string,
      "confidence": number,
      "fieldConfidence": { [field: string]: number },
      "missingFields": string[],
      "suggestedFollowUp": string,
      "fields": {
        // for kind=property:
        "title": string, "ownerName": string, "ownerPhone": string, "alternatePhone": string,
        "category": "RESIDENTIAL"|"COMMERCIAL"|"INDUSTRIAL_LOGISTICS"|"LAND_AGRICULTURE",
        "subtype": string, "transactionType": "SALE"|"RENT"|"LEASE"|"SHORT_TERM_RENTAL"|"INVESTMENT"|"JOINT_VENTURE"|"DEVELOPMENT"|"OFF_MARKET",
        "city": string, "district": string, "address": string,
        "sizeSqft": number, "sizePerches": number, "sizeAcres": number,
        "totalPrice": number, "monthlyRental": number, "annualLeaseValue": number, "currency": "LKR",
        "bedrooms": number, "bathrooms": number, "floors": number, "priceNegotiable": boolean, "landmark": string,
        "features": { [key: string]: boolean | string | number }, "description": string
        // for kind=requirement:
        "clientName": string, "clientPhone": string, "alternatePhone": string, "title": string,
        "dealType": "BUY"|"RENT"|"LEASE",
        "category": "RESIDENTIAL"|"COMMERCIAL"|"INDUSTRIAL_LOGISTICS"|"LAND_AGRICULTURE", "subtype": string,
        "locations": string[], "sizeMin": number, "sizeMax": number,
        "budgetMin": number, "budgetMax": number,
        "requiredFeatures": { [key: string]: boolean | string | number }, "urgency": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL",
        "intendedUse": string, "notes": string
      }
    }
  ]
}`;

async function extractWithGroq(rawText: string, mode: IntakeMode): Promise<Draft[] | null> {
  const modeHint =
    mode === "PROPERTY"
      ? "Treat every item as a PROPERTY listing, even if phrased ambiguously."
      : mode === "REQUIREMENT"
        ? "Treat every item as a REQUIREMENT (someone searching), even if phrased ambiguously."
        : "Auto-detect whether each item is a property or a requirement.";

  const result = await groqJson<{ drafts: Array<Record<string, unknown>> }>(
    SYSTEM_PROMPT,
    `${modeHint}\n\nInput text:\n"""\n${rawText}\n"""`,
  );
  if (!result?.drafts?.length) return null;

  return result.drafts.map((d, i) => ({
    id: `draft-${Date.now()}-${i}`,
    kind: d.kind === "requirement" ? "requirement" : "property",
    sourceExcerpt: String(d.sourceExcerpt ?? rawText.slice(0, 200)),
    confidence: clampConfidence(d.confidence),
    fieldConfidence: (d.fieldConfidence as Record<string, number>) ?? {},
    fields: (d.fields as PropertyDraftFields | RequirementDraftFields) ?? {},
    missingFields: Array.isArray(d.missingFields) ? (d.missingFields as string[]) : [],
    suggestedFollowUp: typeof d.suggestedFollowUp === "string" ? d.suggestedFollowUp : undefined,
    duplicates: [],
  }));
}

function clampConfidence(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(n)) return 60;
  return Math.max(0, Math.min(100, Math.round(n)));
}

// ---------------------------------------------------------------------------
// Heuristic (offline, no API key) extraction path
// ---------------------------------------------------------------------------

const PHONE_RE = /(?:\+94[\s-]?|0)(?:\d[\s-]?){9}/g;
const SIZE_RE = /(\d[\d,]*(?:\.\d+)?)\s*(?:(?:-|–|to)\s*(\d[\d,]*(?:\.\d+)?))?\s*(sq\s?\.?\s?ft|sqft|square\s?feet|perch(?:es)?|acres?|sq\s?\.?\s?m|square\s?met(?:er|re)s?)/gi;
const PRICE_RE = /(?:rs\.?|lkr)\s?([\d,]+(?:\.\d+)?)\s*(cr|crore|mn|million|lakh|lakhs|l|k)?|([\d,]+(?:\.\d+)?)\s*(cr|crore|mn|million|lakh|lakhs)\b/gi;

const RENT_KEYWORDS = ["rent", "rental", "for rent", "to let", "monthly"];
const LEASE_KEYWORDS = ["lease", "leasing"];
const SALE_KEYWORDS = ["sale", "for sale", "selling", "sell"];
const REQUIREMENT_KEYWORDS = ["needs", "need", "looking for", "requirement", "wanted", "searching for", "require", "wants", "client is looking", "buyer looking", "tenant looking"];
const PROPERTY_KEYWORDS = ["selling", "for sale", "available", "to let", "offering", "owner", "asking", "listing", "for rent", "vacant", "up for", "on the market"];
const URGENCY_HIGH = ["urgent", "asap", "immediately", "this week"];

function parsePhone(text: string): string | undefined {
  const m = text.match(PHONE_RE);
  if (!m) return undefined;
  let phone = m[0].replace(/[\s-]/g, "");
  if (phone.startsWith("0")) phone = "+94" + phone.slice(1);
  return phone;
}

function unitToSqft(value: number, unit: string): { sqft?: number; perches?: number; acres?: number } {
  const u = unit.toLowerCase().replace(/\s|\./g, "");
  if (u.startsWith("perch")) return { perches: value, sqft: Math.round(value * 272.25) };
  if (u.startsWith("acre")) return { acres: value, sqft: Math.round(value * 43_560) };
  if (u.startsWith("sqm") || u.includes("metre") || u.includes("meter")) return { sqft: Math.round(value * 10.7639) };
  return { sqft: value };
}

function parseSize(text: string) {
  SIZE_RE.lastIndex = 0;
  const m = SIZE_RE.exec(text);
  if (!m) return {};
  const min = Number(m[1].replace(/,/g, ""));
  const max = m[2] ? Number(m[2].replace(/,/g, "")) : min;
  const unit = m[3];
  const lo = unitToSqft(min, unit);
  const hi = unitToSqft(max, unit);
  return { min: lo, max: hi };
}

function priceMultiplier(unit?: string): number {
  if (!unit) return 1;
  const u = unit.toLowerCase();
  if (u === "cr" || u === "crore") return 10_000_000;
  if (u === "mn" || u === "million") return 1_000_000;
  if (u === "lakh" || u === "lakhs" || u === "l") return 100_000;
  if (u === "k") return 1_000;
  return 1;
}

function parsePrice(text: string): number | undefined {
  PRICE_RE.lastIndex = 0;
  const m = PRICE_RE.exec(text);
  if (!m) return undefined;
  const numStr = m[1] ?? m[3];
  const unit = m[2] ?? m[4];
  if (!numStr) return undefined;
  const base = Number(numStr.replace(/,/g, ""));
  return Math.round(base * priceMultiplier(unit));
}

function findLocations(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const city of ALL_CITIES) {
    // Combined entries like "Colombo 5 (Havelock Town)" rarely appear
    // verbatim in real text — match either half, but record the full
    // canonical name so the resulting draft still shows both.
    const paren = city.match(/^(.+?)\s*\((.+)\)$/);
    const candidates = paren ? [paren[1].trim(), paren[2].trim()] : [city];
    if (candidates.some((c) => includesWord(lower, c))) found.add(city);
  }
  for (const district of ALL_DISTRICTS) {
    if (includesWord(lower, district)) found.add(district);
  }
  return Array.from(found);
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesWord(haystackLower: string, needle: string) {
  return new RegExp(`\\b${escapeRegex(needle.toLowerCase())}\\b`).test(haystackLower);
}

function guessCategoryAndSubtype(text: string): { category: PropertyDraftFields["category"]; subtype?: string } {
  const lower = text.toLowerCase();
  // Check multi-word / more specific subtypes first so e.g. "warehouse" doesn't
  // get shadowed by a shorter unrelated match, and so substrings like "house"
  // inside "warehouse" never collide (word-boundary matched, not substring).
  const ordered = Object.entries(PROPERTY_SUBTYPES).flatMap(([category, subtypes]) => subtypes.map((s) => [category, s] as const)).sort((a, b) => b[1].length - a[1].length);
  for (const [category, subtype] of ordered) {
    if (includesWord(lower, subtype)) {
      return { category: category as PropertyDraftFields["category"], subtype };
    }
  }
  if (/warehouse|factory|cold storage|logistics|industrial/i.test(text)) return { category: "INDUSTRIAL_LOGISTICS", subtype: "Warehouse" };
  if (/land|perch(es)?|acre/i.test(text) && !/house|apartment|office/i.test(text)) return { category: "LAND_AGRICULTURE", subtype: "Residential Land" };
  if (/office|retail|showroom|hotel|guesthouse|commercial/i.test(text)) return { category: "COMMERCIAL", subtype: "Office" };
  return { category: "RESIDENTIAL", subtype: "House" };
}

function guessTransactionType(text: string): PropertyDraftFields["transactionType"] {
  const lower = text.toLowerCase();
  if (LEASE_KEYWORDS.some((k) => lower.includes(k))) return "LEASE";
  if (RENT_KEYWORDS.some((k) => lower.includes(k))) return "RENT";
  if (SALE_KEYWORDS.some((k) => lower.includes(k))) return "SALE";
  return "SALE";
}

function guessDealType(text: string): RequirementDraftFields["dealType"] {
  const lower = text.toLowerCase();
  if (LEASE_KEYWORDS.some((k) => lower.includes(k))) return "LEASE";
  if (RENT_KEYWORDS.some((k) => lower.includes(k))) return "RENT";
  return "BUY";
}

const NAME_STOPWORDS = new Set([
  "selling", "available", "renting", "urgent", "looking", "need", "needs", "wanted", "warehouse", "contact", "call",
  "owner", "modern", "beautiful", "spacious", "luxury", "hi", "hello", "the", "for", "rent", "sale", "lease", "buyer",
  "tenant", "client", "requirement", "property", "house", "apartment", "office", "land", "attn",
]);

function isLikelyName(candidate: string) {
  return candidate.split(" ").every((w) => !NAME_STOPWORDS.has(w.toLowerCase()));
}

function guessName(text: string): string | undefined {
  // "Posted by: <Name>" — from an externally-sourced listing (ikman.lk /
  // LankaPropertyWeb), highest confidence since it's the site's own
  // structured poster field, not inferred from prose.
  const postedMatch = text.match(/posted by:?\s+([A-Z][a-zA-Z']+(?:\s[A-Z][a-zA-Z']+)?)/i);
  if (postedMatch && isLikelyName(postedMatch[1])) return postedMatch[1];

  // "Owner <Name>", "Owner: <Name>", "Owner - <Name>" — highest confidence.
  const ownerMatch = text.match(/owner[:\-\s]+([A-Z][a-zA-Z']+(?:\s[A-Z][a-zA-Z']+)?)/i);
  if (ownerMatch && isLikelyName(ownerMatch[1])) return ownerMatch[1];

  // "Contact / call / ask for <Name>"
  const contactMatch = text.match(/(?:contact|call|ask for|attn:?)\s+([A-Z][a-zA-Z']{1,20})/i);
  if (contactMatch && isLikelyName(contactMatch[1])) return contactMatch[1];

  // Leading capitalised word(s), skipping known non-name openers.
  const leading = text.match(/^([A-Z][a-zA-Z']{1,20}(?:\s[A-Z][a-zA-Z']{1,20})?)\b/);
  if (leading && isLikelyName(leading[1])) return leading[1];

  return undefined;
}

function guessFeatures(text: string): Record<string, boolean> {
  const lower = text.toLowerCase();
  const flags: Record<string, boolean> = {};
  const map: Record<string, RegExp> = {
    containerAccess: /container access/,
    threePhaseElectricity: /three.?phase/,
    generator: /generator/,
    parking: /parking/,
    security: /24.?hour security|security/,
    swimmingPool: /(swimming )?pool/,
    seaView: /sea view/,
    furnished: /furnished/,
    airConditioned: /a\/?c\b|air.?condition/,
  };
  for (const [key, re] of Object.entries(map)) {
    if (re.test(lower)) flags[key] = true;
  }
  return flags;
}

function guessUrgency(text: string): RequirementDraftFields["urgency"] {
  const lower = text.toLowerCase();
  if (URGENCY_HIGH.some((k) => lower.includes(k))) return "HIGH";
  return "MEDIUM";
}

function splitIntoChunks(rawText: string): string[] {
  const byBlankLine = rawText
    .split(/\n\s*\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (byBlankLine.length > 1) return byBlankLine;

  // Fall back to splitting wherever a new phone number starts a sentence-ish boundary.
  const phoneMatches = [...rawText.matchAll(PHONE_RE)];
  if (phoneMatches.length > 1) {
    const chunks: string[] = [];
    let cursor = 0;
    for (let i = 0; i < phoneMatches.length; i++) {
      const end = i + 1 < phoneMatches.length ? phoneMatches[i + 1].index! : rawText.length;
      chunks.push(rawText.slice(cursor, end).trim());
      cursor = end;
    }
    return chunks.filter(Boolean);
  }
  return [rawText.trim()];
}

function extractWithHeuristics(rawText: string, mode: IntakeMode): Draft[] {
  const chunks = splitIntoChunks(rawText);

  return chunks.map((chunk, i) => {
    const chunkLower = chunk.toLowerCase();
    const requirementScore = REQUIREMENT_KEYWORDS.filter((k) => chunkLower.includes(k)).length;
    const propertyScore = PROPERTY_KEYWORDS.filter((k) => chunkLower.includes(k)).length;
    // Default to "property" on a tie — intake volume skews toward listings
    // being offered, and a false "requirement" classification is more
    // disruptive (creates a phantom buyer) than the reverse.
    const isRequirement = mode === "REQUIREMENT" || (mode === "AUTO" && requirementScore > propertyScore);
    const kind: Draft["kind"] = mode === "PROPERTY" ? "property" : mode === "REQUIREMENT" ? "requirement" : isRequirement ? "requirement" : "property";

    const phone = parsePhone(chunk);
    const name = guessName(chunk);
    const { category, subtype } = guessCategoryAndSubtype(chunk);
    const locations = findLocations(chunk);
    const size = parseSize(chunk);
    const price = parsePrice(chunk);
    const features = guessFeatures(chunk);

    let fields: PropertyDraftFields | RequirementDraftFields;
    const missingFields: string[] = [];
    const fieldConfidence: Record<string, number> = {};
    let hits = 0;
    let possible = 0;

    if (kind === "property") {
      const transactionType = guessTransactionType(chunk);
      fields = {
        title: subtype && locations[0] ? `${subtype} for ${transactionType === "RENT" ? "rent" : transactionType === "LEASE" ? "lease" : "sale"} in ${locations[0]}` : undefined,
        ownerName: name,
        ownerPhone: phone,
        category,
        subtype,
        transactionType,
        city: locations[0],
        district: locations[0] ? districtForCity(locations[0]) ?? (ALL_DISTRICTS.includes(locations[0]) ? locations[0] : undefined) : undefined,
        sizeSqft: size.max?.sqft,
        sizePerches: size.max?.perches,
        sizeAcres: size.max?.acres,
        totalPrice: transactionType === "SALE" ? price : undefined,
        monthlyRental: transactionType === "RENT" ? price : undefined,
        annualLeaseValue: transactionType === "LEASE" ? price : undefined,
        currency: "LKR",
        features: Object.keys(features).length ? features : undefined,
        description: chunk,
      } satisfies PropertyDraftFields;

      possible = 7;
      for (const v of Object.values({ ownerPhone: phone, city: locations[0], subtype, price: price, size: size.max?.sqft ?? size.max?.perches })) {
        if (v) hits++;
      }
      if (!phone) missingFields.push("owner phone");
      if (!price) missingFields.push("price");
      if (!locations[0]) missingFields.push("location");
      if (!size.max) missingFields.push("size");
      if (!name) missingFields.push("owner name");

      fieldConfidence.ownerPhone = phone ? 90 : 0;
      fieldConfidence.city = locations[0] ? 85 : 0;
      fieldConfidence.subtype = subtype ? 70 : 0;
      fieldConfidence.totalPrice = price ? 80 : 0;
      fieldConfidence.sizeSqft = size.max ? 75 : 0;
    } else {
      const dealType = guessDealType(chunk);
      fields = {
        clientName: name,
        clientPhone: phone,
        title: `${subtype ?? titleCaseWord(category ?? "Property")} for ${dealType === "RENT" ? "rent" : dealType === "LEASE" ? "lease" : "purchase"}`,
        dealType,
        category,
        subtype,
        locations,
        sizeMin: size.min?.sqft,
        sizeMax: size.max?.sqft,
        budgetMax: price,
        requiredFeatures: Object.keys(features).length ? features : undefined,
        urgency: guessUrgency(chunk),
        notes: chunk,
      } satisfies RequirementDraftFields;

      possible = 6;
      for (const v of [phone, locations.length > 0, subtype, price, size.max?.sqft]) {
        if (v) hits++;
      }
      if (!phone) missingFields.push("client phone");
      if (!price) missingFields.push("budget");
      if (locations.length === 0) missingFields.push("preferred locations");
      if (!size.max) missingFields.push("size range");
      if (!name) missingFields.push("client name");

      fieldConfidence.clientPhone = phone ? 90 : 0;
      fieldConfidence.locations = locations.length ? 85 : 0;
      fieldConfidence.subtype = subtype ? 65 : 0;
      fieldConfidence.budgetMax = price ? 75 : 30;
      fieldConfidence.sizeMax = size.max ? 75 : 0;
    }

    const confidence = Math.round(30 + (hits / Math.max(1, possible)) * 65);

    return {
      id: `draft-${Date.now()}-${i}`,
      kind,
      sourceExcerpt: chunk.length > 280 ? chunk.slice(0, 280) + "…" : chunk,
      confidence: clampConfidence(confidence),
      fieldConfidence,
      fields,
      missingFields,
      suggestedFollowUp: missingFields.length ? `Confirm ${missingFields.join(", ")}` : undefined,
      duplicates: [],
    } satisfies Draft;
  });
}

function titleCaseWord(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// Duplicate detection (runs regardless of engine)
// ---------------------------------------------------------------------------

async function attachDuplicateHints(drafts: Draft[]): Promise<Draft[]> {
  const out: Draft[] = [];
  for (const draft of drafts) {
    const duplicates: DuplicateHint[] = [];
    const phone = draft.kind === "property" ? (draft.fields as PropertyDraftFields).ownerPhone : (draft.fields as RequirementDraftFields).clientPhone;

    if (phone) {
      const contact = await prisma.contact.findFirst({ where: { OR: [{ phone }, { whatsapp: phone }] } });
      if (contact) {
        duplicates.push({
          type: "contact",
          id: contact.id,
          ref: contact.contactRef,
          label: `${contact.name}`.trim(),
          reason: "matching phone number already in contacts",
        });
      }
    }

    if (draft.kind === "property") {
      const f = draft.fields as PropertyDraftFields;
      if (f.city && f.subtype) {
        const similar = await prisma.property.findMany({
          where: { city: f.city, subtype: f.subtype },
          take: 3,
          orderBy: { createdAt: "desc" },
        });
        for (const p of similar) {
          duplicates.push({
            type: "property",
            id: p.id,
            ref: p.propertyRef,
            label: p.title,
            reason: `same city (${f.city}) and subtype (${f.subtype})`,
          });
        }
      }
    } else {
      const f = draft.fields as RequirementDraftFields;
      if (f.category) {
        const similar = await prisma.requirement.findMany({
          where: { category: f.category, dealType: f.dealType },
          take: 3,
          orderBy: { createdAt: "desc" },
          include: { client: true },
        });
        for (const r of similar) {
          if (phone && r.client.phone === phone) continue; // already flagged as contact dup
          duplicates.push({
            type: "requirement",
            id: r.id,
            ref: r.requirementRef,
            label: r.title,
            reason: `same category and deal type, client ${r.client.name}`,
          });
        }
      }
    }

    out.push({ ...draft, duplicates });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function runAiIntake(rawText: string, mode: IntakeMode): Promise<IntakeResult> {
  let drafts: Draft[] | null = null;
  let engine: IntakeResult["engine"] = "heuristic";

  if (groqConfigured()) {
    drafts = await extractWithGroq(rawText, mode);
    if (drafts) engine = "groq";
  }
  if (!drafts) {
    drafts = extractWithHeuristics(rawText, mode);
    engine = "heuristic";
  }

  drafts = await attachDuplicateHints(drafts);
  return { engine, drafts };
}
