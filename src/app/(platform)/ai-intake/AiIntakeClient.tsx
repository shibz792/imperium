"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Sparkles, AlertTriangle, Check, X, Loader2 } from "lucide-react";
import { extractAction, approvePropertyDraft, approveRequirementDraft } from "./actions";
import type { Draft, PropertyDraftFields, RequirementDraftFields } from "@/lib/intake-types";
import { titleCase } from "@/lib/format";
import { PROPERTY_SUBTYPES } from "@/lib/locations";

const SAMPLE = `Adam needs approximately 15,000–20,000 sqft warehouse around Peliyagoda, Wattala or Kelaniya. Rental preferred. Container access needed. Budget not confirmed. Call +94772345601.

Selling a 3BR apartment in Nugegoda, Sea Breeze Residencies, 1450 sqft, asking Rs. 42,000,000 negotiable. Owner Manel Rathnayake, +94771234502. Has parking, gym, 24 hour security.`;

const MODES: { key: "AUTO" | "PROPERTY" | "REQUIREMENT" | "UPDATE"; label: string; hint: string }[] = [
  { key: "AUTO", label: "Detect both automatically", hint: "Recommended for mixed messages" },
  { key: "PROPERTY", label: "Create properties", hint: "Treat every item as a listing" },
  { key: "REQUIREMENT", label: "Create requirements", hint: "Treat every item as a search" },
  { key: "UPDATE", label: "Update existing records", hint: "Flags likely duplicates for review" },
];

