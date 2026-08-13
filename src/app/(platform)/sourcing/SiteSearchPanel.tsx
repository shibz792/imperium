"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Search, Download, Check, Loader2, ExternalLink, UserPlus, CheckCircle2, ImageOff, SearchX, ArrowUpDown, Clock, X } from "lucide-react";
import { searchIkmanListings, searchLpwListings, extractContactFromListing, saveOutsourcedContact, type SourcingSearchResult } from "./actions";
import { ALL_DISTRICTS, ALL_CITIES, SRI_LANKA_GEOGRAPHY, PROPERTY_SUBTYPES } from "@/lib/locations";

const SOURCE_LABEL: Record<string, string> = { ikman: "ikman.lk", lankapropertyweb: "LankaPropertyWeb" };
const DEAL_TYPE_LABEL: Record<string, string> = { BUY: "Buy", RENT: "Rent", LEASE: "Lease" };
type SortKey = "relevance" | "price-asc" | "price-desc" | "newest";
type Source = "ikman" | "lankapropertyweb";

// A search result card can go straight to "Import" without a round trip
// through search state — see doImport in SourcingClient — so it carries
// along whatever display fields the search result already had.
export type ImportTarget = { url: string; source: Source } & Partial<Pick<SourcingSearchResult, "price" | "location" | "size" | "imgUrl" | "bedrooms">>;

type AppliedFilters = {
  district: string;
  city: string;
  propertyType: string;
  dealType: "BUY" | "RENT" | "LEASE";
  keyword: string;
  priceMin: string;
  priceMax: string;
  sizeMin: string;
  sizeMax: string;
  bedrooms: string;
  postedWithinDays: string;
};

