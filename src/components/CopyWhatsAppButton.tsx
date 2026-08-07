"use client";

import { useState } from "react";
import { MessageCircle, Check } from "lucide-react";

// One click, straight from a listing row/card — no need to open the record
// first. Copies the same structured template CopyableMessage shows on the
// detail page. A real <button>, not a link, so ClickableRow/ClickableCard's
// own "clicked on an interactive element" guard already keeps this from
// also triggering the row's navigation — no onClick/stopPropagation hack
// needed (that pattern broke a Server Component here once before).
export function CopyWhatsAppButton({ message, variant = "icon", className = "" }: { message: string; variant?: "icon" | "button"; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={copy}
        title="Copy WhatsApp message"
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[#25D366] transition-colors hover:bg-[#25D366]/10 ${className}`}
      >
        {copied ? <Check size={16} /> : <MessageCircle size={16} />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`ir-btn border border-[#25D366]/30 bg-[#25D366]/10 text-[#128C7E] hover:bg-[#25D366]/20 ${className}`}
    >
      {copied ? <Check size={14} /> : <MessageCircle size={14} />}
      {copied ? "Copied" : "Copy WhatsApp"}
    </button>
  );
}
