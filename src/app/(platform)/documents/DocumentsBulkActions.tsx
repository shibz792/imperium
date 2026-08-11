"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { useSelection } from "@/components/selection/SelectionContext";
import { downloadCsv } from "@/lib/csv";
import { bulkDeleteDocuments, bulkChangeDocumentCategory } from "./actions";
import type { BulkActionResult } from "@/lib/bulk";

// Pre-redacted, already-formatted server-side (see documents/page.tsx) —
// excludes the internal Supabase storage key and any raw download link, so
// downloads always keep going through the gated, audited
// /api/documents/[id]/download route rather than a link in a CSV.
export type DocumentExportRow = {
  id: string;
  name: string;
  category: string;
  confidential: string;
  linkedTo: string;
  uploadedBy: string;
  date: string;
};

const CATEGORIES = ["DEED", "SURVEY_PLAN", "COC", "APPROVED_PLAN", "MUNICIPAL", "TAX", "AGREEMENT", "IDENTIFICATION", "OTHER"];

export function DocumentsBulkActions({ rows, canDelete }: { rows: DocumentExportRow[]; canDelete: boolean }) {
  const { selected, clear } = useSelection();
  const [category, setCategory] = useState(CATEGORIES[0]);
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
      "documents.csv",
      ["Name", "Category", "Confidential", "Linked to", "Uploaded by", "Date"],
      ids.map((id) => {
        const r = byId.get(id);
        if (!r) return [id];
        return [r.name, r.category, r.confidential, r.linkedTo, r.uploadedBy, r.date];
      }),
    );
  }

  return (
    <div className="ir-card mb-3 flex flex-wrap items-center gap-2.5 border-ir-gold/40 bg-ir-gold/5 p-3">
      {ids.length > 0 && (
        <>
          <span className="text-xs font-medium text-ir-navy">{ids.length} selected</span>

          <select value={category} onChange={(e) => setCategory(e.target.value)} className="ir-select !py-1.5 !text-xs">
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c.replace("_", " ")}</option>
            ))}
          </select>
          <button type="button" disabled={pending} onClick={() => run(() => bulkChangeDocumentCategory(ids, category))} className="ir-btn ir-btn-ghost !py-1.5 !text-xs disabled:opacity-50">
            Set category
          </button>

          <button type="button" onClick={exportCsv} className="ir-btn ir-btn-ghost !py-1.5 !text-xs">Export CSV</button>

          {canDelete && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (window.confirm(`Permanently delete ${ids.length} document${ids.length === 1 ? "" : "s"}? This can't be undone.`)) {
                  run(() => bulkDeleteDocuments(ids));
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
