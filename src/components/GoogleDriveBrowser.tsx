"use client";

import { useState, useTransition } from "react";
import { Folder, FileText, ImageIcon, Loader2, X, CloudDownload } from "lucide-react";
import { browseDrive } from "@/lib/driveBrowse";

const FOLDER_MIME = "application/vnd.google-apps.folder";

type DriveFile = { id: string; name: string; mimeType: string };

// A minimal in-app Drive file browser — folder navigation, multi-select,
// import. Not the Google Picker widget (that needs a second API key and a
// client-side script tag); this uses the same OAuth token already on hand
// server-side, one moving part instead of two.
export function GoogleDriveBrowser({
  onImport,
  filter = "any",
  label = "Import from Drive",
}: {
  onImport: (fileIds: string[]) => Promise<{ ok: boolean; error?: string } | void>;
  filter?: "image" | "any";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [trail, setTrail] = useState<{ id?: string; name: string }[]>([{ id: undefined, name: "My Drive" }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function load(folderId?: string) {
    setLoading(true);
    setError(null);
    const result = await browseDrive(folderId);
    setLoading(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setFiles(filter === "image" ? result.files.filter((f) => f.mimeType.startsWith("image/") || f.mimeType === FOLDER_MIME) : result.files);
  }

  function openBrowser() {
    setOpen(true);
    setSelected(new Set());
    setTrail([{ id: undefined, name: "My Drive" }]);
    load(undefined);
  }

  function enterFolder(f: DriveFile) {
    setTrail((s) => [...s, { id: f.id, name: f.name }]);
    load(f.id);
  }

  function goTo(index: number) {
    setTrail((s) => s.slice(0, index + 1));
    load(trail[index].id);
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function doImport() {
    const ids = Array.from(selected);
    setImportError(null);
    startTransition(async () => {
      const result = await onImport(ids);
      if (result && !result.ok) {
        setImportError(result.error ?? "Import failed.");
        return;
      }
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={openBrowser} className="ir-btn ir-btn-ghost">
        <CloudDownload size={14} /> {label}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-[3px] bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-black/8 p-4">
          <div className="flex flex-wrap items-center gap-1 text-xs text-black/50">
            {trail.map((f, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-black/25">/</span>}
                <button type="button" onClick={() => goTo(i)} className={i === trail.length - 1 ? "font-medium text-ir-navy" : "hover:underline"}>
                  {f.name}
                </button>
              </span>
            ))}
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="shrink-0 text-black/40 hover:text-ir-navy">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 size={20} className="animate-spin text-black/30" />
            </div>
          ) : error ? (
            <p className="p-6 text-center text-xs text-black/45">{error}</p>
          ) : files.length === 0 ? (
            <p className="p-6 text-center text-xs text-black/40">Empty folder.</p>
          ) : (
            <ul>
              {files.map((f) => {
                const isFolder = f.mimeType === FOLDER_MIME;
                return (
                  <li key={f.id} className="flex items-center gap-2.5 rounded px-2 py-1.5 hover:bg-black/[0.03]">
                    {isFolder ? (
                      <button type="button" onClick={() => enterFolder(f)} className="flex flex-1 items-center gap-2.5 text-left text-sm text-ir-navy">
                        <Folder size={15} className="shrink-0 text-black/35" /> {f.name}
                      </button>
                    ) : (
                      <label className="flex flex-1 cursor-pointer items-center gap-2.5 text-sm text-ir-navy">
                        <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} className="shrink-0 accent-ir-gold-dark" />
                        {f.mimeType.startsWith("image/") ? <ImageIcon size={15} className="shrink-0 text-black/35" /> : <FileText size={15} className="shrink-0 text-black/35" />}
                        <span className="truncate">{f.name}</span>
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-black/8 p-3">
          {importError && <p className="mb-2 text-xs text-[color:var(--color-brick)]">{importError}</p>}
          <div className="flex items-center justify-between">
            <span className="text-xs text-black/40">{selected.size} selected</span>
            <button type="button" disabled={selected.size === 0 || pending} onClick={doImport} className="ir-btn ir-btn-primary disabled:opacity-50">
              {pending ? <Loader2 size={14} className="animate-spin" /> : <CloudDownload size={14} />} Import{selected.size > 0 ? ` (${selected.size})` : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
