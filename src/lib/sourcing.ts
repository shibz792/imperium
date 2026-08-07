import * as cheerio from "cheerio";

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
};

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
  return ads.slice(0, 20).map((ad) => ({
    source: "ikman" as const,
    title: String(ad.title ?? ""),
    price: ad.price ? String(ad.price) : undefined,
    location: [ad.location, (ad.category as { name?: string } | undefined)?.name].filter(Boolean).join(" · ") || undefined,
    size: ad.details ? String(ad.details) : undefined,
    url: `https://ikman.lk/en/ad/${ad.slug}`,
    imgUrl: ad.imgUrl ? String(ad.imgUrl) : undefined,
    postedAgo: ad.timeStamp ? String(ad.timeStamp) : undefined,
  }));
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
