"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, ADMIN_ROLES } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { appBaseUrl } from "@/lib/url";
import { searchTargetingLocation, createBoostCampaign, pauseCampaign, resumeCampaign, fetchCampaignInsights, type BoostListingInput } from "@/lib/metaAds";

export async function searchLocations(query: string) {
  await requireRole(ADMIN_ROLES);
  if (!query.trim()) return [];
  return (await searchTargetingLocation(query)) ?? [];
}

// Assets a "Boost this listing" flow can actually use as the ad creative —
// approved, and with a composed image (SOCIAL_1_1/STORY_9_16), since the
// Marketing API's link_data creative needs a real picture, not just text.
export async function boostableAssetsForProperty(propertyId: string) {
  await requireRole(ADMIN_ROLES);
  return prisma.marketingAsset.findMany({
    where: { propertyId, approved: true, imageUrl: { not: null }, contentType: { in: ["SOCIAL_1_1", "STORY_9_16"] } },
    orderBy: { createdAt: "desc" },
  });
}

export type BoostListingFormInput = {
  propertyId: string;
  marketingAssetId: string;
  objective: "OUTCOME_TRAFFIC" | "OUTCOME_LEADS" | "OUTCOME_ENGAGEMENT";
  dailyBudgetCents: number;
  startDate: string; // ISO date
  endDate: string; // ISO date
  geoKey: string;
  geoName: string;
  geoType: string;
};

export async function boostListing(input: BoostListingFormInput): Promise<{ ok: boolean; campaignId?: string; error?: string }> {
  const user = await requireRole(ADMIN_ROLES);

  const [adAccount, page, property, asset, sharePage] = await Promise.all([
    prisma.metaAdAccount.findFirst({ where: { isActive: true } }),
    prisma.metaPage.findFirst({ where: { isActive: true } }),
    prisma.property.findUniqueOrThrow({ where: { id: input.propertyId } }),
    prisma.marketingAsset.findUniqueOrThrow({ where: { id: input.marketingAssetId } }),
    prisma.sharePage.findFirst({ where: { propertyId: input.propertyId }, orderBy: { createdAt: "desc" } }),
  ]);
  if (!adAccount) return { ok: false, error: "No active ad account — connect and choose one in Settings first." };
  if (!page) return { ok: false, error: "No active Facebook Page — connect and choose one in Settings first." };
  if (!asset.imageUrl) return { ok: false, error: "This creative has no image." };

  const linkUrl = sharePage ? `${appBaseUrl()}/share/${sharePage.slug}` : appBaseUrl();
  const imageUrl = /^https?:\/\//.test(asset.imageUrl) ? asset.imageUrl : `${appBaseUrl()}${asset.imageUrl}`;

  const boostInput: BoostListingInput = {
    adAccountId: adAccount.adAccountId,
    pageId: page.pageId,
    campaignName: `${property.title} — ${new Date().toISOString().slice(0, 10)}`,
    objective: input.objective,
    dailyBudgetCents: input.dailyBudgetCents,
    startDate: new Date(input.startDate),
    endDate: new Date(input.endDate),
    geoKey: input.geoKey,
    geoType: input.geoType,
    linkUrl,
    imageUrl,
    caption: asset.content,
  };

  const result = await createBoostCampaign(boostInput);
  if (!result.ok) return { ok: false, error: result.error };

  const campaign = await prisma.metaCampaign.create({
    data: {
      propertyId: input.propertyId,
      marketingAssetId: input.marketingAssetId,
      adAccountId: adAccount.id,
      externalCampaignId: result.campaign.externalCampaignId,
      externalAdSetId: result.campaign.externalAdSetId,
      externalAdId: result.campaign.externalAdId,
      externalCreativeId: result.campaign.externalCreativeId,
      objective: input.objective,
      dailyBudgetCents: input.dailyBudgetCents,
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
      targetingLocation: input.geoName,
      targetingGeoJson: { key: input.geoKey, name: input.geoName, type: input.geoType },
      status: "ACTIVE",
      createdById: user.id,
    },
  });

  await logActivity({ entityType: "property", propertyId: input.propertyId, type: "MARKETING_AD_CREATED", message: `${user.name} boosted this listing on Meta (${input.geoName}, ${(input.dailyBudgetCents / 100).toLocaleString()}/day).`, userId: user.id });
  revalidatePath("/marketing-studio");
  return { ok: true, campaignId: campaign.id };
}

export async function campaignsForProperty(propertyId: string) {
  await requireRole(ADMIN_ROLES);
  return prisma.metaCampaign.findMany({
    where: { propertyId },
    include: { adAccount: true, insights: { orderBy: { syncedAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
  });
}

export async function pauseMetaCampaign(id: string) {
  const user = await requireRole(ADMIN_ROLES);
  const campaign = await prisma.metaCampaign.findUniqueOrThrow({ where: { id } });
  const ok = await pauseCampaign(campaign.externalCampaignId);
  if (ok) {
    await prisma.metaCampaign.update({ where: { id }, data: { status: "PAUSED" } });
    await logActivity({ entityType: "property", propertyId: campaign.propertyId, type: "MARKETING_AD_PAUSED", message: `${user.name} paused a Meta ad campaign.`, userId: user.id });
  }
  revalidatePath("/marketing-studio");
  return { ok };
}

export async function resumeMetaCampaign(id: string) {
  await requireRole(ADMIN_ROLES);
  const campaign = await prisma.metaCampaign.findUniqueOrThrow({ where: { id } });
  const ok = await resumeCampaign(campaign.externalCampaignId);
  if (ok) await prisma.metaCampaign.update({ where: { id }, data: { status: "ACTIVE" } });
  revalidatePath("/marketing-studio");
  return { ok };
}

// Manual "Sync now" — Meta's own insight data has reporting delay, so this
// is always on-demand/cached, never real-time. Inserts a new snapshot row
// rather than upserting in place, so spend-over-time stays real history.
export async function syncCampaignInsights(id: string): Promise<{ ok: boolean }> {
  await requireRole(ADMIN_ROLES);
  const campaign = await prisma.metaCampaign.findUniqueOrThrow({ where: { id } });
  const snapshot = await fetchCampaignInsights(campaign.externalCampaignId);
  if (!snapshot) return { ok: false };
  await prisma.metaCampaignInsight.create({ data: { campaignId: id, ...snapshot } });
  revalidatePath("/marketing-studio");
  return { ok: true };
}
