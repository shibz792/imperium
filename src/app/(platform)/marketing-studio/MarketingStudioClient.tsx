"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, Layers, Copy, Check, Loader2, ImagePlus, Download, Rocket } from "lucide-react";
import { generateAsset, generateAllAssets, generateSocialImage, propertiesNeedingCampaign } from "./actions";
import { CONTENT_TYPE_LABELS, type ContentType } from "@/lib/marketing";
import { MatchedAudiencePanel } from "./MatchedAudiencePanel";

type PropertyOption = { id: string; title: string; propertyRef: string };
const SOCIAL_TYPES: ContentType[] = ["SOCIAL_1_1", "STORY_9_16"];

export function MarketingStudioClient({ properties, groqEnabled, cloudConfigured, emailConfigured }: { properties: PropertyOption[]; groqEnabled: boolean; cloudConfigured: boolean; emailConfigured: boolean }) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");
  const [contentType, setContentType] = useState<ContentType>("WHATSAPP");
  const [language, setLanguage] = useState<"EN" | "SI" | "TA">("EN");
  const [result, setResult] = useState<{ id: string; content: string; contentType: ContentType } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const [batchPending, startBatchTransition] = useTransition();
  const [batchDone, setBatchDone] = useState<number | null>(null);
  const [imageState, setImageState] = useState<{ status: "idle" | "loading" | "done" | "error"; url?: string; error?: string }>({ status: "idle" });
  const [portfolio, setPortfolio] = useState<{ status: "idle" | "running" | "done"; done: number; total: number; current?: string }>({ status: "idle", done: 0, total: 0 });
  const router = useRouter();
  const isSocial = SOCIAL_TYPES.includes(contentType);

  // Sequential on purpose, driven from the client rather than one opaque
  // server call — each property's own "generate all types" batch is
  // already parallel internally, so running several properties at once on
  // top of that risks Groq rate limits, and there'd be no way to show real
  // per-property progress from a single all-or-nothing server action.
  async function catchUpPortfolio() {
    const targets = await propertiesNeedingCampaign();
    if (targets.length === 0) {
      setPortfolio({ status: "done", done: 0, total: 0 });
      return;
    }
    setPortfolio({ status: "running", done: 0, total: targets.length, current: targets[0].title });
    for (let i = 0; i < targets.length; i++) {
      setPortfolio({ status: "running", done: i, total: targets.length, current: targets[i].title });
      await generateAllAssets(targets[i].id, language).catch(() => undefined);
    }
    setPortfolio({ status: "done", done: targets.length, total: targets.length });
    router.refresh();
  }

  function generate() {
    if (!propertyId) return;
    setResult(null);
    setImageState({ status: "idle" });
    startTransition(async () => {
      const asset = await generateAsset(propertyId, contentType, language);
      setResult({ id: asset.id, content: asset.content, contentType: asset.contentType as ContentType });
      if (SOCIAL_TYPES.includes(asset.contentType as ContentType)) {
        setImageState({ status: "loading" });
        const img = await generateSocialImage(asset.id);
        setImageState(img.ok ? { status: "done", url: img.imageUrl } : { status: "error", error: img.error });
      }
    });
  }

  function retryImage() {
    if (!result) return;
    setImageState({ status: "loading" });
    startTransition(async () => {
      const img = await generateSocialImage(result.id);
      setImageState(img.ok ? { status: "done", url: img.imageUrl } : { status: "error", error: img.error });
    });
  }

  function generateAll() {
    if (!propertyId) return;
    setBatchDone(null);
    startBatchTransition(async () => {
      const assets = await generateAllAssets(propertyId, language);
      setBatchDone(assets.length);
      router.refresh(); // picks up the new rows (text + composed images) in "Recent generations" below
    });
  }

  function copy() {
    if (!result) return;
    navigator.clipboard.writeText(result.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
    <div className="ir-card p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="ir-label mb-1 block">Property</label>
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="ir-select">
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="ir-label mb-1 block">Content type</label>
          <select value={contentType} onChange={(e) => setContentType(e.target.value as ContentType)} className="ir-select">
            {Object.entries(CONTENT_TYPE_LABELS).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="ir-label mb-1 block">Language</label>
          <select value={language} onChange={(e) => setLanguage(e.target.value as never)} className="ir-select">
            <option value="EN">English</option>
            <option value="SI">Sinhala</option>
            <option value="TA">Tamil</option>
          </select>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.7rem] text-black/40">
          {groqEnabled ? "Real LLM copywriting via Groq. Uses only approved database facts." : "Offline template engine. Set GROQ_API_KEY for full LLM copywriting and Sinhala/Tamil generation."}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={generateAll}
            disabled={batchPending || !propertyId}
            title="One click: every content type, plus both composed social image tiles"
            className="ir-btn ir-btn-ghost disabled:opacity-50"
          >
            {batchPending ? <Loader2 size={15} className="animate-spin" /> : <Layers size={15} />}
            {batchPending ? "Generating campaign…" : "Generate full campaign"}
          </button>
          <button onClick={generate} disabled={pending || !propertyId} className="ir-btn ir-btn-gold px-5 disabled:opacity-50">
            {pending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {pending ? "Generating…" : "Generate content"}
          </button>
        </div>
      </div>

      {batchDone !== null && (
        <div className="mt-3 rounded border border-[color:var(--color-forest)]/30 bg-[color:var(--color-forest)]/10 px-3 py-2 text-xs text-[color:var(--color-forest)]">
          Generated all {batchDone} content types, including both social image tiles where a property photo was available — review and approve each below, in Recent generations.
        </div>
      )}

      {result && (
        <div className="mt-4 rounded border border-black/10 bg-ir-ivory p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="ir-label">Generated content</span>
            <button onClick={copy} className="flex items-center gap-1 text-xs font-medium text-ir-gold-dark hover:underline">
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ir-navy">{result.content}</pre>

          {isSocial && (
            <div className="mt-4 border-t border-black/8 pt-3">
              {imageState.status === "loading" && (
                <div className="flex items-center gap-2 text-xs text-black/40">
                  <Loader2 size={13} className="animate-spin" /> Composing the image tile from the listing photo…
                </div>
              )}
              {imageState.status === "error" && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[color:var(--color-bronze)]/30 bg-[color:var(--color-bronze-tint)] px-3 py-2 text-xs text-[color:var(--color-bronze)]">
                  <span>{imageState.error}</span>
                  {imageState.error?.includes("photo") ? (
                    <Link href={`/properties/${propertyId}`} className="font-medium underline">Add a photo →</Link>
                  ) : (
                    <button onClick={retryImage} className="font-medium underline">Retry</button>
                  )}
                </div>
              )}
              {imageState.status === "done" && imageState.url && (
                <div className="flex items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- served from our own DB-backed route, not a static import */}
                  <img
                    src={imageState.url}
                    alt="Composed social tile"
                    className={`rounded border border-black/10 object-cover ${result.contentType === "STORY_9_16" ? "h-56 w-32" : "h-40 w-40"}`}
                  />
                  <div className="flex flex-col gap-2">
                    <span className="ir-label">Image tile ready</span>
                    <a href={imageState.url} download={`${result.id}.png`} className="ir-btn ir-btn-ghost !py-1 !text-xs w-fit">
                      <Download size={12} /> Download
                    </a>
                    <button onClick={retryImage} className="flex w-fit items-center gap-1 text-xs text-black/40 hover:text-ir-navy">
                      <ImagePlus size={12} /> Regenerate image
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>

    <div className="ir-card mt-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ir-navy">Catch up the whole portfolio</h2>
          <p className="mt-0.5 text-xs text-black/40">Every active listing with no approved marketing yet gets a full campaign, one property at a time.</p>
        </div>
        {portfolio.status !== "running" && (
          <button onClick={catchUpPortfolio} className="ir-btn ir-btn-ghost shrink-0">
            <Rocket size={15} /> Catch up portfolio
          </button>
        )}
      </div>
      {portfolio.status === "running" && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between text-xs text-black/50">
            <span className="flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> {portfolio.current}</span>
            <span className="tabular-nums">{portfolio.done} / {portfolio.total}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-black/8">
            <div className="h-full rounded-full bg-ir-gold transition-all" style={{ width: `${(portfolio.done / Math.max(1, portfolio.total)) * 100}%` }} />
          </div>
        </div>
      )}
      {portfolio.status === "done" && (
        <div className="mt-3 rounded border border-[color:var(--color-forest)]/30 bg-[color:var(--color-forest)]/10 px-3 py-2 text-xs text-[color:var(--color-forest)]">
          {portfolio.total === 0 ? "Every active listing already has approved marketing content." : `Generated campaigns for ${portfolio.total} listing${portfolio.total === 1 ? "" : "s"} — review and approve each in Recent generations below.`}
        </div>
      )}
    </div>

    {propertyId && <MatchedAudiencePanel key={propertyId} propertyId={propertyId} cloudConfigured={cloudConfigured} emailConfigured={emailConfigured} />}
    </>
  );
}
