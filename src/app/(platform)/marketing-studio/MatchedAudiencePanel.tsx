"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle, Loader2, Send } from "lucide-react";
import { matchedAudience, whatsAppContentForProperty, sendMatchedContact, type MatchedContact } from "./actions";

// The "tie it all together" piece: reuses lib/match.ts's scoreMatch — the
// same engine Matchmaker is built on — to answer "who is this listing
// actually relevant to", right where the content gets generated, instead
// of Marketing Studio being a dead end once something's approved.
export function MatchedAudiencePanel({ propertyId, cloudConfigured }: { propertyId: string; cloudConfigured: boolean }) {
  const [matches, setMatches] = useState<MatchedContact[] | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Record<string, "sending" | "sent" | "failed">>({});

  // Keyed by propertyId in the parent (see MarketingStudioClient) so a
  // property switch remounts this component fresh instead of needing a
  // manual state reset here.
  useEffect(() => {
    let cancelled = false;
    if (!propertyId) return;
    Promise.all([matchedAudience(propertyId), whatsAppContentForProperty(propertyId)]).then(([m, c]) => {
      if (cancelled) return;
      setMatches(m);
      setContent(c);
    });
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  async function send(contact: MatchedContact) {
    if (!content) return;
    setSentTo((s) => ({ ...s, [contact.requirementId]: "sending" }));
    const result = await sendMatchedContact(contact.clientPhone, content);
    setSentTo((s) => ({ ...s, [contact.requirementId]: result.ok ? "sent" : "failed" }));
  }

  if (matches === null) {
    return (
      <div className="ir-card mt-5 flex items-center gap-2 p-5 text-xs text-black/40">
        <Loader2 size={13} className="animate-spin" /> Finding matching buyers/tenants…
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="ir-card mt-5 p-5 text-xs text-black/40">
        No active requirements currently match this property well enough to suggest — check{" "}
        <Link href={`/matchmaker?mode=property&propertyId=${propertyId}`} className="text-ir-gold-dark hover:underline">
          Matchmaker
        </Link>{" "}
        for the full picture.
      </div>
    );
  }

  return (
    <div className="ir-card mt-5 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ir-navy">Best matches for this listing</h2>
        <Link href={`/matchmaker?mode=property&propertyId=${propertyId}`} className="text-xs text-ir-gold-dark hover:underline">
          View in Matchmaker →
        </Link>
      </div>
      {!content && <p className="mb-3 text-xs text-black/40">Generate and approve WhatsApp content above to enable sending.</p>}
      <div className="space-y-2">
        {matches.map((m) => {
          const status = sentTo[m.requirementId];
          return (
            <div key={m.requirementId} className="flex items-center gap-3 rounded border border-black/8 px-3 py-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-current text-xs font-semibold text-ir-gold-dark tabular-nums">{m.score}</div>
              <div className="min-w-0 flex-1">
                <Link href={`/requirements/${m.requirementId}`} className="block truncate text-sm font-medium text-ir-navy hover:underline">
                  {m.clientName}
                </Link>
                <span className="text-xs text-black/40">{m.clientPhone}</span>
              </div>
              <a
                href={content ? `https://wa.me/${m.clientPhone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(content)}` : undefined}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!content}
                className={`ir-btn ir-btn-ghost !py-1 !text-xs ${!content ? "pointer-events-none opacity-40" : ""}`}
              >
                <MessageCircle size={13} /> Open chat
              </a>
              {cloudConfigured && (
                <button
                  onClick={() => send(m)}
                  disabled={!content || status === "sending" || status === "sent"}
                  className="ir-btn ir-btn-gold !py-1 !text-xs disabled:opacity-40"
                  title="Send now via WhatsApp Business API"
                >
                  {status === "sending" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                  {status === "sent" ? "Sent" : status === "failed" ? "Failed — retry" : "Send now"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
