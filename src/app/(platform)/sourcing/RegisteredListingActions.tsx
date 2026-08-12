"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2, Rocket, Trash2 } from "lucide-react";
import { promoteSourcedListing, deleteSourcedListing } from "./actions";

// Split out from RegisteredListings (a server component) purely because
// these two actions need client-side pending state and a confirm dialog —
// the list/card chrome around this stays server-rendered.
export function RegisteredListingActions({ id, promotedPropertyId }: { id: string; promotedPropertyId: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (promotedPropertyId) {
    return (
      <Link href={`/properties/${promotedPropertyId}`} className="flex items-center justify-center gap-1.5 rounded border border-[color:var(--color-forest)]/30 bg-[color:var(--color-forest)]/10 px-3 py-2 text-xs font-medium text-[color:var(--color-forest)]">
        <CheckCircle2 size={13} /> View property →
      </Link>
    );
  }

  function promote() {
    setError(null);
    startTransition(async () => {
      const res = await promoteSourcedListing(id);
      if ("error" in res) setError(res.error);
      else router.push(`/properties/${res.id}`);
    });
  }

  function remove() {
    if (!window.confirm("Remove this registered listing? The ad link stays on ikman.lk/LankaPropertyWeb — this only removes it from your list.")) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteSourcedListing(id);
      if (!res.ok) setError(res.error ?? "Couldn't remove it.");
      else router.refresh();
    });
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <button onClick={promote} disabled={pending} className="ir-btn ir-btn-primary flex-1 justify-center !text-xs disabled:opacity-50">
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Rocket size={13} />} Promote to owned property
        </button>
        <button onClick={remove} disabled={pending} title="Remove from Registered Listings" className="ir-btn ir-btn-ghost !px-2.5">
          <Trash2 size={13} />
        </button>
      </div>
      {error && <p className="mt-1.5 text-[0.7rem] text-[color:var(--color-brick)]">{error}</p>}
    </div>
  );
}
