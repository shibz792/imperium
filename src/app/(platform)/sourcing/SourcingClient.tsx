"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Search, Download, Check, X, Loader2, ExternalLink, UserPlus, CheckCircle2, ImageOff, SearchX, ArrowUpDown, Clock } from "lucide-react";
import { searchExternalListings, importListing, extractContactFromListing, saveOutsourcedContact, registerSourcedListing, type SourcingSearchResult } from "./actions";
import type { Draft, PropertyDraftFields } from "@/lib/intake-types";
import { ALL_DISTRICTS, PROPERTY_SUBTYPES } from "@/lib/locations";
import { titleCase } from "@/lib/format";

const SOURCE_LABEL: Record<string, string> = { ikman: "ikman.lk", lankapropertyweb: "LankaPropertyWeb" };
const DEAL_TYPE_LABEL: Record<string, string> = { BUY: "Buy", RENT: "Rent", LEASE: "Lease" };
type SortKey = "relevance" | "price-asc" | "price-desc" | "newest";

// Everything a search actually ran with, snapshotted at the moment results
// come back — the live filter inputs above keep changing as the agent
// tweaks them, but the chips row and result count need to describe what's
// actually on screen, not whatever's currently sitting in a dropdown.
type ImportTarget = { url: string; source: "ikman" | "lankapropertyweb" } & Partial<Pick<SourcingSearchResult, "price" | "location" | "size" | "imgUrl" | "bedrooms">>;

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

// When embedded inside Matchmaker for a specific requirement, the search
// starts pre-filled from that requirement's own criteria, and an approved
// import points back at the requirement instead of just "view the property".
type RequirementContext = { requirementId: string; requirementRef: string; requirementTitle: string };

