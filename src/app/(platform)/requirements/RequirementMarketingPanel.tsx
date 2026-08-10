"use client";

import { useState, useTransition } from "react";
import { Loader2, MessageCircle, Send, Users, Sparkles, Mail } from "lucide-react";
import { clientDigestPreview, brokerBroadcastPreview, sendRequirementWhatsApp, sendRequirementEmail, type BrokerContact } from "./actions";

type DigestState = "idle" | "loading" | "ready" | "empty";
type BrokerState = "idle" | "loading" | "ready";
type SendState = "idle" | "sending" | "sent" | "failed";

// The other half of Marketing Studio: this requirement has no public
// audience to market to, but real agencies do two specific things with a
// requirement — send the client what's currently available, and circulate
// the need to co-brokers for off-market inventory. Both generate fresh on
// demand (not persisted as MarketingAsset rows, which are property/approve
// -workflow shaped) — same "ephemeral, regenerate each time" pattern as
// NoteAiSuggestions and MatchedAudiencePanel.
export function RequirementMarketingPanel({ requirementId, cloudConfigured, emailConfigured }: { requirementId: string; cloudConfigured: boolean; emailConfigured: boolean }) {
  const [digestState, setDigestState] = useState<DigestState>("idle");
  const [digest, setDigest] = useState<{ message: string; clientPhone: string; clientEmail: string | null; matchCount: number } | null>(null);
  const [digestPending, startDigestTransition] = useTransition();
  const [digestSent, setDigestSent] = useState<SendState>("idle");
  const [digestEmailed, setDigestEmailed] = useState<SendState>("idle");

  const [brokerState, setBrokerState] = useState<BrokerState>("idle");
  const [brokerData, setBrokerData] = useState<{ message: string; brokers: BrokerContact[] } | null>(null);
  const [brokerPending, startBrokerTransition] = useTransition();
  const [sentTo, setSentTo] = useState<Record<string, SendState>>({});
  const [emailedTo, setEmailedTo] = useState<Record<string, SendState>>({});

  function generateDigest() {
    setDigestState("loading");
    startDigestTransition(async () => {
      const result = await clientDigestPreview(requirementId);
      if (result.message === null) {
        setDigestState("empty");
        return;
      }
      setDigest(result as { message: string; clientPhone: string; clientEmail: string | null; matchCount: number });
      setDigestState("ready");
      setDigestSent("idle");
      setDigestEmailed("idle");
    });
  }

  function generateBroadcast() {
    setBrokerState("loading");
    startBrokerTransition(async () => {
      const result = await brokerBroadcastPreview(requirementId);
      setBrokerData(result);
      setBrokerState("ready");
      setSentTo({});
      setEmailedTo({});
    });
  }

  async function sendDigestNow() {
    if (!digest) return;
    setDigestSent("sending");
    const result = await sendRequirementWhatsApp(digest.clientPhone, digest.message);
    setDigestSent(result.ok ? "sent" : "failed");
  }

  async function emailDigestNow() {
    if (!digest?.clientEmail) return;
    setDigestEmailed("sending");
    const result = await sendRequirementEmail(digest.clientEmail, "Properties matching what you're looking for", digest.message);
    setDigestEmailed(result.ok ? "sent" : "failed");
  }

  async function sendBrokerNow(broker: BrokerContact) {
    if (!brokerData) return;
    setSentTo((s) => ({ ...s, [broker.id]: "sending" }));
    const result = await sendRequirementWhatsApp(broker.phone, brokerData.message);
    setSentTo((s) => ({ ...s, [broker.id]: result.ok ? "sent" : "failed" }));
  }

  async function emailBrokerNow(broker: BrokerContact) {
    if (!brokerData || !broker.email) return;
    setEmailedTo((s) => ({ ...s, [broker.id]: "sending" }));
    const result = await sendRequirementEmail(broker.email, "Sourcing request", brokerData.message);
    setEmailedTo((s) => ({ ...s, [broker.id]: result.ok ? "sent" : "failed" }));
  }

  return (
    <div className="space-y-5">
      <div className="ir-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ir-navy">Send matches to client</h2>
          {digestState === "idle" && (
            <button onClick={generateDigest} disabled={digestPending} className="ir-btn ir-btn-gold !py-1 !text-xs disabled:opacity-50">
              {digestPending ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Generate
            </button>
          )}
        </div>
        {digestState === "idle" && (
          <p className="text-xs text-black/40">Writes a short digest of the best current matches (score 60%+) and sends it straight to the client on WhatsApp.</p>
        )}
        {digestState === "loading" && (
          <p className="flex items-center gap-2 text-xs text-black/40"><Loader2 size={13} className="animate-spin" /> Finding matches and writing the message…</p>
        )}
        {digestState === "empty" && <p className="text-xs text-black/40">No active listings currently score well enough against this requirement to send — check the full list below.</p>}
        {digestState === "ready" && digest && (
          <>
            <pre className="whitespace-pre-wrap rounded border border-black/10 bg-ir-ivory p-3 font-sans text-xs leading-relaxed text-ir-navy">{digest.message}</pre>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a
                href={`https://wa.me/${digest.clientPhone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(digest.message)}`}
                target="_blank"
                rel="noreferrer"
                className="ir-btn ir-btn-ghost !py-1 !text-xs"
              >
                <MessageCircle size={13} /> Open chat
              </a>
              {cloudConfigured && (
                <button onClick={sendDigestNow} disabled={digestSent === "sending" || digestSent === "sent"} className="ir-btn ir-btn-gold !py-1 !text-xs disabled:opacity-40">
                  {digestSent === "sending" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                  {digestSent === "sent" ? "Sent" : digestSent === "failed" ? "Failed — retry" : "Send now"}
                </button>
              )}
              {emailConfigured && digest.clientEmail && (
                <button onClick={emailDigestNow} disabled={digestEmailed === "sending" || digestEmailed === "sent"} className="ir-btn ir-btn-ghost !py-1 !text-xs disabled:opacity-40" title={`Email ${digest.clientEmail}`}>
                  {digestEmailed === "sending" ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                  {digestEmailed === "sent" ? "Emailed" : digestEmailed === "failed" ? "Failed — retry" : "Email"}
                </button>
              )}
              <button onClick={generateDigest} disabled={digestPending} className="text-xs text-black/40 hover:text-ir-navy">Regenerate</button>
            </div>
          </>
        )}
      </div>

      <div className="ir-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ir-navy">Circulate to broker network</h2>
          {brokerState === "idle" && (
            <button onClick={generateBroadcast} disabled={brokerPending} className="ir-btn ir-btn-ghost !py-1 !text-xs disabled:opacity-50">
              {brokerPending ? <Loader2 size={13} className="animate-spin" /> : <Users size={13} />} Generate
            </button>
          )}
        </div>
        {brokerState === "idle" && <p className="text-xs text-black/40">Writes a short sourcing request and lets you send it to every broker contact — for finding off-market inventory.</p>}
        {brokerState === "loading" && <p className="flex items-center gap-2 text-xs text-black/40"><Loader2 size={13} className="animate-spin" /> Writing the message…</p>}
        {brokerState === "ready" && brokerData && (
          brokerData.brokers.length === 0 ? (
            <p className="text-xs text-black/40">No broker contacts on file yet — add one with contact type &quot;Broker / Agency&quot; in Contacts.</p>
          ) : (
            <>
              <pre className="whitespace-pre-wrap rounded border border-black/10 bg-ir-ivory p-3 font-sans text-xs leading-relaxed text-ir-navy">{brokerData.message}</pre>
              <div className="mt-3 space-y-2">
                {brokerData.brokers.map((b) => {
                  const status = sentTo[b.id] ?? "idle";
                  const emailStatus = emailedTo[b.id] ?? "idle";
                  return (
                    <div key={b.id} className="flex items-center gap-3 rounded border border-black/8 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-ir-navy">{b.name}</div>
                        <span className="text-xs text-black/40">{b.phone}</span>
                      </div>
                      <a
                        href={`https://wa.me/${b.phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(brokerData.message)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="ir-btn ir-btn-ghost !py-1 !text-xs"
                      >
                        <MessageCircle size={13} /> Open chat
                      </a>
                      {cloudConfigured && (
                        <button onClick={() => sendBrokerNow(b)} disabled={status === "sending" || status === "sent"} className="ir-btn ir-btn-gold !py-1 !text-xs disabled:opacity-40">
                          {status === "sending" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                          {status === "sent" ? "Sent" : status === "failed" ? "Failed — retry" : "Send now"}
                        </button>
                      )}
                      {emailConfigured && b.email && (
                        <button onClick={() => emailBrokerNow(b)} disabled={emailStatus === "sending" || emailStatus === "sent"} className="ir-btn ir-btn-ghost !py-1 !text-xs disabled:opacity-40" title={`Email ${b.email}`}>
                          {emailStatus === "sending" ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                          {emailStatus === "sent" ? "Emailed" : emailStatus === "failed" ? "Failed — retry" : "Email"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <button onClick={generateBroadcast} disabled={brokerPending} className="mt-2 text-xs text-black/40 hover:text-ir-navy">Regenerate</button>
            </>
          )
        )}
      </div>
    </div>
  );
}
