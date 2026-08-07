import { requireRole } from "@/lib/auth";
import { PageHeader, StatTile, SectionCard, Badge } from "@/components/ui";
import { getAnalyticsData } from "@/lib/queries/analytics";
import { formatCurrency, titleCase } from "@/lib/format";
import { FunnelChart, AgentPerformanceChart } from "@/components/charts/AnalyticsCharts";

const CATEGORY_LABELS = ["Residential", "Commercial", "Industrial", "Land"];

export default async function AnalyticsPage() {
  await requireRole(["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER", "FINANCE", "MARKETING"]);
  const data = await getAnalyticsData();

  return (
    <div>
      <PageHeader eyebrow="Analytics" title="Demand, supply & performance" description="Where demand concentrates, where inventory falls short, and how the pipeline converts." />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Active listings" value={data.activePropertiesCount} />
        <StatTile label="Ready to market" value={`${data.readyToMarket}`} hint="≥90% completeness" tone="good" />
        <StatTile label="Stale listings" value={data.staleCount} tone="warn" />
        <StatTile label="Avg. completeness" value={`${data.avgCompleteness}%`} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard title="Demand heatmap: location × category">
          {data.heatmapRows.length === 0 ? (
            <p className="text-xs text-black/40">No active demand recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-black/40">
                    <th className="py-1.5 pr-3 font-medium">Location</th>
                    {CATEGORY_LABELS.map((c) => <th key={c} className="px-1.5 py-1.5 font-medium">{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.heatmapRows.map((row) => (
                    <tr key={row.location} className="border-t border-black/6">
                      <td className="py-1.5 pr-3 font-medium text-ir-navy">{row.location}</td>
                      {row.counts.map((c, i) => (
                        <td key={i} className="px-1.5 py-1.5">
                          <div
                            className="flex h-7 w-11 items-center justify-center rounded text-[0.7rem] font-medium tabular-nums"
                            style={{
                              background: c === 0 ? "rgba(9,21,38,0.04)" : `rgba(204,162,116,${0.15 + 0.7 * (c / data.heatmapMax)})`,
                              color: c > data.heatmapMax * 0.55 ? "#091526" : "rgba(9,21,38,0.6)",
                            }}
                          >
                            {c || ""}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Inventory gap report">
          {data.gapReport.length === 0 ? (
            <p className="text-xs text-black/40">No significant supply gaps detected.</p>
          ) : (
            <ul className="space-y-2.5">
              {data.gapReport.map((g, i) => (
                <li key={i} className="flex items-center justify-between gap-3 border-b border-black/6 pb-2.5 last:border-0">
                  <div className="text-xs text-black/70">
                    <span className="font-medium text-ir-navy">{g.count}</span> {titleCase(g.subtype)} requirements around <span className="font-medium text-ir-navy">{g.location}</span>, only <span className="font-medium text-ir-navy">{g.supply}</span> matching active listing{g.supply === 1 ? "" : "s"}.
                  </div>
                  {g.gap > 0 && <Badge tone="red">Gap: {g.gap}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard title="Pipeline conversion funnel">
          <FunnelChart data={data.funnel} />
        </SectionCard>

        <SectionCard title="Agent performance">
          <AgentPerformanceChart data={data.agentPerformance} />
        </SectionCard>
      </div>

      <SectionCard title="Commission by agent">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/8 text-[0.7rem] uppercase tracking-wide text-black/40">
                <th className="py-2 pr-3 font-medium">Agent</th>
                <th className="px-3 py-2 font-medium">Open deals</th>
                <th className="px-3 py-2 font-medium">Closed won</th>
                <th className="px-3 py-2 font-medium">Commission earned</th>
              </tr>
            </thead>
            <tbody>
              {data.agentPerformance.map((a) => (
                <tr key={a.name} className="border-b border-black/6 last:border-0">
                  <td className="py-2.5 pr-3 font-medium text-ir-navy">{a.name}</td>
                  <td className="px-3 py-2.5 text-black/60">{a.dealsOpen}</td>
                  <td className="px-3 py-2.5 text-black/60">{a.dealsWon}</td>
                  <td className="px-3 py-2.5 text-black/70">{formatCurrency(a.commissionEarned)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
