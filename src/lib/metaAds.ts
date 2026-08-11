// Meta Marketing API — a deliberately focused "Boost this listing" flow,
// not an Ads Manager clone: one campaign, one ad set, one creative, one ad
// per boost. No custom/lookalike audiences, no manual bid strategy, no
// multi-ad-set budget optimization — real-estate agencies boost one
// listing at a time, targeted at the property's own city/district.
//
// Same fail-soft, dormant-until-configured contract as lib/meta.ts — every
// call goes through the same underlying Graph API, gated by
// metaOAuthConfigured() and a valid stored MetaAccount.

import { prisma } from "@/lib/prisma";

const GRAPH_VERSION = "v21.0";
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

async function safeFetch(url: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, init);
  } catch {
    return null;
  }
}

async function userToken(): Promise<string | null> {
  const account = await prisma.metaAccount.findFirst();
  if (!account) return null;
  // Ads calls happen far less often than publish calls and don't need the
  // same opportunistic-extend dance — a token that's simply still valid is
  // enough; boostListing/syncCampaignInsights callers already surface a
  // clear "reconnect Meta" error if this returns null.
  return account.expiresAt.getTime() > Date.now() ? account.accessToken : null;
}

// Resolves the property's own city/district into a Meta geo-target key —
// no free-text audience builder, the property record supplies the only
// input needed.
export async function searchTargetingLocation(query: string): Promise<{ key: string; name: string; type: string }[] | null> {
  const token = await userToken();
  if (!token) return null;
  const params = new URLSearchParams({
    type: "adgeolocation",
    q: query,
    location_types: JSON.stringify(["city", "region"]),
    access_token: token,
  });
  const res = await safeFetch(`${GRAPH_URL}/search?${params.toString()}`);
  if (!res || !res.ok) return null;
  const data = (await res.json()) as { data: { key: string; name: string; type: string }[] };
  return data.data ?? [];
}

export type BoostListingInput = {
  adAccountId: string; // "act_..."
  pageId: string;
  campaignName: string;
  objective: "OUTCOME_TRAFFIC" | "OUTCOME_LEADS" | "OUTCOME_ENGAGEMENT";
  dailyBudgetCents: number;
  startDate: Date;
  endDate: Date;
  geoKey: string;
  geoType: string; // "city" | "region", as returned by searchTargetingLocation
  linkUrl: string; // where a click goes — the property's share page
  imageUrl: string; // the approved social asset's public image
  caption: string;
};

export type CreatedCampaign = {
  externalCampaignId: string;
  externalAdSetId: string;
  externalAdId: string;
  externalCreativeId: string;
};

