"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Search, Download, Check, X, Loader2, ExternalLink } from "lucide-react";
import { searchExternalListings, importListing } from "./actions";
import { approvePropertyDraft } from "../ai-intake/actions";
import type { SourcingResult } from "@/lib/sourcing";
import type { Draft, PropertyDraftFields } from "@/lib/intake-types";
import { ALL_DISTRICTS, PROPERTY_SUBTYPES } from "@/lib/locations";
import { titleCase } from "@/lib/format";

const SOURCE_LABEL: Record<string, string> = { ikman: "ikman.lk", lankapropertyweb: "LankaPropertyWeb" };

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
  const [propertyType, setPropertyType] = useState(initialPropertyType);
  const [pasteUrl, setPasteUrl] = useState("");
  const [results, setResults] = useState<SourcingResult[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [searched, setSearched] = useState(false);
  const [pending, startTransition] = useTransition();
  const [importing, setImporting] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ draft: Draft; url: string; source: "ikman" | "lankapropertyweb" } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [approved, setApproved] = useState<{ id: string } | null>(null);

  function toggleSite(s: "ikman" | "lankapropertyweb") {
    setSites((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  function search() {
    setSearched(true);
    setDraft(null);
    setApproved(null);
    startTransition(async () => {
      const res = await searchExternalListings({ sites, keyword, dealType, district: district || undefined, propertyType: propertyType || undefined });
      setResults(res.results);
      setErrors(res.errors);
    });
  }

  function doImport(url: string, source: "ikman" | "lankapropertyweb") {
    setImportError(null);
    setImporting(url);
    setApproved(null);
    startTransition(async () => {
      const res = await importListing(url, source);
      setImporting(null);
      if (res.error || !res.draft) setImportError(res.error ?? "Import failed.");
      else setDraft({ draft: res.draft, url, source });
    });
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
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="warehouse, 3BR apartment…" className="ir-input" />
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
            <label className="ir-label mb-1 block">Property type</label>
            <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)} className="ir-select">
              <option value="">Any</option>
              {Array.from(new Set(Object.values(PROPERTY_SUBTYPES).flat())).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-4 lg:col-span-2">
            <label className="flex items-center gap-2 text-sm text-ir-navy">
              <input type="checkbox" checked={sites.includes("ikman")} onChange={() => toggleSite("ikman")} className="h-4 w-4 accent-ir-gold-dark" /> ikman.lk
            </label>
            <label className="flex items-center gap-2 text-sm text-ir-navy">
              <input type="checkbox" checked={sites.includes("lankapropertyweb")} onChange={() => toggleSite("lankapropertyweb")} className="h-4 w-4 accent-ir-gold-dark" /> LankaPropertyWeb
            </label>
          </div>
        </div>
        <button onClick={search} disabled={pending || sites.length === 0} className="ir-btn ir-btn-gold px-5 disabled:opacity-50">
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
          onClick={() => doImport(pasteUrl, pasteUrl.includes("ikman.lk") ? "ikman" : "lankapropertyweb")}
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

      {draft && !approved && (
        <DraftReview draft={draft.draft} url={draft.url} source={draft.source} onApprove={(id) => setApproved({ id })} onDiscard={() => setDraft(null)} />
      )}
      {approved && (
        <div className="ir-card mb-5 border-emerald-200 bg-emerald-50/50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-emerald-800"><Check size={16} /> Imported as a draft property.</div>
            <div className="flex items-center gap-3">
              {requirementContext && (
                <Link href={`/matchmaker?mode=requirement&requirementId=${requirementContext.requirementId}`} className="text-xs font-medium text-emerald-700 hover:underline">
                  Back to {requirementContext.requirementRef} matches →
                </Link>
              )}
              <Link href={`/properties/${approved.id}`} className="text-xs font-medium text-emerald-700 hover:underline">View record →</Link>
            </div>
          </div>
          <p className="mt-1.5 text-[0.7rem] text-emerald-700/80">It&rsquo;s saved as a draft, not visible to clients yet. Verify the details and activate the listing before it shows up as a match.</p>
        </div>
      )}

      {searched && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((r, i) => (
            <div key={i} className="ir-card flex flex-col p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="ir-badge border-[#09152640] bg-[#0915260d] text-ir-navy">{SOURCE_LABEL[r.source]}</span>
                {r.postedAgo && <span className="text-[0.65rem] text-black/35">{r.postedAgo}</span>}
              </div>
              <h3 className="mb-1 line-clamp-2 text-sm font-semibold text-ir-navy">{r.title}</h3>
              <p className="mb-1 text-xs text-black/45">{r.location}{r.size ? ` · ${r.size}` : ""}</p>
              {r.price && <p className="ir-figure mb-3 text-lg text-ir-gold-dark">{r.price}</p>}
              <div className="mt-auto flex items-center gap-2">
                <button onClick={() => doImport(r.url, r.source)} disabled={pending} className="ir-btn ir-btn-primary flex-1 justify-center !text-xs disabled:opacity-50">
                  {importing === r.url ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Import &amp; review
                </button>
                <a href={r.url} target="_blank" rel="noreferrer" className="ir-btn ir-btn-ghost !px-2.5">
                  <ExternalLink size={13} />
                </a>
              </div>
            </div>
          ))}
          {results.length === 0 && !pending && <p className="col-span-full text-center text-xs text-black/40 py-10">No results. Try a different keyword or district.</p>}
        </div>
      )}
    </div>
  );
}

function DraftReview({
  draft,
  url,
  source,
  onApprove,
  onDiscard,
}: {
  draft: Draft;
  url: string;
  source: "ikman" | "lankapropertyweb";
  onApprove: (propertyId: string) => void;
  onDiscard: () => void;
}) {
  const [fields, setFields] = useState<Record<string, unknown>>(draft.fields as Record<string, unknown>);
  const [pending, startTransition] = useTransition();
  const set = (k: string, v: unknown) => setFields((f) => ({ ...f, [k]: v }));

  return (
    <div className="ir-card mb-5 grid grid-cols-1 overflow-hidden lg:grid-cols-2">
      <div className="border-b border-black/8 bg-ir-ivory/60 p-4 lg:border-b-0 lg:border-r">
        <div className="ir-label mb-2">Fetched from {SOURCE_LABEL[source]}</div>
        <a href={url} target="_blank" rel="noreferrer" className="mb-2 inline-flex items-center gap-1 text-xs text-ir-gold-dark hover:underline">
          {url} <ExternalLink size={11} />
        </a>
        <p className="whitespace-pre-line text-[0.8125rem] leading-relaxed text-black/70">{draft.sourceExcerpt}</p>
      </div>
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="ir-badge bg-ir-navy/10 text-ir-navy">Property draft</span>
          <span className="ir-badge bg-ir-gold/20 text-ir-gold-dark">{draft.confidence}% confidence</span>
        </div>
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
                const label = SOURCE_LABEL[source];
                const res = await approvePropertyDraft(fields as PropertyDraftFields, draft.sourceExcerpt, { source: label, sourceUrl: url });
                onApprove(res.id);
              })
            }
            className="ir-btn ir-btn-primary disabled:opacity-50"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Approve &amp; create
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
