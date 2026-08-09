import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole, FINANCE_ROLES } from "@/lib/auth";
import { PageHeader, Badge, StatTile, EmptyState } from "@/components/ui";
import { ClickableRow } from "@/components/ClickableRow";
import { Pagination } from "@/components/Pagination";
import { paginationParams, totalPages as computeTotalPages } from "@/lib/pagination";
import { COMMISSION_STATUS_TONE } from "@/lib/badges";
import { formatCurrency, formatDate, titleCase } from "@/lib/format";
import { updateCommissionStatus } from "./actions";
import { companyAmount, agencyFeePctSource, agentSplitSource } from "@/lib/commission";

export default async function CommissionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole(FINANCE_ROLES);
  const sp = await searchParams;
  const { page, skip, take } = paginationParams(sp);

  // Totals must reflect every commission on record, not just the page being
  // displayed — a lighter, relation-free query for the math, separate from
  // the paginated, fully-joined query used for the table rows below.
  const [totalsSource, commissions, total] = await Promise.all([
    prisma.commission.findMany({ select: { agencyFeeAmount: true, agentSplitAmount: true, brokerSplitAmount: true, status: true, dueDate: true } }),
    prisma.commission.findMany({
      include: { deal: { include: { property: true, client: true, assignedAgent: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.commission.count(),
  ]);
  const pages = computeTotalPages(total);

  const totals = totalsSource.reduce(
    (acc, c) => {
      acc.total += c.agencyFeeAmount ?? 0;
      acc.company += companyAmount(c.agencyFeeAmount, c.agentSplitAmount, c.brokerSplitAmount);
      if (c.status === "PAID") acc.paid += c.agencyFeeAmount ?? 0;
      else if (c.status === "OVERDUE" || (c.dueDate && c.dueDate < new Date())) acc.overdue += c.agencyFeeAmount ?? 0;
      else acc.pending += c.agencyFeeAmount ?? 0;
      return acc;
    },
    { total: 0, company: 0, paid: 0, pending: 0, overdue: 0 },
  );

  return (
    <div>
      <PageHeader eyebrow={`Commission Centre · ${total}`} title="Commission Centre" description="Agency fees, broker splits and expected payments." />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile label="Total commission" value={formatCurrency(totals.total)} />
        <StatTile label="Company keeps" value={formatCurrency(totals.company)} />
        <StatTile label="Paid" value={formatCurrency(totals.paid)} tone="good" />
        <StatTile label="Pending / invoiced" value={formatCurrency(totals.pending)} tone="gold" />
        <StatTile label="Overdue" value={formatCurrency(totals.overdue)} tone="warn" />
      </div>

      {commissions.length === 0 ? (
        <EmptyState title="No commission records yet" description="These are created automatically when a deal is marked Closed Won." />
      ) : (
        <div className="ir-card overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/8 text-[0.7rem] uppercase tracking-wide text-black/40">
                <th className="px-4 py-3 font-medium">Deal</th>
                <th className="px-4 py-3 font-medium">Agency fee</th>
                <th className="px-4 py-3 font-medium">Agent split</th>
                <th className="px-4 py-3 font-medium">Broker split</th>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Due</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {commissions.map((c) => {
                const overdue = c.status !== "PAID" && c.dueDate && c.dueDate < new Date();
                return (
                  <ClickableRow key={c.id} href={`/deals/${c.dealId}`} className="border-b border-black/6 last:border-0 hover:bg-black/[0.015]">
                    <td className="px-4 py-3">
                      <Link href={`/deals/${c.dealId}`} className="font-medium text-ir-navy hover:text-ir-gold-dark">{c.deal.property.title}</Link>
                      <div className="mt-0.5 text-[0.7rem] text-black/40">{c.deal.dealRef} · {c.deal.client.name} · {c.deal.assignedAgent?.name ?? "-"}</div>
                    </td>
                    <td className="px-4 py-3 text-black/70">
                      {formatCurrency(c.agencyFeeAmount)} <span className="text-[0.7rem] text-black/40">({c.agencyFeePct}%)</span>
                      <div className="text-[0.65rem] text-black/30">{agencyFeePctSource(c.deal, c.deal.property.category)}</div>
                    </td>
                    <td className="px-4 py-3 text-black/60">
                      {formatCurrency(c.agentSplitAmount)}
                      {c.agentSplitType === "PERCENT" && c.agentSplitPct != null && <span className="text-[0.7rem] text-black/40"> ({c.agentSplitPct}%)</span>}
                      {c.agentSplitType === "FIXED" && <span className="text-[0.7rem] text-black/40"> (flat)</span>}
                      <div className="text-[0.65rem] text-black/30">{agentSplitSource(c.deal.assignedAgent)}</div>
                    </td>
                    <td className="px-4 py-3 text-black/60">{c.brokerSplitAmount ? formatCurrency(c.brokerSplitAmount) : "-"}</td>
                    <td className="px-4 py-3 text-black/70">{formatCurrency(companyAmount(c.agencyFeeAmount, c.agentSplitAmount, c.brokerSplitAmount))}</td>
                    <td className="px-4 py-3 text-black/50">{formatDate(c.dueDate)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={overdue ? "red" : ((COMMISSION_STATUS_TONE[c.status] as never) ?? "gray")}>{overdue ? "Overdue" : titleCase(c.status)}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {c.status !== "PAID" && (
                        <div className="flex justify-end gap-1">
                          {c.status === "PENDING" && (
                            <form action={updateCommissionStatus.bind(null, c.id, "INVOICED")}><button className="ir-btn ir-btn-ghost !py-1 !text-[0.7rem]">Invoice</button></form>
                          )}
                          <form action={updateCommissionStatus.bind(null, c.id, "PAID")}><button className="ir-btn ir-btn-gold !py-1 !text-[0.7rem]">Mark paid</button></form>
                        </div>
                      )}
                    </td>
                  </ClickableRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={pages} total={total} basePath="/commissions" searchParams={sp} />
    </div>
  );
}