// Created paused at every intermediate step and only explicitly activated
// as the final call, so a failure partway through never leaves something
// silently spending. Best-effort cleanup of whatever was already created if
// a later step fails.
export async function createBoostCampaign(input: BoostListingInput): Promise<{ ok: true; campaign: CreatedCampaign } | { ok: false; error: string }> {
  const token = await userToken();
  if (!token) return { ok: false, error: "Meta isn't connected, or the connection needs to be reconnected." };

  const created: Partial<CreatedCampaign> = {};
  const cleanup = async () => {
    for (const id of [created.externalAdId, created.externalAdSetId, created.externalCampaignId]) {
      if (id) await safeFetch(`${GRAPH_URL}/${id}?access_token=${encodeURIComponent(token)}`, { method: "DELETE" }).catch(() => null);
    }
  };

  try {
    // 1. Campaign
    const campaignRes = await safeFetch(`${GRAPH_URL}/${input.adAccountId}/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.campaignName,
        objective: input.objective,
        status: "PAUSED",
        special_ad_categories: [],
        access_token: token,
      }),
    });
    const campaignData = campaignRes ? await campaignRes.json().catch(() => ({})) : {};
    if (!campaignRes || !campaignRes.ok || !campaignData.id) return { ok: false, error: campaignData?.error?.message ?? "Meta rejected the campaign." };
    created.externalCampaignId = campaignData.id;

    // 2. Ad set
    const geoField = input.geoType === "region" ? "regions" : "cities";
    const adSetRes = await safeFetch(`${GRAPH_URL}/${input.adAccountId}/adsets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${input.campaignName} — ad set`,
        campaign_id: created.externalCampaignId,
        daily_budget: input.dailyBudgetCents,
        start_time: input.startDate.toISOString(),
        end_time: input.endDate.toISOString(),
        billing_event: "IMPRESSIONS",
        optimization_goal: input.objective === "OUTCOME_LEADS" ? "LEAD_GENERATION" : input.objective === "OUTCOME_ENGAGEMENT" ? "POST_ENGAGEMENT" : "LINK_CLICKS",
        targeting: { geo_locations: { [geoField]: [{ key: input.geoKey }] }, age_min: 24 },
        status: "PAUSED",
        access_token: token,
      }),
    });
    const adSetData = adSetRes ? await adSetRes.json().catch(() => ({})) : {};
    if (!adSetRes || !adSetRes.ok || !adSetData.id) {
      await cleanup();
      return { ok: false, error: adSetData?.error?.message ?? "Meta rejected the ad set." };
    }
    created.externalAdSetId = adSetData.id;

    // 3. Ad creative
    const creativeRes = await safeFetch(`${GRAPH_URL}/${input.adAccountId}/adcreatives`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${input.campaignName} — creative`,
        object_story_spec: {
          page_id: input.pageId,
          link_data: { link: input.linkUrl, picture: input.imageUrl, message: input.caption },
        },
        access_token: token,
      }),
    });
    const creativeData = creativeRes ? await creativeRes.json().catch(() => ({})) : {};
    if (!creativeRes || !creativeRes.ok || !creativeData.id) {
      await cleanup();
      return { ok: false, error: creativeData?.error?.message ?? "Meta rejected the ad creative." };
    }
    created.externalCreativeId = creativeData.id;

    // 4. Ad (paused)
    const adRes = await safeFetch(`${GRAPH_URL}/${input.adAccountId}/ads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.campaignName,
        campaign_id: created.externalCampaignId,
        adset_id: created.externalAdSetId,
        creative: { creative_id: created.externalCreativeId },
        status: "PAUSED",
        access_token: token,
      }),
    });
    const adData = adRes ? await adRes.json().catch(() => ({})) : {};
    if (!adRes || !adRes.ok || !adData.id) {
      await cleanup();
      return { ok: false, error: adData?.error?.message ?? "Meta rejected the ad." };
    }
    created.externalAdId = adData.id;

    // 5. Activate — explicit final step, everything above stays PAUSED if this fails.
    const activateRes = await safeFetch(`${GRAPH_URL}/${created.externalAdId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ACTIVE", access_token: token }),
    });
    if (!activateRes || !activateRes.ok) {
      // Not cleaned up — the campaign/adset/ad/creative are all valid and
      // paused, just not live. Surfaced as an error so the caller can retry
      // resume rather than silently having "created but inactive" ads.
      return { ok: false, error: "Created but couldn't activate — resume it from the campaign list." };
    }

    return { ok: true, campaign: created as CreatedCampaign };
  } catch {
    await cleanup();
    return { ok: false, error: "Unexpected error creating the campaign." };
  }
}

export async function pauseCampaign(externalCampaignId: string): Promise<boolean> {
  const token = await userToken();
  if (!token) return false;
  const res = await safeFetch(`${GRAPH_URL}/${externalCampaignId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "PAUSED", access_token: token }),
  });
  return Boolean(res && res.ok);
}

export async function resumeCampaign(externalCampaignId: string): Promise<boolean> {
  const token = await userToken();
  if (!token) return false;
  const res = await safeFetch(`${GRAPH_URL}/${externalCampaignId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "ACTIVE", access_token: token }),
  });
  return Boolean(res && res.ok);
}

export type InsightSnapshot = {
  impressions: number;
  reach: number;
  clicks: number;
  spendCents: number;
  ctr: number;
  cpcCents: number;
  costPerResultCents: number | null;
};

// Meta's own insight data has a natural reporting delay — this is always
// called on-demand ("Sync now"), never assumed to be real-time.
export async function fetchCampaignInsights(externalCampaignId: string): Promise<InsightSnapshot | null> {
  const token = await userToken();
  if (!token) return null;
  const params = new URLSearchParams({
    fields: "impressions,reach,clicks,spend,ctr,cpc,cost_per_action_type",
    access_token: token,
  });
  const res = await safeFetch(`${GRAPH_URL}/${externalCampaignId}/insights?${params.toString()}`);
  if (!res || !res.ok) return null;
  const data = (await res.json()) as { data: Array<Record<string, unknown>> };
  const row = data.data?.[0];
  if (!row) return { impressions: 0, reach: 0, clicks: 0, spendCents: 0, ctr: 0, cpcCents: 0, costPerResultCents: null };

  const costPerAction = row.cost_per_action_type as Array<{ action_type: string; value: string }> | undefined;
  const costPerResult = costPerAction?.[0]?.value ? Math.round(Number(costPerAction[0].value) * 100) : null;

  return {
    impressions: Number(row.impressions ?? 0),
    reach: Number(row.reach ?? 0),
    clicks: Number(row.clicks ?? 0),
    spendCents: Math.round(Number(row.spend ?? 0) * 100),
    ctr: Number(row.ctr ?? 0),
    cpcCents: Math.round(Number(row.cpc ?? 0) * 100),
    costPerResultCents: costPerResult,
  };
}
