"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { useSelection } from "@/components/selection/SelectionContext";
import { downloadCsv } from "@/lib/csv";
import { bulkDeleteProperties, bulkChangeListingStatus, bulkReassignPropertyAgent } from "./actions";
import type { BulkActionResult } from "@/lib/bulk";

// Pre-redacted, already-formatted server-side (see properties/page.tsx) —
// nothing confidential (ownerMinPrice, markup, legal notes) is on this
// shape, and price/date are already display strings so this component
// never needs to import formatCurrency/formatDate itself.
export type PropertyExportRow = {
  id: string;
  propertyRef: string;
  title: string;
  category: string;
  subtype: string;
  transactionType: string;
  listingStatus: string;
  district: string;
  city: string;
  price: string;
  agent: string;
  lastVerified: string;
};

const STATUSES = ["DRAFT", "ACTIVE", "UNDER_OFFER", "RESERVED", "SOLD", "RENTED", "WITHDRAWN", "EXPIRED"];

export function PropertiesBulkActions({ rows, agents, canDelete }: { rows: PropertyExportRow[]; agents: { id: string; name: string }[]; canDelete: boolean }) {
  const { selected, clear } = useSelection();
  const [status, setStatus] = useState(STATUSES[0]);
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ succeeded: number; failed: { label: string; error: string }[] } | null>(null);

  const ids = Array.from(selected);
  const byId = new Map(rows.map((r) => [r.id, r]));
  // Selection is cleared as soon as a bulk action's result comes back (see
  // run() below), so the result banner has to be able to render on its own
  // — returning null here whenever nothing's selected would hide the
  // banner the instant the action that produced it finishes.
  if (ids.length === 0 && !result) return null;

  function run(action: () => Promise<BulkActionResult>) {
    setResult(null);
    startTransition(async () => {
      const r = await action();
      setResult({ succeeded: r.succeeded.length, failed: r.failed.map((f) => ({ label: byId.get(f.id)?.title ?? f.id, error: f.error })) });
      clear();
    });
  }

  function exportCsv() {
    downloadCsv(
      "properties.csv",
      ["Reference", "Title", "Category", "Subtype", "Transaction", "Status", "District", "City", "Price", "Agent", "Last Verified"],
      ids.map((id) => {
        const r = byId.get(id);
        if (!r) return [id];
        return [r.propertyRef, r.title, r.category, r.subtype, r.transactionType, r.listingStatus, r.district, r.city, r.price, r.agent, r.lastVerified];
      }),
    );
  }

  return (
    <div className="ir-card mb-3 flex flex-wrap items-center gap-2.5 border-ir-gold/40 bg-ir-gold/5 p-3">
      {ids.length > 0 && (
        <>
          <span className="text-xs font-medium text-ir-navy">{ids.length} selected</span>

          <select value={status} onChange={(e) => setStatus(e.target.value)} className="ir-select !py-1.5 !text-xs">
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>
          <button type="button" disabled={pending} onClick={() => run(() => bulkChangeListingStatus(ids, status))} className="ir-btn ir-btn-ghost !py-1.5 !text-xs disabled:opacity-50">
            Set status
          </button>

          {agents.length > 0 && (
            <>
              <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="ir-select !py-1.5 !text-xs">
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <button type="button" disabled={pending || !agentId} onClick={() => run(() => bulkReassignPropertyAgent(ids, agentId))} className="ir-btn ir-btn-ghost !py-1.5 !text-xs disabled:opacity-50">
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
                if (window.confirm(`Permanently delete ${ids.length} propert${ids.length === 1 ? "y" : "ies"}? This can't be undone, and only works for records nothing else references.`)) {
                  run(() => bulkDeleteProperties(ids));
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
