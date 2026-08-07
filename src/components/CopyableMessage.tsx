"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

// Ready-to-send WhatsApp copy, with one click to grab it — used on both
// Property and Requirement detail pages so an agent never has to retype
// the same structure (price, location, business signature) by hand.
export function CopyableMessage({ message }: { message: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="ir-card p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="ir-label !mb-0">WhatsApp-ready message</span>
        <button onClick={copy} className="ir-btn ir-btn-gold !py-1 !text-xs">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="whitespace-pre-wrap rounded bg-ir-ivory p-3 text-xs leading-relaxed text-ir-navy">{message}</pre>
    </div>
  );
}
