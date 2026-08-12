import * as cheerio from "cheerio";
import { districtForCity } from "./locations";

// External Sourcing — spec: "connect to ikman.lk / LankaPropertyWeb to find
// properties and match them to requirements." Scoped deliberately narrow:
// this fetches ONE search results page or ONE listing page per explicit
// agent action (a click), never a background/scheduled crawl of the whole
// site. That's the difference between "an agent uses the site the way a
// browser would" and building a harvester — the latter risks the sites'
// Terms of Service and getting the agency's IP blocked, and isn't
// something to build silently. Selectors below were verified against the
// live sites, not guessed.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const ALLOWED_HOSTS = ["ikman.lk", "www.ikman.lk", "lankapropertyweb.com", "www.lankapropertyweb.com"];

async function fetchHtml(url: string, timeoutMs = 12000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export function isAllowedSourceUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return ALLOWED_HOSTS.includes(host);
  } catch {
    return false;
  }
}

export type SourcingResult = {
  source: "ikman" | "lankapropertyweb";
  title: string;
  price?: string;
  location?: string;
  size?: string;
  url: string;
  imgUrl?: string;
  postedAgo?: string;
  // Best-effort, parsed straight out of the fields above at fetch time —
  // neither site exposes these as separate structured search results
  // fields, so these are never authoritative, only good enough to filter
  // and display a badge with. See parseBedroomsFromTitle/parsePriceToNumber.
  bedrooms?: number;
};

// ---------------------------------------------------------------------------
// Filtering — both sites' own search only reliably narrows by keyword
// (LankaPropertyWeb also genuinely scopes district/property-type via its
// URL path; ikman's search endpoint does not reliably do either from a
// query string). Real accuracy comes from filtering the results we already
// parsed, in our own code, against fields we already have — not from
// guessing undocumented site query parameters.
// ---------------------------------------------------------------------------

export type SourcingFilters = {
  district?: string;
  propertyType?: string;
  priceMin?: number;
  priceMax?: number;
  bedrooms?: number;
  postedWithinDays?: number;
};

// "Rs. 25 Lakh", "Rs. 1.2 Million", "Rs. 145M" (LankaPropertyWeb's actual
// everyday format — confirmed live in UAT, not just "Million" spelled out),
// "Rs 25,000,000", "LKR 45,000" — the formats these two sites' price text
// actually takes.
//
// The number pattern requires a leading digit (`\d+`, not the old `[\d.]+`)
// — that old class included a bare "." as a valid match on its own, which
// meant it matched the period in the "Rs." prefix itself before ever
// reaching the real number, silently returning undefined for every "Rs. "
// price. Caught live: with priceMax set, "Rs. 145M" results (well over the
// cap) were still showing up because the filter thought the price hadn't
// parsed at all and kept it per the "never hide on failed parse" rule.
export function parsePriceToNumber(price: string | undefined): number | undefined {
  if (!price) return undefined;
  const cleaned = price.replace(/,/g, "");
  const match = cleaned.match(/(\d+(?:\.\d+)?)\s*(lakh|lakhs|million|mn|m\b|cr|crore)?/i);
  if (!match) return undefined;
  const n = Number(match[1]);
  if (Number.isNaN(n)) return undefined;
  const unit = match[2]?.toLowerCase();
  if (unit === "lakh" || unit === "lakhs") return n * 100_000;
  if (unit === "million" || unit === "mn" || unit === "m") return n * 1_000_000;
  if (unit === "cr" || unit === "crore") return n * 10_000_000;
  return n;
}

// Neither site's search-result markup carries a separate bedroom-count
// field — this is a best-effort read of the title text only, e.g. "3BR" /
// "3 bed" / "3 bedroom". Never trusted enough to drop a result that simply
// didn't mention it; only used to exclude a result that mentions a
// *different* bedroom count than what was asked for.
export function parseBedroomsFromTitle(title: string): number | undefined {
  const match = title.match(/(\d+)\s*[-\s]?(?:bed|bedroom|br)\b/i);
  if (!match) return undefined;
  const n = Number(match[1]);
  return Number.isNaN(n) ? undefined : n;
}

// "2 hours ago" / "3 days ago" / "1 week ago" / "2 months ago" → approx
// days, for the "posted within" filter. ikman only; LankaPropertyWeb's
// search results don't expose a posted date at all.
export function parsePostedAgoToDays(postedAgo: string | undefined): number | undefined {
  if (!postedAgo) return undefined;
  const match = postedAgo.match(/(\d+)\s*(hour|day|week|month)/i);
  if (!match) return undefined;
  const n = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === "hour") return n / 24;
  if (unit === "day") return n;
  if (unit === "week") return n * 7;
  if (unit === "month") return n * 30;
  return undefined;
}

