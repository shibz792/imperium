import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchCampaignInsights } from "@/lib/metaAds";

// Scheduled sync for every ACTIVE Meta campaign's insights — wired to
// Vercel Cron (see vercel.json). Gated by CRON_SECRET rather than a user
// session, since Vercel Cron calls this with no browser/cookie context.
// Building this as a route rather than a background worker: this app has
// no queue/cron infra beyond Vercel Cron itself today, and a daily sync
// doesn't need one.
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const campaigns = await prisma.metaCampaign.findMany({ where: { status: "ACTIVE" } });
  let synced = 0;
  for (const campaign of campaigns) {
    const snapshot = await fetchCampaignInsights(campaign.externalCampaignId);
    if (snapshot) {
      await prisma.metaCampaignInsight.create({ data: { campaignId: campaign.id, ...snapshot } });
      synced++;
    }
  }

  return NextResponse.json({ ok: true, total: campaigns.length, synced });
}
