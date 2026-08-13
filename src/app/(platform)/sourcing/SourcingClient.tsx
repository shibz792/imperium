"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Download, Check, X, Loader2, ExternalLink } from "lucide-react";
import { importListing, registerSourcedListing } from "./actions";
import { SiteSearchPanel, type ImportTarget } from "./SiteSearchPanel";
import type { Draft, PropertyDraftFields } from "@/lib/intake-types";
import { PROPERTY_SUBTYPES } from "@/lib/locations";
import { titleCase } from "@/lib/format";

const SOURCE_LABEL: Record<string, string> = { ikman: "ikman.lk", lankapropertyweb: "LankaPropertyWeb" };
type Source = "ikman" | "lankapropertyweb";

// When embedded inside Matchmaker for a specific requirement, the search
// starts pre-filled from that requirement's own criteria, and an approved
// import points back at the requirement instead of just "view the property".
type RequirementContext = { requirementId: string; requirementRef: string; requirementTitle: string };

// ikman.lk and LankaPropertyWeb are searched separately, not merged into
// one combined result list — they support genuinely different filters (see
// SiteSearchPanel's own comment) and mixing them meant offering filters
// that silently didn't do anything on whichever site couldn't support
// them. This component is now just: a tab to pick which site, that site's
// own tailored search panel, and the shared paste-a-link / review / register
// flow underneath, since importing a specific listing works the same way
// regardless of which site it came from.
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
  const [activeSource, setActiveSource] = useState<Source>("ikman");
  const [pasteUrl, setPasteUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const [importing, setImporting] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ draft: Draft; target: ImportTarget } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [registered, setRegistered] = useState<{ id: string } | null>(null);

  // A pasted link has no scraped price/photo/etc to carry forward (only a
  // search result card does); registering it still works fine with those
  // left blank, best-effort like everywhere else in this file.
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

  return (
    <div>
      {requirementContext && (
        <p className="mb-3 text-xs text-black/50">
          Pre-filled from <span className="font-medium text-ir-navy">{requirementContext.requirementTitle}</span> ({requirementContext.requirementRef}). Adjust and search, then import anything that fits.
        </p>
      )}

      <div className="mb-5 flex gap-1.5">
        <SiteTab label="ikman.lk" active={activeSource === "ikman"} onClick={() => setActiveSource("ikman")} />
        <SiteTab label="LankaPropertyWeb" active={activeSource === "lankapropertyweb"} onClick={() => setActiveSource("lankapropertyweb")} />
      </div>

      {activeSource === "ikman" ? (
        <SiteSearchPanel
          key="ikman"
          source="ikman"
          initialKeyword={initialKeyword}
          initialDealType={initialDealType}
          initialDistrict={initialDistrict}
          initialPropertyType={initialPropertyType}
          onImport={doImport}
          importPending={pending}
          importingUrl={importing}
        />
      ) : (
        <SiteSearchPanel
          key="lankapropertyweb"
          source="lankapropertyweb"
          initialKeyword={initialKeyword}
          initialDealType={initialDealType}
          initialDistrict={initialDistrict}
          initialPropertyType={initialPropertyType}
          onImport={doImport}
          importPending={pending}
          importingUrl={importing}
        />
      )}

      <div className="ir-card my-5 flex flex-wrap items-end gap-3 p-4">
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
    </div>
  );
}

function SiteTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-t border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
        active ? "border-ir-gold bg-white text-ir-navy" : "border-transparent text-black/40 hover:text-ir-navy"
      }`}
    >
      {label}
    </button>
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
