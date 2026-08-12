"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { useSelection } from "@/components/selection/SelectionContext";
import { downloadCsv } from "@/lib/csv";
import { bulkDeleteContacts, bulkChangeContactType, bulkReassignContactAgent } from "./actions";
import type { BulkActionResult } from "@/lib/bulk";

// Pre-redacted, already-formatted server-side (see contacts/page.tsx) — the
// one entity in this feature where redaction really matters: `phone` is
// only ever the real number when the server already decided this viewer
// can see it (showConfidential), matching the "Restricted" the on-screen
// table shows otherwise. Email is included — not confidentiality-gated
// anywhere else in this app, and useful for a contact-list export.
export type ContactExportRow = {
  id: string;
  contactRef: string;
  name: string;
  companyName: string;
  contactType: string;
  phone: string;
  email: string;
  city: string;
  district: string;
  agent: string;
};

const TYPES = ["OWNER", "BUYER", "TENANT", "BROKER", "DEVELOPER", "INVESTOR", "CORPORATE", "OUTSOURCED"];

export function ContactsBulkActions({ rows, agents, canDelete }: { rows: ContactExportRow[]; agents: { id: string; name: string }[]; canDelete: boolean }) {
  const { selected, clear } = useSelection();
  const [contactType, setContactType] = useState(TYPES[0]);
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ succeeded: number; failed: { label: string; error: string }[] } | null>(null);

  const ids = Array.from(selected);
  const byId = new Map(rows.map((r) => [r.id, r]));
  // Selection is cleared as soon as a bulk action's result comes back (see
  // run() below), so the result banner has to be able to render on its own.
  if (ids.length === 0 && !result) return null;

  function run(action: () => Promise<BulkActionResult>) {
    setResult(null);
    startTransition(async () => {
      const r = await action();
      setResult({ succeeded: r.succeeded.length, failed: r.failed.map((f) => ({ label: byId.get(f.id)?.name ?? f.id, error: f.error })) });
      clear();
    });
  }

  function exportCsv() {
    downloadCsv(
      "contacts.csv",
      ["Reference", "Name", "Company", "Type", "Phone", "Email", "City", "District", "Agent"],
      ids.map((id) => {
        const r = byId.get(id);
        if (!r) return [id];
        return [r.contactRef, r.name, r.companyName, r.contactType, r.phone, r.email, r.city, r.district, r.agent];
      }),
    );
  }

  return (
    <div className="ir-card mb-3 flex flex-wrap items-center gap-2.5 border-ir-gold/40 bg-ir-gold/5 p-3">
      {ids.length > 0 && (
        <>
          <span className="text-xs font-medium text-ir-navy">{ids.length} selected</span>

          <select value={contactType} onChange={(e) => setContactType(e.target.value)} className="ir-select !py-1.5 !text-xs">
            {TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button type="button" disabled={pending} onClick={() => run(() => bulkChangeContactType(ids, contactType))} className="ir-btn ir-btn-ghost !py-1.5 !text-xs disabled:opacity-50">
            Set type
          </button>

          {agents.length > 0 && (
            <>
              <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="ir-select !py-1.5 !text-xs">
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <button type="button" disabled={pending || !agentId} onClick={() => run(() => bulkReassignContactAgent(ids, agentId))} className="ir-btn ir-btn-ghost !py-1.5 !text-xs disabled:opacity-50">
                Reassign
              </button>
            </>
          )}

          <button type="button" onClick={exportCsv} className="ir-btn ir-btn-ghost !py-1.5 !text-xs">Export CSV</button>

          {canDelete && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (window.confirm(`Permanently delete ${ids.length} contact${ids.length === 1 ? "" : "s"}? This can't be undone.`)) {
                  run(() => bulkDeleteContacts(ids));
                }
              }}
              className="ir-btn ir-btn-ghost !py-1.5 !text-xs text-[color:var(--color-brick)]"
            >
              Delete
            </button>
          )}

          {pending && <Loader2 size={14} className="animate-spin text-black/40" />}

          <button type="button" onClick={clear} className="ml-auto text-xs text-black/40 hover:text-ir-navy">Clear</button>
        </>
      )}

      {result && (
        <div className="w-full text-xs">
          <span className="text-[color:var(--color-forest)]">{result.succeeded} succeeded.</span>{" "}
          {result.failed.length > 0 && (
            <span className="text-[color:var(--color-brick)]">
              {result.failed.length} failed: {result.failed.map((f) => `${f.label} (${f.error})`).join("; ")}
            </span>
          )}{" "}
          <button type="button" onClick={() => setResult(null)} className="text-black/40 hover:text-ir-navy">Dismiss</button>
        </div>
      )}
    </div>
  );
}
