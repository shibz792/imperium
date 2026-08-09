"use client";

import { useState, useTransition } from "react";
import { Copy, Check, RefreshCcw, Trash2, Loader2 } from "lucide-react";
import { regenerateAsset, deleteMarketingAsset } from "./actions";

// Copy / regenerate-in-place / delete for one generation — a small client
// island inside an otherwise server-rendered card, same reasoning as
// CopyWhatsAppButton elsewhere: the surrounding list stays server-rendered.
export function MarketingAssetActions({ id, content, approved }: { id: string; content: string; approved: boolean }) {
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function copy() {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function regenerate() {
    startTransition(() => {
      regenerateAsset(id);
    });
  }

  function del() {
    if (!window.confirm("Delete this generation? This can't be undone.")) return;
    startTransition(() => {
      deleteMarketingAsset(id);
    });
  }

  return (
    <div className="flex items-center gap-1">
      <button onClick={copy} title="Copy" className="flex h-6 w-6 items-center justify-center rounded text-black/40 hover:bg-black/[0.05] hover:text-ir-navy">
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
      <button onClick={regenerate} disabled={pending} title="Regenerate" className="flex h-6 w-6 items-center justify-center rounded text-black/40 hover:bg-black/[0.05] hover:text-ir-navy disabled:opacity-40">
        {pending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCcw size={13} />}
      </button>
      {!approved && (
        <button onClick={del} disabled={pending} title="Delete" className="flex h-6 w-6 items-center justify-center rounded text-black/25 hover:bg-black/[0.05] hover:text-[color:var(--color-brick)] disabled:opacity-40">
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}
