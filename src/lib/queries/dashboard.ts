import { prisma } from "@/lib/prisma";
import { scoreMatch } from "@/lib/match";

const DAY = 86_400_000;

export async function getDashboardData() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + DAY);
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const staleThreshold = new Date(now.getTime() - 30 * DAY);

  const [
    newProperties,
    newRequirements,
    openTasks,
    upcomingViewings,
    pendingOffers,
    openDeals,
    staleListings,
    activeProperties,
    searchingRequirements,
    existingShares,
    recentActivity,
  ] = await Promise.all([
    prisma.property.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.requirement.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.task.findMany({
      where: { status: "OPEN", dueAt: { lte: endOfToday } },
      orderBy: { dueAt: "asc" },
      include: { assignedTo: true },
      take: 8,
    }),
    prisma.viewing.findMany({
      where: { scheduledAt: { gte: now }, status: { in: ["SCHEDULED", "CONFIRMED"] } },
      orderBy: { scheduledAt: "asc" },
      include: { property: true, contact: true, agent: true },
      take: 6,
    }),
    prisma.offer.findMany({
      where: { status: { in: ["SUBMITTED", "COUNTERED"] } },
      include: { deal: { include: { property: true, client: true } } },
      orderBy: { createdAt: "asc" },
      take: 6,
    }),
    prisma.deal.findMany({
      where: { stage: { notIn: ["CLOSED_WON", "CLOSED_LOST"] } },
      select: { expectedValue: true, expectedCommissionPct: true },
    }),
    prisma.property.findMany({
      where: {
        listingStatus: "ACTIVE",
        OR: [{ lastVerifiedDate: null }, { lastVerifiedDate: { lt: staleThreshold } }],
      },
      orderBy: { lastVerifiedDate: "asc" },
      take: 8,
    }),
    prisma.property.findMany({ where: { listingStatus: "ACTIVE" } }),
    prisma.requirement.findMany({ where: { status: { in: ["ACTIVELY_SEARCHING", "QUALIFIED", "NEW", "OPTIONS_SHARED"] } } }),
    prisma.matchShare.findMany({ select: { propertyId: true, requirementId: true } }),
    prisma.activity.findMany({ orderBy: { createdAt: "desc" }, take: 10, include: { user: true, property: true, requirement: true, deal: true } }),
  ]);

  const sharedSet = new Set(existingShares.map((s) => `${s.propertyId}:${s.requirementId}`));
  let matchesAwaitingReview = 0;
  const hotspotCounts = new Map<string, number>();
  for (const r of searchingRequirements) {
    const locs = Array.isArray(r.preferredLocationsJson) ? (r.preferredLocationsJson as string[]) : [];
    for (const l of locs) hotspotCounts.set(l, (hotspotCounts.get(l) ?? 0) + 1);
    for (const p of activeProperties) {
      if (sharedSet.has(`${p.id}:${r.id}`)) continue;
      const result = scoreMatch(p, r);
      if (result && result.score >= 70) matchesAwaitingReview++;
    }
  }

  const pipelineValue = openDeals.reduce((sum, d) => sum + (d.expectedValue ?? 0), 0);
  const expectedCommission = openDeals.reduce((sum, d) => sum + ((d.expectedValue ?? 0) * (d.expectedCommissionPct ?? 0)) / 100, 0);

  const hotspots = Array.from(hotspotCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([location, count]) => ({ location, count }));

  return {
    newProperties,
    newRequirements,
    matchesAwaitingReview,
    openTasks,
    upcomingViewings,
    pendingOffers,
    pipelineValue,
    expectedCommission,
    staleListings,
    hotspots,
    recentActivity,
    openDealsCount: openDeals.length,
  };
}
