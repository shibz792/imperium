import * as cheerio from "cheerio";
import { districtForCity, locationAliases } from "./locations";

// External Sourcing — spec: "connect to ikman.lk / LankaPropertyWeb to find
// properties and match them to requirements." Scoped deliberately narrow:
// this fetches ONE search results page or ONE listing page per explicit
// agent action (a click), never a background/scheduled crawl of the whole
// site. That's the difference between "an agent uses the site the way a
// browser would" and building a harvester — the latter risks the sites'
// Terms of Service and getting the agency's IP blocked, and isn't
// something to build silently. Selectors and URL routing below were
// reverse-engineered against the live sites (fetching real category trees,
// real internal cross-links, real filter counts), not guessed — see the
// category-routing tables further down for what was actually verified.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const ALLOWED_HOSTS = ["ikman.lk", "www.ikman.lk", "lankapropertyweb.com", "www.lankapropertyweb.com"];

async function fetchHtml(url: string, timeoutMs = 12000): Promise<{ html: string; ok: boolean; status: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: controller.signal, cache: "no-store" });
    return { html: res.ok ? await res.text() : "", ok: res.ok, status: res.status };
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
  // Ground-truth structured fields, populated only for ikman (its search
  // JSON carries them directly — see searchIkman). When present, applyFilters
  // trusts these over any text guess; when absent (LankaPropertyWeb), the
  // URL routing chosen in buildLpwSearchUrl is what carries the accuracy
  // instead, since there's no per-result structured field to fall back on.
  category?: string;
  adType?: "for_sale" | "to_buy" | "for_rent" | "to_rent";
};

// ---------------------------------------------------------------------------
// Filtering — real accuracy comes from two layers, not one: (1) requesting
// the most precisely-scoped URL each site actually supports (see the
// category-routing tables below — this is the fix for "pulling everything",
// most of which came from ikman's search being hit with only a free-text
// query against a broad umbrella category, no district/type/deal-type
// scoping in the request at all), and (2) filtering the results we already
// parsed, in our own code, against fields we already have, as a safety net
// for whatever the URL alone can't guarantee (e.g. LankaPropertyWeb has no
// per-district URL outside Colombo — see buildLpwSearchUrl).
// ---------------------------------------------------------------------------