// ikman.lk and LankaPropertyWeb genuinely support different filters — LPW
// exposes real structured floor/land size text ikman's search results never
// carry at all; ikman exposes a real "posted N days ago" ikman never gives
// LPW; LPW's own district scoping only really works for the district
// "Colombo" (see buildLpwSearchUrl's own comment). A single shared filter
// panel across both sites meant offering filters that silently did nothing
// for whichever site didn't support them — this panel is single-source, its
// fields tailored to what that one site can actually do, and its own
// "Search ikman.lk" / "Search LankaPropertyWeb" tab is how you pick which.
export function SiteSearchPanel({
  source,
  initialKeyword = "",
  initialDealType = "RENT",
  initialDistrict = "",
  initialPropertyType = "",
  onImport,
  importPending,
  importingUrl,
}: {
  source: Source;
  initialKeyword?: string;
  initialDealType?: "BUY" | "RENT" | "LEASE";
  initialDistrict?: string;
  initialPropertyType?: string;
  onImport: (target: ImportTarget) => void;
  importPending: boolean;
  importingUrl: string | null;
}) {
  const isIkman = source === "ikman";
  const [keyword, setKeyword] = useState(initialKeyword);
  const [dealType, setDealType] = useState<"BUY" | "RENT" | "LEASE">(initialDealType);
  const [district, setDistrict] = useState(initialDistrict);
  const [city, setCity] = useState("");
  const [propertyType, setPropertyType] = useState(initialPropertyType);
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [sizeMin, setSizeMin] = useState("");
  const [sizeMax, setSizeMax] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [postedWithinDays, setPostedWithinDays] = useState("");
  const [moreFilters, setMoreFilters] = useState(false);
  const [results, setResults] = useState<SourcingSearchResult[]>([]);
  const [applied, setApplied] = useState<AppliedFilters | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("relevance");
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [pending, startTransition] = useTransition();

  // Takes overrides so a chip's "×" can drop one filter and re-search in
  // the same click, without racing React's async state updates — the
  // request always builds from `next`, never from the (possibly still
  // stale) state variables directly.
  function runSearch(overrides: Partial<AppliedFilters> = {}) {
    const next: AppliedFilters = { district, city, propertyType, dealType, keyword, priceMin, priceMax, sizeMin, sizeMax, bedrooms, postedWithinDays, ...overrides };
    setDistrict(next.district);
    setCity(next.city);
    setPropertyType(next.propertyType);
    setDealType(next.dealType);
    setKeyword(next.keyword);
    setPriceMin(next.priceMin);
    setPriceMax(next.priceMax);
    setSizeMin(next.sizeMin);
    setSizeMax(next.sizeMax);
    setBedrooms(next.bedrooms);
    setPostedWithinDays(next.postedWithinDays);
    setSearched(true);
    startTransition(async () => {
      const search = isIkman ? searchIkmanListings : searchLpwListings;
      const res = await search({
        dealType: next.dealType,
        keyword: next.keyword,
        district: next.district || undefined,
        city: next.city || undefined,
        propertyType: next.propertyType || undefined,
        priceMin: next.priceMin ? Number(next.priceMin) : undefined,
        priceMax: next.priceMax ? Number(next.priceMax) : undefined,
        sizeMin: next.sizeMin ? Number(next.sizeMin) : undefined,
        sizeMax: next.sizeMax ? Number(next.sizeMax) : undefined,
        bedrooms: next.bedrooms ? Number(next.bedrooms) : undefined,
        postedWithinDays: next.postedWithinDays ? Number(next.postedWithinDays) : undefined,
      });
      setResults(res.results);
      setError(res.error ?? null);
      setApplied(next);
    });
  }

  const sortedResults = useMemo(() => {
    const list = [...results];
    if (sortBy === "price-asc") list.sort((a, b) => (a.priceValue ?? Infinity) - (b.priceValue ?? Infinity));
    else if (sortBy === "price-desc") list.sort((a, b) => (b.priceValue ?? -Infinity) - (a.priceValue ?? -Infinity));
    else if (sortBy === "newest") list.sort((a, b) => (a.postedDays ?? Infinity) - (b.postedDays ?? Infinity));
    return list;
  }, [results, sortBy]);

  // Narrows to the selected district's own real areas (Nugegoda, Kottawa,
  // Colombo 5 (Havelock Town), ...) once one's picked, falling back to
  // every city/area this app knows about otherwise — either way, a real,
  // known list instead of a free-typed field where a typo or an area name
  // this app just doesn't recognize silently returns nothing.
  const cityOptions = useMemo(() => {
    if (!district) return ALL_CITIES;
    return SRI_LANKA_GEOGRAPHY.find((d) => d.district === district)?.cities ?? ALL_CITIES;
  }, [district]);

  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (applied) {
    if (applied.district) chips.push({ key: "district", label: applied.district, onRemove: () => runSearch({ district: "" }) });
    if (applied.city) chips.push({ key: "city", label: applied.city, onRemove: () => runSearch({ city: "" }) });
    if (applied.propertyType) chips.push({ key: "type", label: applied.propertyType, onRemove: () => runSearch({ propertyType: "" }) });
    chips.push({ key: "deal", label: DEAL_TYPE_LABEL[applied.dealType], onRemove: () => runSearch({ dealType: "RENT" }) });
    if (applied.keyword) chips.push({ key: "keyword", label: `"${applied.keyword}"`, onRemove: () => runSearch({ keyword: "" }) });
    if (applied.priceMin || applied.priceMax) {
      const label = `${applied.priceMin ? `Rs ${Number(applied.priceMin).toLocaleString()}` : "Rs 0"} – ${applied.priceMax ? `Rs ${Number(applied.priceMax).toLocaleString()}` : "no limit"}`;
      chips.push({ key: "price", label, onRemove: () => runSearch({ priceMin: "", priceMax: "" }) });
    }
    if (!isIkman && (applied.sizeMin || applied.sizeMax)) {
      const label = `${applied.sizeMin ? `${Number(applied.sizeMin).toLocaleString()}` : "0"} – ${applied.sizeMax ? `${Number(applied.sizeMax).toLocaleString()} sqft` : "no limit sqft"}`;
      chips.push({ key: "size", label, onRemove: () => runSearch({ sizeMin: "", sizeMax: "" }) });
    }
    if (applied.bedrooms) chips.push({ key: "beds", label: `${applied.bedrooms} bed`, onRemove: () => runSearch({ bedrooms: "" }) });
    if (isIkman && applied.postedWithinDays) chips.push({ key: "posted", label: `Posted ≤ ${applied.postedWithinDays}d`, onRemove: () => runSearch({ postedWithinDays: "" }) });
  }

  return (
    <div>
      <div className="ir-card mb-5 p-5">
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="ir-label mb-1 block">Keyword</label>
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="pool, sea view, corner lot…" className="ir-input" />
            {!isIkman && <p className="mt-1 text-[0.65rem] text-black/35">Matched against each listing&apos;s title only — LankaPropertyWeb has no real full-text search.</p>}
          </div>
          <div>
            <label className="ir-label mb-1 block">Deal type</label>
            <select value={dealType} onChange={(e) => setDealType(e.target.value as never)} className="ir-select">
              <option value="BUY">Buy</option>
              <option value="RENT">Rent</option>
              <option value="LEASE">Lease</option>
            </select>
          </div>
          <div>
            <label className="ir-label mb-1 block">District</label>
            <select value={district} onChange={(e) => setDistrict(e.target.value)} className="ir-select">
              <option value="">Any</option>
              {ALL_DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            {!isIkman && district && district !== "Colombo" && (
              <p className="mt-1 text-[0.65rem] text-black/35">LankaPropertyWeb only precisely scopes Colombo — this searches nationwide and filters by district after.</p>
            )}
          </div>
          <div>
            <label className="ir-label mb-1 block">City / area</label>
            <input value={city} onChange={(e) => setCity(e.target.value)} list={`sourcing-city-list-${source}`} placeholder="Start typing — Nugegoda, Colombo 7…" className="ir-input" />
            <datalist id={`sourcing-city-list-${source}`}>{cityOptions.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label className="ir-label mb-1 block">Property type</label>
            <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)} className="ir-select">
              <option value="">Any</option>
              {Array.from(new Set(Object.values(PROPERTY_SUBTYPES).flat())).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-end lg:col-span-3">
            <button type="button" onClick={() => setMoreFilters((v) => !v)} className="text-xs font-medium text-ir-gold-dark hover:underline">
              {moreFilters ? "Fewer filters" : isIkman ? "+ Price, bedrooms, posted date" : "+ Price, size, bedrooms"}
            </button>
          </div>
        </div>

        {moreFilters && (
          <div className="mb-4 grid grid-cols-2 gap-3 border-t border-black/6 pt-4 sm:grid-cols-4">
            <div>
              <label className="ir-label mb-1 block">Min price (LKR)</label>
              <input type="number" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} placeholder="0" className="ir-input" />
            </div>
            <div>
              <label className="ir-label mb-1 block">Max price (LKR)</label>
              <input type="number" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} placeholder="No limit" className="ir-input" />
            </div>
            {!isIkman && (
              <>
                <div>
                  <label className="ir-label mb-1 block">Min size (sqft)</label>
                  <input type="number" value={sizeMin} onChange={(e) => setSizeMin(e.target.value)} placeholder="0" className="ir-input" />
                </div>
                <div>
                  <label className="ir-label mb-1 block">Max size (sqft)</label>
                  <input type="number" value={sizeMax} onChange={(e) => setSizeMax(e.target.value)} placeholder="No limit" className="ir-input" />
                </div>
              </>
            )}
            <div>
              <label className="ir-label mb-1 block">Bedrooms</label>
              <input type="number" min="0" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} placeholder="Any" className="ir-input" />
            </div>
            {isIkman && (
              <div>
                <label className="ir-label mb-1 block">Posted within (days)</label>
                <input type="number" min="1" value={postedWithinDays} onChange={(e) => setPostedWithinDays(e.target.value)} placeholder="Any time" className="ir-input" />
              </div>
            )}
            <p className="col-span-2 text-[0.65rem] text-black/35 sm:col-span-4">
              Price/bedrooms{isIkman ? "/posted-date" : ""} are read from each listing&apos;s own text, not a structured field — best-effort: a result missing that detail is kept rather than hidden.
              {!isIkman && " Size is real, structured text on this site, so it's a more reliable filter here than on ikman.lk, which never lists a floor/land size in search results at all."}
            </p>
          </div>
        )}

        <button onClick={() => runSearch()} disabled={pending} className="ir-btn ir-btn-gold px-5 disabled:opacity-50">
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
          Search {SOURCE_LABEL[source]}
        </button>
        <p className="mt-2 text-[0.7rem] text-black/40">Searches the site the way a browser would, on your click, not a background crawler.</p>
      </div>

      {error && (
        <div className="mb-4 rounded border border-[#92601f4d] bg-[color:var(--color-bronze-tint)] p-3 text-xs text-[color:var(--color-bronze)]">{error}</div>
      )}

      {searched && (
        <>
          {(chips.length > 0 || results.length > 0) && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {chips.map((c) => (
                  <button
                    key={c.key}
                    onClick={c.onRemove}
                    className="flex items-center gap-1 rounded-full border border-ir-navy/15 bg-ir-navy/[0.04] px-2.5 py-1 text-[0.7rem] font-medium text-ir-navy hover:border-ir-navy/30 hover:bg-ir-navy/[0.07]"
                    title="Remove this filter and re-search"
                  >
                    {c.label} <X size={11} className="text-black/40" />
                  </button>
                ))}
              </div>
              {results.length > 0 && (
                <div className="flex items-center gap-2">
                  <ArrowUpDown size={13} className="text-black/30" />
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)} className="ir-select !w-auto !py-1 !text-xs">
                    <option value="relevance">Sort: Relevance</option>
                    {isIkman && <option value="newest">Sort: Newest first</option>}
                    <option value="price-asc">Sort: Price, low to high</option>
                    <option value="price-desc">Sort: Price, high to low</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {results.length > 0 && (
            <p className="mb-3 text-xs text-black/45"><span className="font-semibold text-ir-navy">{results.length}</span> result{results.length === 1 ? "" : "s"} on {SOURCE_LABEL[source]}</p>
          )}

          {pending && results.length === 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : results.length === 0 && !pending ? (
            <div className="ir-card flex flex-col items-center gap-2 py-14 text-center">
              <SearchX size={22} className="text-black/20" />
              <p className="text-sm font-medium text-ir-navy">No listings matched</p>
              <p className="max-w-xs text-xs text-black/40">Try a broader district, clear the property type, or widen the price range — the filters above narrow real listings, not a curated shortlist.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sortedResults.map((r, i) => (
                <ResultCard key={`${r.url}-${i}`} result={r} pending={importPending} importing={importingUrl} onImport={onImport} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="ir-card overflow-hidden">
      <div className="aspect-[4/3] w-full animate-pulse bg-black/[0.06]" />
      <div className="space-y-2 p-4">
        <div className="h-3 w-1/3 animate-pulse rounded bg-black/[0.06]" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-black/[0.06]" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-black/[0.06]" />
        <div className="h-8 w-full animate-pulse rounded bg-black/[0.05]" />
      </div>
    </div>
  );
}

function ResultCard({
  result: r,
  pending,
  importing,
  onImport,
}: {
  result: SourcingSearchResult;
  pending: boolean;
  importing: string | null;
  onImport: (target: ImportTarget) => void;
}) {
  const [showSave, setShowSave] = useState(false);
  const [loadingContact, setLoadingContact] = useState(false);
  const [contactFields, setContactFields] = useState<{ name: string; phone: string }>({ name: "", phone: "" });
  const [contactError, setContactError] = useState<string | null>(null);
  const [savedContactId, setSavedContactId] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);
  const [saving, startSaving] = useTransition();

  function openSaveContact() {
    setShowSave(true);
    setContactError(null);
    setLoadingContact(true);
    startSaving(async () => {
      const res = await extractContactFromListing(r.url);
      setLoadingContact(false);
      if (res.error) setContactError(res.error);
      setContactFields({ name: res.name ?? "", phone: res.phone ?? "" });
    });
  }

  function confirmSaveContact() {
    if (!contactFields.name.trim() || !contactFields.phone.trim()) {
      setContactError("Name and phone are both needed to save a contact.");
      return;
    }
    setContactError(null);
    startSaving(async () => {
      const res = await saveOutsourcedContact({ name: contactFields.name.trim(), phone: contactFields.phone.trim() }, r.url, r.source);
      setSavedContactId(res.id);
      setShowSave(false);
    });
  }

  return (
    <div className="ir-card ir-card-hover flex flex-col overflow-hidden">
      <div className="relative aspect-[4/3] w-full bg-ir-ivory">
        {r.imgUrl && !imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element -- a third-party listing photo, never our own origin
          <img src={r.imgUrl} alt="" onError={() => setImgFailed(true)} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-ir-navy/[0.04]">
            <ImageOff size={20} className="text-black/15" />
          </div>
        )}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-black/55 to-transparent p-2">
          <span className="rounded-sm bg-white/90 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-ir-navy">{SOURCE_LABEL[r.source]}</span>
          {r.postedAgo && (
            <span className="flex items-center gap-1 rounded-sm bg-black/40 px-1.5 py-0.5 text-[0.6rem] text-white">
              <Clock size={9} /> {r.postedAgo}
            </span>
          )}
        </div>
        {r.price && (
          <span className="ir-figure absolute bottom-2 left-2 rounded-sm bg-black/65 px-2 py-1 text-sm text-white">{r.price}</span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="mb-1 line-clamp-2 text-sm font-semibold text-ir-navy">{r.title}</h3>
        <p className="mb-3 text-xs text-black/45">
          {r.location}{r.size ? ` · ${r.size}` : ""}{r.bedrooms ? ` · ${r.bedrooms} bed` : ""}
        </p>

        {r.alreadyImportedPropertyId ? (
          <Link href={`/properties/${r.alreadyImportedPropertyId}`} className="mt-auto flex items-center justify-center gap-1.5 rounded border border-[color:var(--color-forest)]/30 bg-[color:var(--color-forest)]/10 px-3 py-2 text-xs font-medium text-[color:var(--color-forest)]">
            <CheckCircle2 size={13} /> Already a property →
          </Link>
        ) : r.alreadyRegisteredListingId ? (
          <Link href="/sourcing?tab=registered" className="mt-auto flex items-center justify-center gap-1.5 rounded border border-ir-navy/20 bg-ir-navy/[0.04] px-3 py-2 text-xs font-medium text-ir-navy">
            <CheckCircle2 size={13} /> Already registered →
          </Link>
        ) : (
          <div className="mt-auto flex items-center gap-2">
            <button
              onClick={() => onImport({ url: r.url, source: r.source, price: r.price, location: r.location, size: r.size, imgUrl: r.imgUrl, bedrooms: r.bedrooms })}
              disabled={pending}
              className="ir-btn ir-btn-primary flex-1 justify-center !text-xs disabled:opacity-50"
            >
              {importing === r.url ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Import
            </button>
            {savedContactId ? (
              <Link href={`/contacts/${savedContactId}`} className="ir-btn ir-btn-ghost !px-2.5 !text-xs text-[color:var(--color-forest)]" title="Contact saved">
                <CheckCircle2 size={13} />
              </Link>
            ) : (
              <button onClick={openSaveContact} disabled={pending} className="ir-btn ir-btn-ghost !px-2.5 !text-xs" title="Save the poster as an outsourced contact">
                <UserPlus size={13} />
              </button>
            )}
            <a href={r.url} target="_blank" rel="noreferrer" className="ir-btn ir-btn-ghost !px-2.5" title="Open the original listing">
              <ExternalLink size={13} />
            </a>
          </div>
        )}

        {showSave && (
          <div className="mt-3 rounded border border-black/10 bg-ir-ivory/60 p-3">
            <div className="ir-label mb-2">Save as outsourced contact</div>
            {loadingContact ? (
              <div className="flex items-center gap-1.5 text-xs text-black/40"><Loader2 size={12} className="animate-spin" /> Reading listing…</div>
            ) : (
              <div className="space-y-2">
                <input
                  value={contactFields.name}
                  onChange={(e) => setContactFields((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Name"
                  className="ir-input !text-xs"
                />
                <input
                  value={contactFields.phone}
                  onChange={(e) => setContactFields((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="Phone"
                  className="ir-input !text-xs"
                />
                {contactError && <p className="text-[0.7rem] text-[color:var(--color-brick)]">{contactError}</p>}
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowSave(false)} className="text-xs text-black/40 hover:text-ir-navy">Cancel</button>
                  <button onClick={confirmSaveContact} disabled={saving} className="ir-btn ir-btn-gold !py-1 !text-xs disabled:opacity-50">
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save contact
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