export function SourcingClient({
  initialKeyword = "",
  initialDealType = "RENT",
  initialDistrict = "",
  initialPropertyType = "",
  requirementContext,
}: {
  initialKeyword?: string;
  initialDealType?: "BUY" | "RENT" | "LEASE";
  initialDistrict?: string;
  initialPropertyType?: string;
  requirementContext?: RequirementContext;
}) {
  const [sites, setSites] = useState<("ikman" | "lankapropertyweb")[]>(["ikman", "lankapropertyweb"]);
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
  const [pasteUrl, setPasteUrl] = useState("");
  const [results, setResults] = useState<SourcingSearchResult[]>([]);
  const [applied, setApplied] = useState<AppliedFilters | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("relevance");
  const [errors, setErrors] = useState<string[]>([]);
  const [searched, setSearched] = useState(false);
  const [pending, startTransition] = useTransition();
  const [importing, setImporting] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ draft: Draft; target: ImportTarget } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [registered, setRegistered] = useState<{ id: string } | null>(null);

  function toggleSite(s: "ikman" | "lankapropertyweb") {
    setSites((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

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
    setDraft(null);
    setRegistered(null);
    startTransition(async () => {
      const res = await searchExternalListings({
        sites,
        keyword: next.keyword,
        dealType: next.dealType,
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
      setErrors(res.errors);
      setApplied(next);
    });
  }

  // A pasted link has no scraped price/photo/etc to carry forward (only a
  // search result card does — see ImportTarget below); registering it
  // still works fine with those left blank, best-effort like everywhere
  // else in this file.
  function doImport(target: ImportTarget) {
    setImportError(null);
    setImporting(target.url);
    setRegistered(null);
    startTransition(async () => {
      const res = await importListing(target.url, target.source);
      setImporting(null);
      if (res.error || !res.draft) setImportError(res.error ?? "Import failed.");
      else setDraft({ draft: res.draft, target });
    });
  }

  const sortedResults = useMemo(() => {
    const list = [...results];
    if (sortBy === "price-asc") list.sort((a, b) => (a.priceValue ?? Infinity) - (b.priceValue ?? Infinity));
    else if (sortBy === "price-desc") list.sort((a, b) => (b.priceValue ?? -Infinity) - (a.priceValue ?? -Infinity));
    else if (sortBy === "newest") list.sort((a, b) => (a.postedDays ?? Infinity) - (b.postedDays ?? Infinity));
    return list;
  }, [results, sortBy]);

  const counts = useMemo(() => {
    const ikman = results.filter((r) => r.source === "ikman").length;
    const lpw = results.length - ikman;
    return { total: results.length, ikman, lpw };
  }, [results]);

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
    if (applied.sizeMin || applied.sizeMax) {
      const label = `${applied.sizeMin ? `${Number(applied.sizeMin).toLocaleString()}` : "0"} – ${applied.sizeMax ? `${Number(applied.sizeMax).toLocaleString()} sqft` : "no limit sqft"}`;
      chips.push({ key: "size", label, onRemove: () => runSearch({ sizeMin: "", sizeMax: "" }) });
    }
    if (applied.bedrooms) chips.push({ key: "beds", label: `${applied.bedrooms} bed`, onRemove: () => runSearch({ bedrooms: "" }) });
    if (applied.postedWithinDays) chips.push({ key: "posted", label: `Posted ≤ ${applied.postedWithinDays}d`, onRemove: () => runSearch({ postedWithinDays: "" }) });
  }

  return (
    <div>
      {requirementContext && (
        <p className="mb-3 text-xs text-black/50">
          Pre-filled from <span className="font-medium text-ir-navy">{requirementContext.requirementTitle}</span> ({requirementContext.requirementRef}). Adjust and search, then import anything that fits.
        </p>
      )}
      <div className="ir-card mb-5 p-5">
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label className="ir-label mb-1 block">Keyword</label>
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="pool, sea view, corner lot…" className="ir-input" />
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
          </div>
          <div>
            <label className="ir-label mb-1 block">City / area</label>
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Nugegoda, Colombo 7…" className="ir-input" />
          </div>
          <div>
            <label className="ir-label mb-1 block">Property type</label>
            <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)} className="ir-select">
              <option value="">Any</option>
              {Array.from(new Set(Object.values(PROPERTY_SUBTYPES).flat())).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-2 lg:col-span-2">
            <SourceToggle label="ikman.lk" checked={sites.includes("ikman")} onChange={() => toggleSite("ikman")} />
            <SourceToggle label="LankaPropertyWeb" checked={sites.includes("lankapropertyweb")} onChange={() => toggleSite("lankapropertyweb")} />
          </div>
          <div className="flex items-end lg:col-span-2">
            <button type="button" onClick={() => setMoreFilters((v) => !v)} className="text-xs font-medium text-ir-gold-dark hover:underline">
              {moreFilters ? "Fewer filters" : "+ Price, size, bedrooms, posted date"}
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
            <div>
              <label className="ir-label mb-1 block">Min size (sqft)</label>
              <input type="number" value={sizeMin} onChange={(e) => setSizeMin(e.target.value)} placeholder="0" className="ir-input" />
            </div>
            <div>
              <label className="ir-label mb-1 block">Max size (sqft)</label>
              <input type="number" value={sizeMax} onChange={(e) => setSizeMax(e.target.value)} placeholder="No limit" className="ir-input" />
            </div>
            <div>
              <label className="ir-label mb-1 block">Bedrooms</label>
              <input type="number" min="0" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} placeholder="Any" className="ir-input" />
            </div>
            <div>
              <label className="ir-label mb-1 block">Posted within (days)</label>
              <input type="number" min="1" value={postedWithinDays} onChange={(e) => setPostedWithinDays(e.target.value)} placeholder="Any time" className="ir-input" />
            </div>
            <p className="col-span-2 text-[0.65rem] text-black/35 sm:col-span-4">
              Price/bedrooms/posted-date are read from each listing&apos;s own text, not a structured field either site exposes — best-effort: a result missing that detail is kept rather than hidden. Size is also best-effort, and only ever present on LankaPropertyWeb results — ikman&apos;s search results don&apos;t carry a floor/land size at all, so a size filter never hides an ikman match.
            </p>
          </div>
        )}

        <button onClick={() => runSearch()} disabled={pending || sites.length === 0} className="ir-btn ir-btn-gold px-5 disabled:opacity-50">
          {pending && !importing ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
          Search live listings
        </button>
        <p className="mt-2 text-[0.7rem] text-black/40">Searches the sites the way a browser would, on your click, not a background crawler.</p>
      </div>

      <div className="ir-card mb-5 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[260px] flex-1">
          <label className="ir-label mb-1 block">Already have a specific listing link?</label>
          <input value={pasteUrl} onChange={(e) => setPasteUrl(e.target.value)} placeholder="https://ikman.lk/en/ad/… or lankapropertyweb.com/…" className="ir-input" />
        </div>
        <button
          onClick={() => doImport({ url: pasteUrl, source: pasteUrl.includes("ikman.lk") ? "ikman" : "lankapropertyweb" })}
          disabled={!pasteUrl || pending}
          className="ir-btn ir-btn-primary disabled:opacity-50"
        >
          <Download size={14} /> Import this link
        </button>
      </div>

      {errors.length > 0 && (
        <div className="mb-4 rounded border border-[#92601f4d] bg-[color:var(--color-bronze-tint)] p-3 text-xs text-[color:var(--color-bronze)]">
          {errors.join(" · ")}
        </div>
      )}
      {importError && (
        <div className="mb-4 rounded border border-[#8c4a3e4d] bg-[color:var(--color-brick-tint)] p-3 text-xs text-[color:var(--color-brick)]">{importError}</div>
      )}

      {draft && !registered && (
        <DraftReview draft={draft.draft} target={draft.target} onRegister={(id) => setRegistered({ id })} onDiscard={() => setDraft(null)} />
      )}
      {registered && (
        <div className="ir-card mb-5 border-emerald-200 bg-emerald-50/50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-emerald-800"><Check size={16} /> Registered as a sourced listing.</div>
            <Link href="/sourcing?tab=registered" className="text-xs font-medium text-emerald-700 hover:underline">View in Registered Listings →</Link>
          </div>
          <p className="mt-1.5 text-[0.7rem] text-emerald-700/80">
            This is a lead, not one of your properties yet — it won&rsquo;t show up in Properties or match against requirements until you promote it from Registered Listings.
            {requirementContext && " That's also where you'd promote it before matching it back to " + requirementContext.requirementRef + "."}
          </p>
        </div>
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
                    <option value="newest">Sort: Newest first</option>
                    <option value="price-asc">Sort: Price, low to high</option>
                    <option value="price-desc">Sort: Price, high to low</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {results.length > 0 && (
            <p className="mb-3 text-xs text-black/45">
              <span className="font-semibold text-ir-navy">{counts.total}</span> result{counts.total === 1 ? "" : "s"}
              {counts.ikman > 0 && counts.lpw > 0 && <> · {counts.ikman} ikman.lk · {counts.lpw} LankaPropertyWeb</>}
            </p>
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
                <ResultCard key={`${r.url}-${i}`} result={r} pending={pending} importing={importing} onImport={doImport} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SourceToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label
      className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded border px-2.5 py-2 text-xs font-medium transition-colors ${
        checked ? "border-ir-gold-dark/40 bg-ir-gold/10 text-ir-navy" : "border-black/10 text-black/40 hover:border-black/20"
      }`}
    >
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
      {checked && <Check size={12} className="text-ir-gold-dark" />} {label}
    </label>
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

function DraftReview({
  draft,
  target,
  onRegister,
  onDiscard,
}: {
  draft: Draft;
  target: ImportTarget;
  onRegister: (listingId: string) => void;
  onDiscard: () => void;
}) {
  const [fields, setFields] = useState<Record<string, unknown>>(draft.fields as Record<string, unknown>);
  const [pending, startTransition] = useTransition();
  const set = (k: string, v: unknown) => setFields((f) => ({ ...f, [k]: v }));

  return (
    <div className="ir-card mb-5 grid grid-cols-1 overflow-hidden lg:grid-cols-2">
      <div className="border-b border-black/8 bg-ir-ivory/60 p-4 lg:border-b-0 lg:border-r">
        <div className="ir-label mb-2">Fetched from {SOURCE_LABEL[target.source]}</div>
        <a href={target.url} target="_blank" rel="noreferrer" className="mb-2 inline-flex items-center gap-1 text-xs text-ir-gold-dark hover:underline">
          {target.url} <ExternalLink size={11} />
        </a>
        <p className="whitespace-pre-line text-[0.8125rem] leading-relaxed text-black/70">{draft.sourceExcerpt}</p>
      </div>
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="ir-badge bg-ir-navy/10 text-ir-navy">Sourced listing draft</span>
          <span className="ir-badge bg-ir-gold/20 text-ir-gold-dark">{draft.confidence}% confidence</span>
        </div>
        <p className="mb-3 text-[0.7rem] text-black/40">
          Registering keeps this as a lead, separate from your owned properties — you decide later, from Registered Listings, whether it&apos;s worth promoting to a real property.
        </p>
        {draft.duplicates.length > 0 && (
          <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
            Possible duplicate: {draft.duplicates.map((d) => `${d.label} (${d.ref})`).join(", ")}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <F label="Title"><input className="ir-input !text-xs" value={(fields.title as string) ?? ""} onChange={(e) => set("title", e.target.value)} /></F>
          <F label="Owner / poster name"><input className="ir-input !text-xs" value={(fields.ownerName as string) ?? ""} onChange={(e) => set("ownerName", e.target.value)} /></F>
          <F label="Owner / poster phone"><input className="ir-input !text-xs" value={(fields.ownerPhone as string) ?? ""} onChange={(e) => set("ownerPhone", e.target.value)} /></F>
          <F label="City"><input className="ir-input !text-xs" value={(fields.city as string) ?? ""} onChange={(e) => set("city", e.target.value)} /></F>
          <F label="Category">
            <select className="ir-select !text-xs" value={(fields.category as string) ?? "RESIDENTIAL"} onChange={(e) => set("category", e.target.value)}>
              {Object.keys(PROPERTY_SUBTYPES).map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
            </select>
          </F>
          <F label="Subtype"><input className="ir-input !text-xs" value={(fields.subtype as string) ?? ""} onChange={(e) => set("subtype", e.target.value)} /></F>
          <F label="Size (sqft)"><input type="number" className="ir-input !text-xs" value={(fields.sizeSqft as number) ?? ""} onChange={(e) => set("sizeSqft", Number(e.target.value) || undefined)} /></F>
          <F label="Price"><input type="number" className="ir-input !text-xs" value={(fields.totalPrice as number) ?? (fields.monthlyRental as number) ?? ""} onChange={(e) => set("totalPrice", Number(e.target.value) || undefined)} /></F>
        </div>
        {draft.missingFields.length > 0 && (
          <div className="mt-3 rounded border border-black/10 bg-black/[0.02] p-2.5 text-xs text-black/50">
            <span className="font-medium text-black/60">To confirm: </span>{draft.missingFields.join(", ")}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onDiscard} className="ir-btn ir-btn-ghost"><X size={14} /> Discard</button>
          <button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await registerSourcedListing(
                  fields as PropertyDraftFields,
                  draft.sourceExcerpt,
                  { price: target.price, location: target.location, size: target.size, imgUrl: target.imgUrl, bedrooms: target.bedrooms },
                  target.url,
                  target.source,
                );
                onRegister(res.id);
              })
            }
            className="ir-btn ir-btn-primary disabled:opacity-50"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Register listing
          </button>
        </div>
      </div>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="ir-label mb-1">{label}</div>
      {children}
    </div>
  );
}