// A result's location text is whatever the site itself printed — often a
// city ("Nugegoda"), not the district a user actually picked ("Colombo").
// A plain substring match would wrongly exclude a real match, so this also
// resolves each token through the app's own city→district table before
// giving up.
function locationMatchesDistrict(location: string | undefined, district: string): boolean {
  if (!location) return true; // no location text to check — best-effort, don't hide it over a parse gap
  const hay = location.toLowerCase();
  if (hay.includes(district.toLowerCase())) return true;
  const tokens = location.split(/[·,/\-]/).map((t) => t.trim()).filter(Boolean);
  return tokens.some((t) => districtForCity(t) === district);
}

export function applyFilters(results: SourcingResult[], filters: SourcingFilters): SourcingResult[] {
  return results.filter((r) => {
    if (filters.district && !locationMatchesDistrict(r.location, filters.district)) return false;
    if (filters.propertyType) {
      const hay = `${r.location ?? ""} ${r.title}`.toLowerCase();
      if (!hay.includes(filters.propertyType.toLowerCase())) return false;
    }
    if (filters.priceMin != null || filters.priceMax != null) {
      const price = parsePriceToNumber(r.price);
      if (price != null) {
        if (filters.priceMin != null && price < filters.priceMin) return false;
        if (filters.priceMax != null && price > filters.priceMax) return false;
      }
      // price didn't parse — keep it rather than hide a possibly-real match
    }
    if (filters.bedrooms != null) {
      const beds = r.bedrooms ?? parseBedroomsFromTitle(r.title);
      if (beds != null && beds !== filters.bedrooms) return false;
    }
    if (filters.postedWithinDays != null) {
      const days = parsePostedAgoToDays(r.postedAgo);
      if (days != null && days > filters.postedWithinDays) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// ikman.lk — search results embed a clean JSON state blob
// (`window.initialData…serp.ads.data.ads[]`), which is far more reliable
// than parsing the hashed CSS-module class names in the DOM.
// ---------------------------------------------------------------------------

function extractJsAssignment(html: string, marker: string): unknown | null {
  const start = html.indexOf(marker);
  if (start === -1) return null;
  let i = start;
  let depth = 0;
  let inStr = false;
  let esc = false;
  let objStart = -1;
  for (; i < html.length; i++) {
    const c = html[i];
    if (objStart === -1) {
      if (c === "{") {
        objStart = i;
        depth = 1;
      }
      continue;
    }
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  if (objStart === -1) return null;
  try {
    return JSON.parse(html.slice(objStart, i + 1));
  } catch {
    return null;
  }
}

export function buildIkmanSearchUrl(query: string) {
  return `https://ikman.lk/en/ads/sri-lanka/property?query=${encodeURIComponent(query)}`;
}

export async function searchIkman(query: string): Promise<SourcingResult[]> {
  const html = await fetchHtml(buildIkmanSearchUrl(query));
  const data = extractJsAssignment(html, "window.initialData = ") as
    | { serp?: { ads?: { data?: { ads?: Array<Record<string, unknown>> } } } }
    | null;
  const ads = data?.serp?.ads?.data?.ads ?? [];
  return ads.slice(0, 20).map((ad) => {
    const title = String(ad.title ?? "");
    return {
      source: "ikman" as const,
      title,
      price: ad.price ? String(ad.price) : undefined,
      location: [ad.location, (ad.category as { name?: string } | undefined)?.name].filter(Boolean).join(" · ") || undefined,
      size: ad.details ? String(ad.details) : undefined,
      url: `https://ikman.lk/en/ad/${ad.slug}`,
      imgUrl: ad.imgUrl ? String(ad.imgUrl) : undefined,
      postedAgo: ad.timeStamp ? String(ad.timeStamp) : undefined,
      bedrooms: parseBedroomsFromTitle(title),
    };
  });
}

// ---------------------------------------------------------------------------
// LankaPropertyWeb — plain server-rendered HTML with stable semantic class
// names (no CSS-module hashing), so a real DOM parse (cheerio) works well.
// ---------------------------------------------------------------------------

const LPW_TYPE_SLUG: Record<string, string> = {
  House: "House",
  Apartment: "Apartment",
  "Luxury Residence": "House",
  Villa: "House",
  Commercial: "Commercial",
  Office: "Commercial",
  "Retail Space": "Commercial",
  Land: "Bare+land",
  "Residential Land": "Bare+land",
  Warehouse: "Warehouse",
};

export function buildLpwSearchUrl(opts: { dealType: "BUY" | "RENT" | "LEASE"; district?: string; propertyType?: string }) {
  const type = LPW_TYPE_SLUG[opts.propertyType ?? ""] ?? "All";
  const loc = opts.district ? `${opts.district}+All_0` : "all";
  if (opts.dealType === "RENT" || opts.dealType === "LEASE") {
    return `https://www.lankapropertyweb.com/rentals/lease-${loc}-${type}.html`;
  }
  return `https://www.lankapropertyweb.com/forsale-${loc}-${type}.html`;
}

export async function searchLankaPropertyWeb(opts: { dealType: "BUY" | "RENT" | "LEASE"; district?: string; propertyType?: string }): Promise<SourcingResult[]> {
  const html = await fetchHtml(buildLpwSearchUrl(opts));
  const $ = cheerio.load(html);
  const results: SourcingResult[] = [];

  $("article.listing-item").each((_, el) => {
    const $el = $(el);
    const href = $el.find("a.listing-header").attr("href") ?? $el.find(".listing-title a").attr("href");
    if (!href) return;
    const title = $el.find(".listing-title a").text().trim();
    const price = $el.find(".listing-price").first().text().trim().replace(/\s+/g, " ");
    const location = $el.find(".listing-header .location").text().trim() || $el.find(".listing-address").text().trim();
    const sizeText = $el.find(".listing-summery .unit").first().text().trim();
    const sizeCount = $el.find(".listing-summery .count").eq(1).text().trim();
    const img = $el.find("img").attr("data-src") ?? $el.find("img").attr("src");
    if (!title) return;
    results.push({
      source: "lankapropertyweb",
      title,
      price: price || undefined,
      location: location || undefined,
      size: sizeCount ? `${sizeCount} ${sizeText}` : undefined,
      bedrooms: parseBedroomsFromTitle(title),
      url: href.startsWith("http") ? href : `https://www.lankapropertyweb.com${href}`,
      imgUrl: img && img.startsWith("http") ? img : undefined,
    });
  });

  return results.slice(0, 20);
}

// ---------------------------------------------------------------------------
// Fetch one specific listing page and reduce it to plain text for AI
// Intake — same extraction pipeline as pasted text, just sourced by URL.
// ---------------------------------------------------------------------------

export async function fetchListingText(url: string): Promise<{ text: string; imgUrl?: string }> {
  if (!isAllowedSourceUrl(url)) throw new Error("Only ikman.lk and lankapropertyweb.com listing links are supported.");
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  $("script, style, nav, header, footer, svg").remove();

  let imgUrl: string | undefined;
  if (url.includes("ikman.lk")) {
    // Verified against a live listing page — window.initialData.adDetail.data.ad
    // carries title/description/location/money plus a public contactCard
    // (name + phone) shown on the page for exactly this purpose.
    const data = extractJsAssignment(html, "window.initialData = ") as
      | { adDetail?: { data?: { ad?: Record<string, unknown> } } }
      | null;
    const ad = data?.adDetail?.data?.ad;
    if (ad) {
      const images = ad.images as { meta?: { src?: string }[] } | undefined;
      imgUrl = images?.meta?.[0]?.src;
      const title = String(ad.title ?? "");
      const money = ad.money as { label?: string; amount?: string } | undefined;
      const price = money ? `${money.label ?? "Price"}: ${money.amount ?? ""}` : "";
      const description = String(ad.description ?? "");
      const location = String((ad.location as { name?: string } | undefined)?.name ?? "");
      const contact = ad.contactCard as { name?: string; phoneNumbers?: { number?: string }[] } | undefined;
      const posterName = contact?.name ?? "";
      const phone = contact?.phoneNumbers?.[0]?.number ?? "";
      const text = [title, price, location, description, posterName && `Posted by: ${posterName}`, phone && `Phone: ${phone}`].filter(Boolean).join("\n");
      if (text.trim()) return { text, imgUrl };
    }
  }

  // Fallback / LankaPropertyWeb: reduce the main content area to text.
  const main = $("main, .property-details, .listing-detail, body").first();
  const text = main
    .text()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 6000);
  return { text, imgUrl };
}

// Sri Lankan mobile/landline formats as they actually appear in listing
// text: +9471..., 071..., 011-2345678, with optional spaces/dashes.
const SL_PHONE_RE = /(?:\+94|0)\s?(?:\d[\s-]?){9}/;

// For "save this listing's poster as a contact" — a lighter, separate path
// from fetchListingText/AI Intake (that one folds contact info into a text
// blob for the LLM; this pulls it out as structured fields for a small
// editable form). ikman exposes a real contactCard (name + phone) in its
// JSON state, so that path is reliable; LankaPropertyWeb's markup has no
// equivalent structured element, so only a best-effort phone regex is
// attempted there and name is left for the human to fill in.
export async function extractPosterContact(url: string): Promise<{ name?: string; phone?: string }> {
  if (!isAllowedSourceUrl(url)) throw new Error("Only ikman.lk and lankapropertyweb.com listing links are supported.");
  const html = await fetchHtml(url);

  if (url.includes("ikman.lk")) {
    const data = extractJsAssignment(html, "window.initialData = ") as
      | { adDetail?: { data?: { ad?: Record<string, unknown> } } }
      | null;
    const ad = data?.adDetail?.data?.ad;
    const contact = ad?.contactCard as { name?: string; phoneNumbers?: { number?: string }[] } | undefined;
    if (contact?.name || contact?.phoneNumbers?.[0]?.number) {
      return { name: contact?.name, phone: contact?.phoneNumbers?.[0]?.number };
    }
  }

  const $ = cheerio.load(html);
  $("script, style, nav, header, footer, svg").remove();
  const bodyText = $("body").text();
  const phoneMatch = bodyText.match(SL_PHONE_RE);
  return { phone: phoneMatch?.[0]?.replace(/[\s-]/g, "") };
}
