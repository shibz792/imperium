import { prisma } from "@/lib/prisma";
import { DEAL_STAGES } from "@/lib/badges";
import { completenessScore, isStale } from "@/lib/property";

const ACTIVE_REQUIREMENT_STATUSES = ["NEW", "UNVERIFIED", "QUALIFIED", "ACTIVELY_SEARCHING", "OPTIONS_SHARED", "VIEWING_ARRANGED", "NEGOTIATING"] as const;

export async function getAnalyticsData() {
  const [properties, requirements, deals, users, commissions] = await Promise.all([
    prisma.property.findMany(),
    prisma.requirement.findMany({ where: { status: { in: [...ACTIVE_REQUIREMENT_STATUSES] } } }),
    prisma.deal.findMany({ include: { assignedAgent: true } }),
    prisma.user.findMany({ where: { role: "AGENT", active: true } }),
    prisma.commission.findMany({ include: { deal: { include: { assignedAgent: true } } } }),
  ]);

  // --- Demand heatmap: location x category ------------------------------
  const heatmap = new Map<string, Map<string, number>>();
  for (const r of requirements) {
    const locs = Array.isArray(r.preferredLocationsJson) ? (r.preferredLocationsJson as string[]) : ["Unspecified"];
    for (const loc of locs.length ? locs : ["Unspecified"]) {
      if (!heatmap.has(loc)) heatmap.set(loc, new Map());
      const row = heatmap.get(loc)!;
      row.set(r.category, (row.get(r.category) ?? 0) + 1);
    }
  }
  const categories = ["RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL_LOGISTICS", "LAND_AGRICULTURE"];
  const heatmapRows = Array.from(heatmap.entries())
    .map(([location, row]) => ({
      location,
      counts: categories.map((c) => row.get(c) ?? 0),
      total: categories.reduce((s, c) => s + (row.get(c) ?? 0), 0),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
  const heatmapMax = Math.max(1, ...heatmapRows.flatMap((r) => r.counts));

  // --- Inventory gap report: location x subtype demand vs supply --------
  type GapKey = string;
  const demand = new Map<GapKey, { location: string; subtype: string; category: string; count: number }>();
  for (const r of requirements) {
    const locs = Array.isArray(r.preferredLocationsJson) ? (r.preferredLocationsJson as string[]) : [];
    for (const loc of locs) {
      const key = `${loc}::${r.subtype ?? "Any"}`;
      const existing = demand.get(key);
      if (existing) existing.count++;
      else demand.set(key, { location: loc, subtype: r.subtype ?? "Any", category: r.category, count: 1 });
    }
  }
  const supply = new Map<GapKey, number>();
  for (const p of properties.filter((p) => p.listingStatus === "ACTIVE")) {
    const key = `${p.city}::${p.subtype}`;
    supply.set(key, (supply.get(key) ?? 0) + 1);
    if (p.district) {
      const dKey = `${p.district}::${p.subtype}`;
      supply.set(dKey, (supply.get(dKey) ?? 0) + 1);
    }
  }
  const gapReport = Array.from(demand.entries())
    .map(([key, d]) => ({ ...d, supply: supply.get(key) ?? 0, gap: d.count - (supply.get(key) ?? 0) }))
    .filter((g) => g.count >= 2)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 8);

  // --- Conversion funnel ---------------------------------------------
  const funnel = DEAL_STAGES.filter((s) => s !== "CLOSED_LOST").map((stage) => ({
    stage,
    count: deals.filter((d) => d.stage === stage || DEAL_STAGES.indexOf(d.stage) > DEAL_STAGES.indexOf(stage) || d.stage === "CLOSED_WON").length,
  }));

  // --- Agent performance -------------------------------------------------
  const agentPerformance = users.map((u) => {
    const agentDeals = deals.filter((d) => d.assignedAgentId === u.id);
    const won = agentDeals.filter((d) => d.stage === "CLOSED_WON").length;
    const open = agentDeals.filter((d) => d.stage !== "CLOSED_WON" && d.stage !== "CLOSED_LOST").length;
    const earned = commissions.filter((c) => c.deal.assignedAgentId === u.id).reduce((s, c) => s + (c.agentSplitAmount ?? 0), 0);
    return { name: u.name, dealsOpen: open, dealsWon: won, commissionEarned: earned };
  }).sort((a, b) => b.commissionEarned - a.commissionEarned);

  // --- Listing quality ----------------------------------------------
  const activeProperties = properties.filter((p) => p.listingStatus === "ACTIVE");
  const readyToMarket = activeProperties.filter((p) => completenessScore(p).score >= 90).length;
  const staleCount = activeProperties.filter((p) => isStale(p)).length;
  const avgCompleteness = activeProperties.length ? Math.round(activeProperties.reduce((s, p) => s + completenessScore(p).score, 0) / activeProperties.length) : 0;

  return {
    heatmapRows,
    heatmapMax,
    categories,
    gapReport,
    funnel,
    agentPerformance,
    activePropertiesCount: activeProperties.length,
    readyToMarket,
    staleCount,
    avgCompleteness,
    totalRequirements: requirements.length,
  };
}
