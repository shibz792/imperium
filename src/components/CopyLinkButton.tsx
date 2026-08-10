"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

// Generic inline copy-to-clipboard, icon-only — same shape as
// CopyWhatsAppButton's icon variant but for any plain text/URL rather than
// a WhatsApp message specifically.
export function CopyLinkButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy link"
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-black/40 hover:bg-black/[0.05] hover:text-ir-navy ${className}`}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}