export type SourcingFilters = {
  district?: string;
  // A district is one of this app's fixed 20; a city/area is free text
  // ("Nugegoda", "Colombo 7") checked only against the location field, not
  // the whole title — narrower and more literal than typing the same word
  // into Keyword, which also matches anywhere in the title.
  city?: string;
  dealType?: "BUY" | "RENT" | "LEASE";
  keyword?: string;
  priceMin?: number;
  priceMax?: number;
  sizeMin?: number;
  sizeMax?: number;
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

// LankaPropertyWeb's own "size" text ("3500 sqft", "10 Perches", "1.5
// Acres") — converted to a common sqft basis so a single min/max filter
// can compare across whatever unit a given listing happened to use.
// ikman's search summary never carries a floor/land size at all (its
// "size" field is really the bedroom/bathroom count text — see
// mapIkmanAd) — this simply returns undefined for that, and the filter
// below keeps such a result rather than penalizing it for a field ikman
// never gave it a chance to report.
const SQFT_PER_PERCH = 272.25;
const SQFT_PER_ACRE = 43_560;
const SQFT_PER_SQM = 10.7639;

export function parseSizeToSqft(size: string | undefined): number | undefined {
  if (!size) return undefined;
  const cleaned = size.replace(/,/g, "");
  const match = cleaned.match(/(\d+(?:\.\d+)?)\s*(sq\.?\s?ft|sqft|square\s?feet|perch(?:es)?|acre(?:s)?|sq\.?\s?m\b|sqm|square\s?met(?:er|re)s?)/i);
  if (!match) return undefined;
  const n = Number(match[1]);
  if (Number.isNaN(n)) return undefined;
  const unit = match[2].toLowerCase().replace(/[.\s]/g, "");
  if (unit.startsWith("perch")) return n * SQFT_PER_PERCH;
  if (unit.startsWith("acre")) return n * SQFT_PER_ACRE;
  if (unit.startsWith("sqm") || unit.startsWith("squaremet")) return n * SQFT_PER_SQM;
  return n; // sqft / square feet variants
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

const SALE_AD_TYPES = new Set(["for_sale", "to_buy"]);
const RENT_AD_TYPES = new Set(["for_rent", "to_rent"]);

export function applyFilters(results: SourcingResult[], filters: SourcingFilters): SourcingResult[] {
  return results.filter((r) => {
    // Ground-truth field when we have it (ikman) — this is what actually
    // catches ikman's own free-text search mixing sale + rental ads
    // together when no specific category could be requested (propertyType
    // left as "Any"). LankaPropertyWeb never leaks the wrong deal type in
    // the first place, since buildLpwSearchUrl picks the sale/rental path
    // directly, so it never sets adType at all — nothing to check here.
    if (filters.dealType && r.adType) {
      const wantSale = filters.dealType === "BUY";
      if (wantSale && !SALE_AD_TYPES.has(r.adType)) return false;
      if (!wantSale && !RENT_AD_TYPES.has(r.adType)) return false;
    }
    if (filters.district && !locationMatchesDistrict(r.location, filters.district)) return false;
    if (filters.city?.trim()) {
      const hay = `${r.location ?? ""} ${r.title}`.toLowerCase();
      // The city field's own autocomplete suggests this app's combined-form
      // entries ("Colombo 5 (Havelock Town)") — a real listing almost never
      // writes it that way, only one half or the other. Same alias split
      // already used everywhere else a saved/typed location gets compared
      // (see locationsMatch), so picking a suggested option actually matches
      // real listing text instead of silently returning nothing.
      const aliases = locationAliases(filters.city.trim());
      if (!aliases.some((a) => hay.includes(a))) return false;
    }
    // Deliberately no propertyType text-filter here (there used to be one,
    // word-boundary matched against title/location) — measured live and
    // removed after it was found to be net-harmful, not just imprecise.
    // This app's own subtype vocabulary (Villa, Luxury Residence, Office,
    // Retail Space, Cold Storage Facility, ...) is finer than either site's
    // real category taxonomy, which tops out at House / Apartment / Land /
    // Commercial. Requiring a listing's title to literally contain the
    // subtype word only ever removes real matches — sellers write "Prime
    // Commercial Building for Sale", not "Office" — it can never add one
    // back that the URL routing missed. Checked on a live "Office" search:
    // buildIkmanSearchUrl/buildLpwSearchUrl already correctly scope to the
    // Commercial category (168 raw candidates); the removed text filter was
    // discarding 163 of them, nearly all genuinely commercial listings that
    // simply didn't use the word "office". District/dealType/city/keyword
    // above are all real, additional signals the sites don't already encode
    // in the URL — property type beyond the four broad buckets isn't.
    // LankaPropertyWeb has no keyword query param that actually narrows
    // results (verified live — it silently ignores ?q=/?search=), so a
    // typed keyword was previously dropped entirely for that source. Only
    // applied to LPW: ikman's own query param already does a full-text
    // search across each ad's full description, not just its title —
    // re-checking title-only text here would wrongly drop a real ikman
    // match whose keyword hit only appeared in its description.
    if (filters.keyword?.trim() && r.source === "lankapropertyweb") {
      const hay = `${r.title} ${r.location ?? ""}`.toLowerCase();
      if (!hay.includes(filters.keyword.trim().toLowerCase())) return false;
    }
    if (filters.priceMin != null || filters.priceMax != null) {
      const price = parsePriceToNumber(r.price);
      if (price != null) {
        if (filters.priceMin != null && price < filters.priceMin) return false;
        if (filters.priceMax != null && price > filters.priceMax) return false;
      }
      // price didn't parse — keep it rather than hide a possibly-real match
    }
    if (filters.sizeMin != null || filters.sizeMax != null) {
      const sqft = parseSizeToSqft(r.size);
      if (sqft != null) {
        if (filters.sizeMin != null && sqft < filters.sizeMin) return false;
        if (filters.sizeMax != null && sqft > filters.sizeMax) return false;
      }
      // size didn't parse (or, for ikman, was never a floor size to begin
      // with) — keep it rather than hide a possibly-real match
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
// (`window.initialData…serp.ads.data.ads[]`), far more reliable than
// parsing hashed CSS-module class names. The bigger fix lives in the URL
// itself, though: ikman.lk/en/ads/{location-slug}/{category-slug} is a real,
// separately-indexed page per district+category+deal-type combination —
// confirmed by fetching ikman's own category tree (`serp.categories`) and
// cross-checking against its internal "browse by location" links, not
// guessed. The old code only ever hit the generic
// /en/ads/sri-lanka/property?query=... endpoint, which mixes every
// district, every property type, and — this was the biggest single source
// of "pulling everything" — every deal type (sale AND rental) into one
// fuzzy full-text search ikman itself doesn't scope tightly.
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

// ---------------------------------------------------------------------------
// ikman.lk's own, real property-type taxonomy — not this app's invented
// vocabulary mapped onto it. Verified against ikman's live category tree
// (serp.categories in its own page payload): these are its actual category
// names, each with its own separate sale/rent slug where ikman itself
// splits them that way (a listing is filed under "Houses For Sale" or
// "House Rentals" — ikman has no single "Houses" category with a deal-type
// flag). Room & Annex and Holiday & Short-Term are real ikman categories
// too, but rental-only on ikman's own side — no sale equivalent exists, so
// saleSlug is left unset and the UI hides them when Buy is selected.
// ---------------------------------------------------------------------------

export type IkmanPropertyType = "houses" | "apartments" | "land" | "commercial" | "room-annex" | "holiday-short-term";

export const IKMAN_PROPERTY_TYPES: { value: IkmanPropertyType; label: string; saleSlug?: string; rentSlug?: string }[] = [
  { value: "houses", label: "Houses", saleSlug: "houses-for-sale", rentSlug: "house-rentals" },
  { value: "apartments", label: "Apartments", saleSlug: "apartments-for-sale", rentSlug: "apartment-rentals" },
  { value: "land", label: "Land", saleSlug: "land-for-sale", rentSlug: "land-for-rent" },
  { value: "commercial", label: "Commercial Properties", saleSlug: "commercial-properties-for-sale", rentSlug: "commercial-property-rentals" },
  { value: "room-annex", label: "Room & Annex", rentSlug: "room-annex-rentals" },
  { value: "holiday-short-term", label: "Holiday & Short-Term", rentSlug: "holiday-short-term-rental" },
];

// Commercial Properties has no child categories on ikman, but DOES carry a
// real per-listing "item_type" facet (Building/Hotel/Warehouse-Storage/
// Office/Shop/Factory-Workshop/Restaurant/Other) — found in its own
// dynamic-filters payload, ikman's own vocabulary, not this app's. That
// facet only drives a client-side JS filter, though (verified live:
// ?item_type=office left postedAdCount completely unchanged), so it can't
// be used as a URL param the way category/location/page can. What DOES
// work: feeding the same word into ikman's own `query` full-text search,
// which searches each ad's full description, not just its title — this
// was measured directly (a `query=office` search scoped to Commercial
// Properties returned 26 targeted, genuinely office-related results, a
// real middle ground between the unfiltered category's ~670 and a brittle
// title-only regex's 5). No equivalent facet exists for Houses or Land
// (checked their dynamic filters too — bedrooms/bathrooms/price/size
// only) — ikman genuinely has no further breakdown there.
export const IKMAN_COMMERCIAL_TYPES: { value: string; label: string }[] = [
  { value: "office", label: "Office" },
  { value: "shop", label: "Shop" },
  { value: "warehouse_storage", label: "Warehouse / Storage" },
  { value: "factory_workshop", label: "Factory / Workshop" },
  { value: "hotel", label: "Hotel" },
  { value: "restaurant", label: "Restaurant" },
  { value: "building", label: "Building" },
  { value: "other", label: "Other" },
];

// ikman's location slugs are simply the district name, lowercased and
// space-hyphenated ("Nuwara Eliya" → "nuwara-eliya") — verified against
// every district this app offers, including the multi-word one.
function ikmanLocationSlug(district: string): string {
  return district.toLowerCase().replace(/\s+/g, "-");
}

// ikman's district-scoped search never exposes a sub-area as a structured
// field — every ad's own `location` field just echoes the district name
// ("Colombo") back regardless of whether it's actually Kollupitiya or
// Homagama (confirmed live: 77 "Colombo" land ads, all with location ===
// "Colombo"). The real area only ever shows up, inconsistently, in the
// free-text title — so a city/area search has to be folded into ikman's own
// `query` full-text search (which does cover descriptions, not just
// titles), not just checked against the useless structured field afterward.
//
// ikman's query search does an AND-of-terms match, not a phrase match —
// verified live: the combined form "Colombo 3 (Kollupitiya)" (and even
// "Colombo 5 Havelock Town" with the parens stripped) returns zero every
// time, while the plain postal-number half ("Colombo 3") alone returns
// real, mostly-accurate results (spot-checked: 6 of 10 hits for "Colombo 3"
// genuinely say "Colombo 3" in the title; the other 4 are loose independent
// token matches on "Colombo" + an unrelated "3" elsewhere in the title —
// caught and dropped by applyFilters' own city text check afterward, which
// requires the literal substring, not just both words present). So: prefer
// the part before a parenthetical alt-name; fall back to the full city text
// for every other district, where it's usually one or two words and already
// verified to work directly ("Nugegoda", "Mount Lavinia").
function ikmanCityQueryTerm(city: string): string | undefined {
  const aliases = locationAliases(city);
  return aliases[1] ?? aliases[0];
}

export function buildIkmanSearchUrl(opts: {
  dealType: "BUY" | "RENT" | "LEASE";
  district?: string;
  propertyType?: string;
  commercialType?: string;
  city?: string;
  keyword?: string;
  page?: number;
}): string {
  const locationSlug = opts.district ? ikmanLocationSlug(opts.district) : "sri-lanka";
  const isSale = opts.dealType === "BUY";
  const cat = IKMAN_PROPERTY_TYPES.find((t) => t.value === opts.propertyType);
  // "property" is the live (non-deactivated) umbrella category — every
  // type and deal type mixed together. Reached when the user left property
  // type as "Any", or picked a rental-only type (Room & Annex, Holiday &
  // Short-Term) while Deal type is Buy — applyFilters' adType check is the
  // safety net for deal-type accuracy in that case, since no URL segment
  // can narrow an umbrella category by sale-vs-rent on its own.
  const categorySlug = (isSale ? cat?.saleSlug : cat?.rentSlug) ?? "property";
  const commercialHint = opts.propertyType === "commercial" && opts.commercialType ? IKMAN_COMMERCIAL_TYPES.find((t) => t.value === opts.commercialType)?.label.toLowerCase() : undefined;
  const cityHint = opts.city?.trim() ? ikmanCityQueryTerm(opts.city) : undefined;
  const query = [opts.keyword?.trim(), cityHint, commercialHint].filter(Boolean).join(" ");
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  if (opts.page && opts.page > 1) params.set("page", String(opts.page));
  const qs = params.toString();
  return `https://ikman.lk/en/ads/${locationSlug}/${categorySlug}${qs ? `?${qs}` : ""}`;
}

function mapIkmanAd(ad: Record<string, unknown>): SourcingResult {
  const title = String(ad.title ?? "");
  const category = ad.category as { name?: string } | undefined;
  return {
    source: "ikman" as const,
    title,
    price: ad.price ? String(ad.price) : undefined,
    location: [ad.location, category?.name].filter(Boolean).join(" · ") || undefined,
    size: ad.details ? String(ad.details) : undefined,
    url: `https://ikman.lk/en/ad/${ad.slug}`,
    imgUrl: ad.imgUrl ? String(ad.imgUrl) : undefined,
    postedAgo: ad.timeStamp ? String(ad.timeStamp) : undefined,
    bedrooms: parseBedroomsFromTitle(title),
    category: category?.name,
    adType: ad.adType as SourcingResult["adType"],
  };
}

function parseIkmanAds(html: string): Array<Record<string, unknown>> {
  const data = extractJsAssignment(html, "window.initialData = ") as
    | { serp?: { ads?: { data?: { ads?: Array<Record<string, unknown>> } } } }
    | null;
  return data?.serp?.ads?.data?.ads ?? [];
}

// One page returns ~26 ads — nowhere near enough to filter down from
// afterwards for anything but the broadest search, which is most of why
// results felt thin once real district/type/price/etc filters were applied
// on top. ikman's own pagination (?page=N) is real and reliable — verified
// live across 3 pages with zero repeated ads — so this fetches several
// pages up front and merges them into one real candidate pool before
// applyFilters ever runs.
const IKMAN_PAGES = 3;

export async function searchIkman(opts: { dealType: "BUY" | "RENT" | "LEASE"; district?: string; propertyType?: string; commercialType?: string; city?: string; keyword?: string }): Promise<SourcingResult[]> {
  const first = await fetchHtml(buildIkmanSearchUrl(opts));
  let baseOpts = opts;
  let html = first.html;
  let ok = first.ok;

  // A location/category combination that turns out not to exist (rare —
  // every district+category this app can produce was checked, but a future
  // district added to locations.ts wouldn't be) falls back to a
  // sri-lanka-wide search on the same category rather than surfacing a
  // dead end; applyFilters' district check still guards accuracy from there.
  if (!ok && opts.district) {
    baseOpts = { ...opts, district: undefined };
    ({ html, ok } = await fetchHtml(buildIkmanSearchUrl(baseOpts)));
  }
  if (!ok) throw new Error(`ikman.lk search failed (page not found or unreachable).`);

  const firstPageAds = parseIkmanAds(html);
  const restPages = await Promise.all(
    Array.from({ length: IKMAN_PAGES - 1 }, (_, i) =>
      fetchHtml(buildIkmanSearchUrl({ ...baseOpts, page: i + 2 }))
        .then((r) => (r.ok ? parseIkmanAds(r.html) : []))
        .catch(() => []),
    ),
  );

  const seen = new Set<string>();
  const allAds = [firstPageAds, ...restPages].flat().filter((ad) => {
    const slug = String(ad.slug ?? "");
    if (!slug || seen.has(slug)) return false;
    seen.add(slug);
    return true;
  });
  return allAds.map(mapIkmanAd);
}

// ---------------------------------------------------------------------------
// LankaPropertyWeb — plain server-rendered HTML with stable semantic class
// names (no CSS-module hashing), so a real DOM parse (cheerio) works well.
//
// The site actually has FOUR relevant URL forms, not one — found by
// crawling its own internal cross-links rather than guessing:
//   /sale/index.php?page=N&location=..&property-type=..&searchbox=..
//   /rentals/index.php?page=N&location=..&property-type=..&searchbox=..
//     — the general case (House, Apartment, Villa, Bungalow, Studio, and a
//     coarse "Commercial" bucket that covers everything commercial/
//     industrial except the two below). These query-string endpoints are
//     used instead of the site's own prettier /forsale-{loc}-{type}.html
//     static path — that one *claims* to support ?page=N too, but was
//     tested live 4 pages deep and is unreliable (page 2/3/4 sometimes
//     returned byte-identical results to page 1, apparently caching-
//     dependent); the index.php form paginated correctly and consistently
//     every time it was tested.
//   /land/index.php?search=1&location=..&property-type=all&page=N
//     — ALL land listings live here, completely separately from sale/rent.
//     The old code pointed land at /forsale-{loc}-Bare+land.html, which
//     silently returned zero results — land was effectively unsearchable.
//   /sale/commercial/{subtype}/?page=N + /rentals/commercial/{subtype}/?page=N
//     — warehouse and factory specifically get their own indexed pages
//     here; the old code mapped Warehouse to /forsale-{loc}-Warehouse.html,
//     which 404s (confirmed live) — every warehouse search was a hard
//     failure, not just an inaccurate one.
//
// Location scoping only genuinely works for the district "Colombo" — its
// "{District}+All_0" form is a real, verified shortcut (also accepted
// hyphenated, "Colombo-All_0" — both tested and behave identically).
// Every other district's "{Province}_All_0" form was tested live and
// silently resolves to the *entire country* regardless of which province is
// given (confirmed by requesting five different provinces and getting the
// identical count back each time) — LankaPropertyWeb simply has no working
// district-wide or province-wide URL outside Colombo. Rather than a URL
// that looks scoped but silently isn't, every non-Colombo district requests
// the honest nationwide page and leans on applyFilters' district check for
// accuracy — same "don't trust a guessed param, trust our own filter"
// principle as the rest of this file.
// ---------------------------------------------------------------------------

// LankaPropertyWeb's own, real property-type taxonomy — not this app's
// invented vocabulary mapped onto it. Every value below was found by
// crawling the site's own category links (footer nav, /sale/commercial/'s
// own sub-category links, its homepage's "browse land by type" links) and
// then individually confirmed live — a real, distinct property count, not
// a silent fallback to a generic listing page. `sale`/`rent` record which
// deal type that category genuinely exists under on LPW's own site (e.g.
// Annexe/Room/Hostel are rental-only there — no sale equivalent exists;
// every Land subtype is sale-only — no working land-rental namespace was
// found, /land/lease-... 404s everywhere it was tried).
type LpwTypeDef = { value: string; label: string; group: string; sale: boolean; rent: boolean } & (
  | { kind: "index"; type: string }
  | { kind: "land"; type: string }
  | { kind: "commercial-sub"; slug: string }
);

export const LPW_PROPERTY_TYPES: LpwTypeDef[] = [
  { value: "house", label: "House", group: "Houses", kind: "index", type: "House", sale: true, rent: true },
  { value: "villa", label: "Villa", group: "Houses", kind: "index", type: "Villa", sale: true, rent: true },
  { value: "bungalow", label: "Bungalow", group: "Houses", kind: "index", type: "Bungalow", sale: true, rent: true },
  { value: "studio", label: "Studio / Bedsit", group: "Houses", kind: "index", type: "Studio", sale: true, rent: true },
  { value: "apartment", label: "Apartment", group: "Apartments", kind: "index", type: "Apartment", sale: true, rent: true },
  { value: "annexe", label: "Annexe", group: "Rentals only", kind: "index", type: "Annexe", sale: false, rent: true },
  { value: "room", label: "Room", group: "Rentals only", kind: "index", type: "Room", sale: false, rent: true },
  { value: "hostel", label: "Hostel", group: "Rentals only", kind: "index", type: "Hostel", sale: false, rent: true },
  { value: "land", label: "Land (any type)", group: "Land — sale only", kind: "land", type: "all", sale: true, rent: false },
  { value: "land-bare", label: "Bare Land", group: "Land — sale only", kind: "land", type: "Bare+land", sale: true, rent: false },
  { value: "land-beachfront", label: "Beachfront Land", group: "Land — sale only", kind: "land", type: "Beachfront+land", sale: true, rent: false },
  { value: "land-cinnamon", label: "Cinnamon Estate Land", group: "Land — sale only", kind: "land", type: "Cinnamon+land", sale: true, rent: false },
  { value: "land-coconut", label: "Coconut Estate Land", group: "Land — sale only", kind: "land", type: "Coconut+land", sale: true, rent: false },
  { value: "land-cultivated", label: "Cultivated / Agriculture Land", group: "Land — sale only", kind: "land", type: "Cultivated+land", sale: true, rent: false },
  { value: "land-with-house", label: "Land with House", group: "Land — sale only", kind: "land", type: "Land+with+house", sale: true, rent: false },
  { value: "land-paddy", label: "Paddy (Rice) Land", group: "Land — sale only", kind: "land", type: "Paddy+land", sale: true, rent: false },
  { value: "land-rubber", label: "Rubber Estate Land", group: "Land — sale only", kind: "land", type: "Rubber+land", sale: true, rent: false },
  { value: "land-tea", label: "Tea Estate Land", group: "Land — sale only", kind: "land", type: "Tea+land", sale: true, rent: false },
  { value: "land-waterfront", label: "Waterfront Land", group: "Land — sale only", kind: "land", type: "Waterfront+land", sale: true, rent: false },
  { value: "commercial", label: "Commercial (any type)", group: "Commercial", kind: "index", type: "Commercial", sale: true, rent: true },
  { value: "commercial-building", label: "Building", group: "Commercial", kind: "commercial-sub", slug: "building", sale: true, rent: true },
  { value: "commercial-factory", label: "Factory", group: "Commercial", kind: "commercial-sub", slug: "factory", sale: true, rent: true },
  { value: "commercial-guest-house", label: "Guest House", group: "Commercial", kind: "commercial-sub", slug: "guest-house", sale: true, rent: true },
  { value: "commercial-hotel", label: "Hotel", group: "Commercial", kind: "commercial-sub", slug: "hotel", sale: true, rent: true },
  { value: "commercial-multipurpose", label: "Multipurpose", group: "Commercial", kind: "commercial-sub", slug: "multipurpose", sale: true, rent: true },
  { value: "commercial-office", label: "Office", group: "Commercial", kind: "commercial-sub", slug: "office", sale: true, rent: true },
  { value: "commercial-shop", label: "Shop", group: "Commercial", kind: "commercial-sub", slug: "shop", sale: true, rent: true },
  { value: "commercial-warehouse", label: "Warehouse", group: "Commercial", kind: "commercial-sub", slug: "warehouse", sale: true, rent: true },
  { value: "commercial-restaurant", label: "Restaurant", group: "Commercial", kind: "commercial-sub", slug: "restaurant", sale: true, rent: true },
  { value: "commercial-hospital", label: "Hospital", group: "Commercial — sale only", kind: "commercial-sub", slug: "hospital", sale: true, rent: false },
  { value: "commercial-shopping-mall", label: "Shopping Mall", group: "Commercial — sale only", kind: "commercial-sub", slug: "shopping-mall", sale: true, rent: false },
  { value: "commercial-coworking", label: "Co-working Space", group: "Commercial — rent only", kind: "commercial-sub", slug: "coworking", sale: false, rent: true },
  { value: "commercial-other", label: "Other Commercial", group: "Commercial — rent only", kind: "commercial-sub", slug: "other", sale: false, rent: true },
];

function lpwLocationSegment(district: string | undefined): string {
  return district === "Colombo" ? "Colombo+All_0" : "all";
}

export function buildLpwSearchUrl(opts: { dealType: "BUY" | "RENT" | "LEASE"; district?: string; propertyType?: string; page?: number }): string {
  const loc = lpwLocationSegment(opts.district);
  const isRent = opts.dealType !== "BUY";
  const page = opts.page ?? 1;
  const def = LPW_PROPERTY_TYPES.find((t) => t.value === opts.propertyType);
  // A def that doesn't genuinely exist for the selected deal type (picked
  // via a stale URL or Matchmaker prefill, since the UI itself hides these
  // combinations) falls through to the generic index below rather than
  // requesting a route this site doesn't have.
  const validDef = def && ((isRent && def.rent) || (!isRent && def.sale)) ? def : undefined;

  if (validDef?.kind === "land") {
    const params = new URLSearchParams({ search: "1", location: loc, "property-type": validDef.type });
    if (page > 1) params.set("page", String(page));
    return `https://www.lankapropertyweb.com/land/index.php?${params.toString()}`;
  }
  if (validDef?.kind === "commercial-sub") {
    // This namespace's location scoping wasn't verified beyond Colombo
    // live, so it's requested nationwide and left to applyFilters' district
    // check — safer than a guessed path segment that might silently 404
    // or silently mis-scope.
    const qs = page > 1 ? `?page=${page}` : "";
    return `https://www.lankapropertyweb.com/${isRent ? "rentals" : "sale"}/commercial/${validDef.slug}/${qs}`;
  }
  const type = validDef?.kind === "index" ? validDef.type : "all";
  const params = new URLSearchParams({ location: loc, "property-type": type, searchbox: opts.district ?? "Sri Lanka" });
  if (page > 1) params.set("page", String(page));
  return `https://www.lankapropertyweb.com/${isRent ? "rentals" : "sale"}/index.php?${params.toString()}`;
}

function parseLpwListings(html: string): SourcingResult[] {
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

  return results;
}

// Same reasoning as IKMAN_PAGES — one page (30 listings) left little to
// work with once real filters ran on top. LPW's index.php pagination was
// verified live, 3 pages deep, with zero repeated listings.
const LPW_PAGES = 3;

export async function searchLankaPropertyWeb(opts: { dealType: "BUY" | "RENT" | "LEASE"; district?: string; propertyType?: string }): Promise<SourcingResult[]> {
  const pages = await Promise.all(
    Array.from({ length: LPW_PAGES }, (_, i) =>
      fetchHtml(buildLpwSearchUrl({ ...opts, page: i + 1 }))
        .then((r) => (r.ok ? parseLpwListings(r.html) : null))
        .catch(() => null),
    ),
  );

  if (pages[0] === null) throw new Error("LankaPropertyWeb search failed (page not found or unreachable).");

  const seen = new Set<string>();
  return pages
    .filter((p): p is SourcingResult[] => p !== null)
    .flat()
    .filter((r) => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });
}

// ---------------------------------------------------------------------------
// Fetch one specific listing page and reduce it to plain text for AI
// Intake — same extraction pipeline as pasted text, just sourced by URL.
// ---------------------------------------------------------------------------

export async function fetchListingText(url: string): Promise<{ text: string; imgUrl?: string }> {
  if (!isAllowedSourceUrl(url)) throw new Error("Only ikman.lk and lankapropertyweb.com listing links are supported.");
  const { html, ok } = await fetchHtml(url);
  if (!ok) throw new Error("Could not load that listing page.");
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
  const { html, ok } = await fetchHtml(url);
  if (!ok) throw new Error("Could not load that listing page.");

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
