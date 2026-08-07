"use client";

import { useState, useTransition } from "react";
import { Sparkles, Copy, Check, Loader2 } from "lucide-react";
import { generateAsset } from "./actions";
import { CONTENT_TYPE_LABELS, type ContentType } from "@/lib/marketing";

type PropertyOption = { id: string; title: string; propertyRef: string };

export function MarketingStudioClient({ properties, groqEnabled }: { properties: PropertyOption[]; groqEnabled: boolean }) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");
  const [contentType, setContentType] = useState<ContentType>("WHATSAPP");
  const [language, setLanguage] = useState<"EN" | "SI" | "TA">("EN");
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function generate() {
    if (!propertyId) return;
    setResult(null);
    startTransition(async () => {
      const asset = await generateAsset(propertyId, contentType, language);
      setResult(asset.content);
    });
  }

  function copy() {
    if (!result) return;
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
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

      <div className="mt-3 flex items-center justify-between">
        <p className="text-[0.7rem] text-black/40">
          {groqEnabled ? "Real LLM copywriting via Groq. Uses only approved database facts." : "Offline template engine. Set GROQ_API_KEY for full LLM copywriting and Sinhala/Tamil generation."}
        </p>
        <button onClick={generate} disabled={pending || !propertyId} className="ir-btn ir-btn-gold px-5 disabled:opacity-50">
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {pending ? "Generating…" : "Generate content"}
        </button>
      </div>

      {result && (
        <div className="mt-4 rounded border border-black/10 bg-ir-ivory p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="ir-label">Generated content</span>
            <button onClick={copy} className="flex items-center gap-1 text-xs font-medium text-ir-gold-dark hover:underline">
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ir-navy">{result}</pre>
        </div>
      )}
    </div>
  );
}