export function AiIntakeClient({ groqEnabled }: { groqEnabled: boolean }) {
  const [rawText, setRawText] = useState("");
  const [mode, setMode] = useState<"AUTO" | "PROPERTY" | "REQUIREMENT" | "UPDATE">("AUTO");
  const [engine, setEngine] = useState<"groq" | "heuristic" | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [resolved, setResolved] = useState<Record<string, { status: "approved" | "rejected"; recordId?: string }>>({});
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function runExtract() {
    if (!rawText.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await extractAction(rawText, mode);
        setEngine(result.engine);
        setDrafts(result.drafts);
        setResolved({});
      } catch {
        setError("Extraction failed. Check the server logs (or your GROQ_API_KEY) and try again.");
      }
    });
  }

  return (
    <div>
      <div className="ir-card mb-5 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                title={m.hint}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${mode === m.key ? "bg-ir-navy text-white" : "bg-black/5 text-black/60 hover:bg-black/10"}`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setRawText(SAMPLE)} className="text-xs text-ir-gold-dark hover:underline">
            Insert example
          </button>
        </div>
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          rows={8}
          placeholder="Paste WhatsApp conversations, emails, notes, or spreadsheet rows here…"
          className="ir-input font-mono text-[0.8125rem] leading-relaxed"
        />
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[0.7rem] text-black/40">
            {groqEnabled ? "Real LLM extraction via Groq is active." : "Running the offline heuristic parser. Set GROQ_API_KEY for real LLM extraction."}
          </p>
          <button type="button" onClick={runExtract} disabled={pending || !rawText.trim()} className="ir-btn ir-btn-gold px-5 disabled:opacity-50">
            {pending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {pending ? "Extracting…" : "Extract records"}
          </button>
        </div>
        {error && <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
      </div>

      {drafts.length > 0 && (
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-medium text-ir-navy">
            {drafts.length} draft{drafts.length !== 1 ? "s" : ""} extracted
          </div>
          <span className="ir-badge bg-black/6 text-black/55">Engine: {engine === "groq" ? "Groq LLM" : "Offline heuristic parser"}</span>
        </div>
      )}

      <div className="space-y-5">
        {drafts.map((draft) => (
          <DraftCard
            key={draft.id}
            draft={draft}
            resolution={resolved[draft.id]}
            onApprove={(fields) =>
              startTransition(async () => {
                const res =
                  draft.kind === "property"
                    ? await approvePropertyDraft(fields as PropertyDraftFields, draft.sourceExcerpt)
                    : await approveRequirementDraft(fields as RequirementDraftFields, draft.sourceExcerpt);
                setResolved((r) => ({ ...r, [draft.id]: { status: "approved", recordId: res.id } }));
              })
            }
            onReject={() => setResolved((r) => ({ ...r, [draft.id]: { status: "rejected" } }))}
          />
        ))}
      </div>
    </div>
  );
}

function DraftCard({
  draft,
  resolution,
  onApprove,
  onReject,
}: {
  draft: Draft;
  resolution?: { status: "approved" | "rejected"; recordId?: string };
  onApprove: (fields: PropertyDraftFields | RequirementDraftFields) => void;
  onReject: () => void;
}) {
  const [fields, setFields] = useState<Record<string, unknown>>(draft.fields as Record<string, unknown>);
  const set = (k: string, v: unknown) => setFields((f) => ({ ...f, [k]: v }));

  if (resolution?.status === "approved") {
    return (
      <div className="ir-card flex items-center justify-between border-emerald-200 bg-emerald-50/50 p-4">
        <div className="flex items-center gap-2 text-sm text-emerald-800">
          <Check size={16} /> Approved and created as a {draft.kind}.
        </div>
        {resolution.recordId && (
          <Link href={`/${draft.kind === "property" ? "properties" : "requirements"}/${resolution.recordId}`} className="text-xs font-medium text-emerald-700 hover:underline">
            View record →
          </Link>
        )}
      </div>
    );
  }
  if (resolution?.status === "rejected") {
    return <div className="ir-card flex items-center gap-2 border-black/8 p-4 text-sm text-black/40"><X size={16} /> Discarded.</div>;
  }

  return (
    <div className="ir-card grid grid-cols-1 overflow-hidden lg:grid-cols-2">
      <div className="border-b border-black/8 bg-ir-ivory/60 p-4 lg:border-b-0 lg:border-r">
        <div className="ir-label mb-2">Original message</div>
        <p className="whitespace-pre-line text-[0.8125rem] leading-relaxed text-black/70">{draft.sourceExcerpt}</p>
      </div>

      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className={`ir-badge ${draft.kind === "property" ? "bg-ir-navy/10 text-ir-navy" : "bg-ir-gold/20 text-ir-gold-dark"}`}>
            {draft.kind === "property" ? "Property draft" : "Requirement draft"}
          </span>
          <ConfidencePill value={draft.confidence} />
        </div>

        {draft.duplicates.length > 0 && (
          <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
            <div className="mb-1 flex items-center gap-1.5 font-semibold"><AlertTriangle size={13} /> Possible duplicate</div>
            {draft.duplicates.map((d, i) => (
              <div key={i}>
                {d.label} ({d.ref}): {d.reason}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2.5">
          {draft.kind === "property" ? (
            <PropertyFields fields={fields} set={set} draft={draft} />
          ) : (
            <RequirementFields fields={fields} set={set} draft={draft} />
          )}
        </div>

        {draft.missingFields.length > 0 && (
          <div className="mt-3 rounded border border-black/10 bg-black/[0.02] p-2.5 text-xs text-black/50">
            <span className="font-medium text-black/60">Missing / to confirm: </span>
            {draft.missingFields.join(", ")}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onReject} className="ir-btn ir-btn-ghost">
            <X size={14} /> Reject
          </button>
          <button type="button" onClick={() => onApprove(fields as never)} className="ir-btn ir-btn-primary">
            <Check size={14} /> Approve & create
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfidencePill({ value }: { value: number }) {
  const tone = value >= 80 ? "bg-emerald-100 text-emerald-800" : value >= 50 ? "bg-ir-gold/20 text-ir-gold-dark" : "bg-red-100 text-red-700";
  return <span className={`ir-badge ${tone}`}>{value}% confidence</span>;
}

function FieldRow({ label, confidence, children }: { label: string; confidence?: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="ir-label">{label}</label>
        {confidence !== undefined && <span className="text-[0.65rem] text-black/35">{confidence}%</span>}
      </div>
      {children}
    </div>
  );
}

function PropertyFields({ fields, set, draft }: { fields: Record<string, unknown>; set: (k: string, v: unknown) => void; draft: Draft }) {
  const conf = draft.fieldConfidence;
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <FieldRow label="Title" confidence={conf.title}>
        <input className="ir-input !text-xs" value={(fields.title as string) ?? ""} onChange={(e) => set("title", e.target.value)} />
      </FieldRow>
      <FieldRow label="Owner name" confidence={conf.ownerName}>
        <input className="ir-input !text-xs" value={(fields.ownerName as string) ?? ""} onChange={(e) => set("ownerName", e.target.value)} />
      </FieldRow>
      <FieldRow label="Owner phone" confidence={conf.ownerPhone}>
        <input className="ir-input !text-xs" value={(fields.ownerPhone as string) ?? ""} onChange={(e) => set("ownerPhone", e.target.value)} />
      </FieldRow>
      <FieldRow label="Category">
        <select className="ir-select !text-xs" value={(fields.category as string) ?? "RESIDENTIAL"} onChange={(e) => set("category", e.target.value)}>
          {Object.keys(PROPERTY_SUBTYPES).map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
        </select>
      </FieldRow>
      <FieldRow label="Subtype" confidence={conf.subtype}>
        <input className="ir-input !text-xs" value={(fields.subtype as string) ?? ""} onChange={(e) => set("subtype", e.target.value)} />
      </FieldRow>
      <FieldRow label="Transaction">
        <select className="ir-select !text-xs" value={(fields.transactionType as string) ?? "SALE"} onChange={(e) => set("transactionType", e.target.value)}>
          {["SALE", "RENT", "LEASE", "SHORT_TERM_RENTAL"].map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
        </select>
      </FieldRow>
      <FieldRow label="City" confidence={conf.city}>
        <input className="ir-input !text-xs" value={(fields.city as string) ?? ""} onChange={(e) => set("city", e.target.value)} />
      </FieldRow>
      <FieldRow label="Size (sqft)" confidence={conf.sizeSqft}>
        <input type="number" className="ir-input !text-xs" value={(fields.sizeSqft as number) ?? ""} onChange={(e) => set("sizeSqft", Number(e.target.value) || undefined)} />
      </FieldRow>
      <FieldRow label="Price / rent" confidence={conf.totalPrice}>
        <input
          type="number"
          className="ir-input !text-xs"
          value={(fields.totalPrice as number) ?? (fields.monthlyRental as number) ?? (fields.annualLeaseValue as number) ?? ""}
          onChange={(e) => {
            const v = Number(e.target.value) || undefined;
            const t = fields.transactionType as string;
            if (t === "RENT" || t === "SHORT_TERM_RENTAL") set("monthlyRental", v);
            else if (t === "LEASE") set("annualLeaseValue", v);
            else set("totalPrice", v);
          }}
        />
      </FieldRow>
    </div>
  );
}

function RequirementFields({ fields, set, draft }: { fields: Record<string, unknown>; set: (k: string, v: unknown) => void; draft: Draft }) {
  const conf = draft.fieldConfidence;
  const locations = Array.isArray(fields.locations) ? (fields.locations as string[]) : [];
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <FieldRow label="Client name" confidence={conf.clientName}>
        <input className="ir-input !text-xs" value={(fields.clientName as string) ?? ""} onChange={(e) => set("clientName", e.target.value)} />
      </FieldRow>
      <FieldRow label="Client phone" confidence={conf.clientPhone}>
        <input className="ir-input !text-xs" value={(fields.clientPhone as string) ?? ""} onChange={(e) => set("clientPhone", e.target.value)} />
      </FieldRow>
      <FieldRow label="Deal type">
        <select className="ir-select !text-xs" value={(fields.dealType as string) ?? "BUY"} onChange={(e) => set("dealType", e.target.value)}>
          {["BUY", "RENT", "LEASE"].map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
        </select>
      </FieldRow>
      <FieldRow label="Category">
        <select className="ir-select !text-xs" value={(fields.category as string) ?? "RESIDENTIAL"} onChange={(e) => set("category", e.target.value)}>
          {Object.keys(PROPERTY_SUBTYPES).map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
        </select>
      </FieldRow>
      <FieldRow label="Subtype" confidence={conf.subtype}>
        <input className="ir-input !text-xs" value={(fields.subtype as string) ?? ""} onChange={(e) => set("subtype", e.target.value)} />
      </FieldRow>
      <FieldRow label="Locations" confidence={conf.locations}>
        <input className="ir-input !text-xs" value={locations.join(", ")} onChange={(e) => set("locations", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />
      </FieldRow>
      <FieldRow label="Size max (sqft)" confidence={conf.sizeMax}>
        <input type="number" className="ir-input !text-xs" value={(fields.sizeMax as number) ?? ""} onChange={(e) => set("sizeMax", Number(e.target.value) || undefined)} />
      </FieldRow>
      <FieldRow label="Budget max" confidence={conf.budgetMax}>
        <input type="number" className="ir-input !text-xs" value={(fields.budgetMax as number) ?? ""} onChange={(e) => set("budgetMax", Number(e.target.value) || undefined)} />
      </FieldRow>
      <FieldRow label="Urgency">
        <select className="ir-select !text-xs" value={(fields.urgency as string) ?? "MEDIUM"} onChange={(e) => set("urgency", e.target.value)}>
          {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((u) => <option key={u} value={u}>{titleCase(u)}</option>)}
        </select>
      </FieldRow>
    </div>
  );
}
