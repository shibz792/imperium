"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCcw, Pause, Play } from "lucide-react";
import { StatTile, Badge } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { campaignsForProperty, pauseMetaCampaign, resumeMetaCampaign, syncCampaignInsights } from "./adsActions";
import { BoostListingForm } from "./BoostListingForm";

type PropertyOption = { id: string; title: string; propertyRef: string; city: string | null; district: string | null };
type MetaConnection = { page: { id: string; name: string; igUsername: string | null } | null; adAccount: { id: string; name: string; currency: string } | null };

type CampaignRow = {
  id: string;
  status: "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED" | "ERROR";
  objective: string;
  dailyBudgetCents: number;
  targetingLocation: string;
  adAccount: { currency: string };
  insights: { impressions: number; reach: number; clicks: number; spendCents: number; ctr: number; cpcCents: number; costPerResultCents: number | null; syncedAt: string }[];
};

const STATUS_TONE: Record<string, "green" | "amber" | "gray" | "red"> = { ACTIVE: "green", PAUSED: "amber", DELETED: "gray", ARCHIVED: "gray", ERROR: "red" };

function money(cents: number, currency: string) {
  return `${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
}

export function AdsPanel({ properties, connection }: { properties: PropertyOption[]; connection: MetaConnection }) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");
  const [refreshKey, setRefreshKey] = useState(0);

  const property = properties.find((p) => p.id === propertyId);
  const canBoost = Boolean(connection.page && connection.adAccount);

  return (
    <div>
      <div className="ir-card p-5">
        <label className="ir-label mb-1 block">Property</label>
        <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="ir-select">
          {properties.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>

        <div className="mt-4 border-t border-black/6 pt-4">
          <h2 className="mb-3 text-sm font-semibold text-ir-navy">Boost this listing</h2>
          {propertyId && (
            <BoostListingForm
              key={propertyId}
              propertyId={propertyId}
              defaultLocationQuery={property?.city || property?.district || ""}
              disabled={!canBoost}
              onCreated={() => setRefreshKey((k) => k + 1)}
            />
          )}
        </div>
      </div>

      <div className="mt-5">
        <h2 className="mb-3 text-sm font-semibold text-ir-navy">Campaigns for this listing</h2>
        {propertyId && <CampaignList key={`${propertyId}-${refreshKey}`} propertyId={propertyId} />}
      </div>
    </div>
  );
}

// Keyed by propertyId (+ a bump counter after a new campaign is created) in
// the parent, so it remounts fresh instead of needing a manual state reset
// in an effect — same pattern as MatchedAudiencePanel.
function CampaignList({ propertyId }: { propertyId: string }) {
  const [campaigns, setCampaigns] = useState<CampaignRow[] | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    campaignsForProperty(propertyId).then((rows) => {
      if (!cancelled) setCampaigns(rows as unknown as CampaignRow[]);
    });
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  async function refresh() {
    const rows = await campaignsForProperty(propertyId);
    setCampaigns(rows as unknown as CampaignRow[]);
  }

  async function sync(id: string) {
    setSyncingId(id);
    await syncCampaignInsights(id);
    setSyncingId(null);
    refresh();
  }

  async function toggle(campaign: CampaignRow) {
    setTogglingId(campaign.id);
    if (campaign.status === "ACTIVE") await pauseMetaCampaign(campaign.id);
    else await resumeMetaCampaign(campaign.id);
    setTogglingId(null);
    refresh();
  }

  if (campaigns === null) {
    return (
      <div className="ir-card flex items-center gap-2 p-5 text-xs text-black/40">
        <Loader2 size={13} className="animate-spin" /> Loading campaigns…
      </div>
    );
  }

  if (campaigns.length === 0) {
    return <div className="ir-card p-5 text-xs text-black/40">No ad campaigns yet for this listing.</div>;
  }

  return (
    <div className="space-y-4">
      {campaigns.map((c) => {
        const latest = c.insights[0];
        return (
          <div key={c.id} className="ir-card p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
              <span className="text-xs text-black/50">{c.targetingLocation} · {money(c.dailyBudgetCents, c.adAccount.currency)}/day</span>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={() => sync(c.id)} disabled={syncingId === c.id} className="ir-btn ir-btn-ghost !py-1 !text-xs disabled:opacity-40">
                  {syncingId === c.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />} Sync now
                </button>
                {(c.status === "ACTIVE" || c.status === "PAUSED") && (
                  <button onClick={() => toggle(c)} disabled={togglingId === c.id} className="ir-btn ir-btn-ghost !py-1 !text-xs disabled:opacity-40">
                    {c.status === "ACTIVE" ? <Pause size={12} /> : <Play size={12} />} {c.status === "ACTIVE" ? "Pause" : "Resume"}
                  </button>
                )}
              </div>
            </div>

            {latest ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <StatTile label="Impressions" value={latest.impressions.toLocaleString()} />
                  <StatTile label="Reach" value={latest.reach.toLocaleString()} />
                  <StatTile label="Clicks" value={latest.clicks.toLocaleString()} />
                  <StatTile label="Spend" value={money(latest.spendCents, c.adAccount.currency)} tone="gold" />
                  <StatTile label="CTR" value={`${latest.ctr.toFixed(2)}%`} />
                  <StatTile label="CPC" value={money(latest.cpcCents, c.adAccount.currency)} />
                  {latest.costPerResultCents != null && <StatTile label="Cost / result" value={money(latest.costPerResultCents, c.adAccount.currency)} />}
                </div>
                <p className="mt-2 text-[0.7rem] text-black/35">Last synced {formatDateTime(latest.syncedAt)}</p>
              </>
            ) : (
              <p className="text-xs text-black/40">Not synced yet — hit &quot;Sync now&quot; once the campaign has been running a while. Meta&apos;s own reporting has a natural delay.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
