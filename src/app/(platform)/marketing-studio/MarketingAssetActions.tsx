"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, RefreshCcw, Trash2, Loader2, ImagePlus } from "lucide-react";
import { regenerateAsset, deleteMarketingAsset, generateSocialImage } from "./actions";
import type { ContentType } from "@/lib/marketing";

// Copy / regenerate-in-place / delete for one generation — a small client
// island inside an otherwise server-rendered card, same reasoning as
// CopyWhatsAppButton elsewhere: the surrounding list stays server-rendered.
// SOCIAL_1_1 / STORY_9_16 rows also get a "Generate image" control — see
// src/lib/marketingImage.ts for what that composes.
export function MarketingAssetActions({
  id,
  content,
  approved,
  contentType,
  imageUrl,
}: {
  id: string;
  content: string;
  approved: boolean;
  contentType: ContentType;
  imageUrl: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const [imagePending, startImageTransition] = useTransition();
  const [imageError, setImageError] = useState<string | null>(null);
  const router = useRouter();
  const isSocialFormat = contentType === "SOCIAL_1_1" || contentType === "STORY_9_16";

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

  function makeImage() {
    setImageError(null);
    startImageTransition(async () => {
      const result = await generateSocialImage(id);
      if (!result.ok) {
        setImageError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <button onClick={copy} title="Copy" className="flex h-6 w-6 items-center justify-center rounded text-black/40 hover:bg-black/[0.05] hover:text-ir-navy">
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
        <button onClick={regenerate} disabled={pending} title="Regenerate" className="flex h-6 w-6 items-center justify-center rounded text-black/40 hover:bg-black/[0.05] hover:text-ir-navy disabled:opacity-40">
          {pending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCcw size={13} />}
        </button>
        {isSocialFormat && (
          <button onClick={makeImage} disabled={imagePending} title={imageUrl ? "Regenerate image" : "Generate image"} className="flex h-6 w-6 items-center justify-center rounded text-ir-gold-dark hover:bg-ir-gold/10 disabled:opacity-40">
            {imagePending ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
          </button>
        )}
        {!approved && (
          <button onClick={del} disabled={pending} title="Delete" className="flex h-6 w-6 items-center justify-center rounded text-black/25 hover:bg-black/[0.05] hover:text-[color:var(--color-brick)] disabled:opacity-40">
            <Trash2 size={13} />
          </button>
        )}
      </div>
      {imageError && <p className="max-w-[200px] text-right text-[0.65rem] leading-snug text-[color:var(--color-brick)]">{imageError}</p>}
    </div>
  );
}
