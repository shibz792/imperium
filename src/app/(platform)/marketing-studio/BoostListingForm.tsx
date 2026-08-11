"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Rocket, Search } from "lucide-react";
import { boostableAssetsForProperty, searchLocations, boostListing } from "./adsActions";

type Asset = { id: string; contentType: string; imageUrl: string | null };
type GeoOption = { key: string; name: string; type: string };

const OBJECTIVES: { value: "OUTCOME_TRAFFIC" | "OUTCOME_LEADS" | "OUTCOME_ENGAGEMENT"; label: string }[] = [
  { value: "OUTCOME_TRAFFIC", label: "Traffic — drive clicks to the share page" },
  { value: "OUTCOME_LEADS", label: "Leads — optimize for enquiries" },
  { value: "OUTCOME_ENGAGEMENT", label: "Engagement — reach and interaction" },
];

function todayPlus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// A focused "boost this listing" flow, not an Ads Manager clone: one
// campaign, one ad set, one creative, one ad — see boostListing() in
// adsActions.ts. Location targeting is resolved from the property's own
// city/district via Meta's Targeting Search API, not a free-text audience
// builder.
export function BoostListingForm({
  propertyId,
  defaultLocationQuery,
  disabled,
  onCreated,
}: {
  propertyId: string;
  defaultLocationQuery: string;
  disabled: boolean;
  onCreated: () => void;
}) {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [assetId, setAssetId] = useState("");
  const [objective, setObjective] = useState<"OUTCOME_TRAFFIC" | "OUTCOME_LEADS" | "OUTCOME_ENGAGEMENT">("OUTCOME_TRAFFIC");
  const [dailyBudget, setDailyBudget] = useState("2000");
  const [startDate, setStartDate] = useState(todayPlus(0));
  const [endDate, setEndDate] = useState(todayPlus(7));
  const [locationQuery, setLocationQuery] = useState(defaultLocationQuery);
  const [locationOptions, setLocationOptions] = useState<GeoOption[]>([]);
  const [geo, setGeo] = useState<GeoOption | null>(null);
  const [searching, startSearch] = useTransition();
  const [submitting, startSubmit] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);

  // The parent (AdsPanel) mounts this with key={propertyId}, so a property
  // switch remounts the whole form fresh — no manual reset needed here,
  // just the one fetch on mount.
  useEffect(() => {
    let cancelled = false;
    boostableAssetsForProperty(propertyId).then((rows) => {
      if (cancelled) return;
      setAssets(rows as unknown as Asset[]);
      if (rows[0]) setAssetId(rows[0].id);
    });
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  function search() {
    startSearch(async () => {
      const options = await searchLocations(locationQuery);
      setLocationOptions(options);
    });
  }

  function submit() {
    if (!assetId || !geo) return;
    setResult(null);
    startSubmit(async () => {
      const budgetCents = Math.round(Number(dailyBudget) * 100);
      const r = await boostListing({ propertyId, marketingAssetId: assetId, objective, dailyBudgetCents: budgetCents, startDate, endDate, geoKey: geo.key, geoName: geo.name, geoType: geo.type });
      setResult(r);
      if (r.ok) onCreated();
    });
  }

  if (disabled) {
    return <p className="text-xs text-black/40">Connect Meta and choose an active Page + ad account in Settings before boosting a listing.</p>;
  }

  if (assets !== null && assets.length === 0) {
    return <p className="text-xs text-black/40">No approved 1:1 or 9:16 social image ready to use as the ad creative yet — generate and approve one in the Create tab first.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="ir-label mb-1 block">Creative</label>
          <select value={assetId} onChange={(e) => setAssetId(e.target.value)} className="ir-select">
            {(assets ?? []).map((a) => (
              <option key={a.id} value={a.id}>{a.contentType === "STORY_9_16" ? "9:16 story tile" : "1:1 social tile"} — {a.id.slice(-6)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="ir-label mb-1 block">Objective</label>
          <select value={objective} onChange={(e) => setObjective(e.target.value as never)} className="ir-select">
            {OBJECTIVES.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="ir-label mb-1 block">Daily budget</label>
          <input type="number" min="1" step="0.01" value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} className="ir-input" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="ir-label mb-1 block">Start</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="ir-input" />
          </div>
          <div>
            <label className="ir-label mb-1 block">End</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="ir-input" />
          </div>
        </div>
      </div>

      <div>
        <label className="ir-label mb-1 block">Location</label>
        <div className="flex gap-2">
          <input value={locationQuery} onChange={(e) => setLocationQuery(e.target.value)} className="ir-input flex-1" placeholder="City or district" />
          <button onClick={search} disabled={searching} className="ir-btn ir-btn-ghost !py-1.5 shrink-0">
            {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Search
          </button>
        </div>
        {locationOptions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {locationOptions.map((o) => (
              <button
                key={o.key}
                onClick={() => setGeo(o)}
                className={`ir-badge cursor-pointer ${geo?.key === o.key ? "border-ir-gold/60 bg-ir-gold/15 text-ir-gold-dark" : "border-[#0000001f] bg-[#00000008] text-black/50"}`}
              >
                {o.name}
              </button>
            ))}
          </div>
        )}
        {geo && <p className="mt-1.5 text-xs text-black/40">Targeting: {geo.name}</p>}
      </div>

      <button onClick={submit} disabled={submitting || !assetId || !geo} className="ir-btn ir-btn-gold disabled:opacity-40">
        {submitting ? <Loader2 size={15} className="animate-spin" /> : <Rocket size={15} />}
        {submitting ? "Creating campaign…" : "Boost this listing"}
      </button>
      {result && !result.ok && <p className="text-xs text-[color:var(--color-brick)]">{result.error}</p>}
      {result?.ok && <p className="text-xs text-[color:var(--color-forest)]">Campaign created and running — see below.</p>}
    </div>
  );
}
