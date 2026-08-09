import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { canSeeFinance, requireRole } from "@/lib/auth";
import { DEAL_ROLES } from "@/lib/roles";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { ClickableRow } from "@/components/ClickableRow";
import { Pagination } from "@/components/Pagination";
import { paginationParams, totalPages as computeTotalPages } from "@/lib/pagination";
import { DEAL_STAGES } from "@/lib/badges";
import { formatCurrency } from "@/lib/format";
import { DealsKanban } from "./DealsKanban";

const COLUMN_LABELS: Record<string, string> = {
  NEW_INQUIRY: "New inquiry",
  CONTACT_ATTEMPTED: "Contact attempted",
  QUALIFIED: "Qualified",
  SHORTLISTED: "Shortlisted",
  VIEWING_ARRANGED: "Viewing arranged",
  VIEWING_COMPLETED: "Viewing completed",
  NEGOTIATION: "Negotiation",
  OFFER_SUBMITTED: "Offer submitted",
  AGREEMENT_PENDING: "Agreement pending",
  CLOSED_WON: "Closed won",
  CLOSED_LOST: "Closed lost",
};

export default async function DealsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireRole(DEAL_ROLES);
  const view = sp.view === "list" ? "list" : "kanban";

  // Kanban buckets by stage and the header's pipeline value both need the
  // full set, not a page of it — pagination below only trims what the list
  // view actually renders, sliced from data already in memory rather than
  // a second query.
  const deals = await prisma.deal.findMany({
    include: { property: true, client: true, assignedAgent: true },
    orderBy: { updatedAt: "desc" },
  });
  const { page, skip, take } = paginationParams(sp);
  const pages = computeTotalPages(deals.length);
  const pagedDeals = deals.slice(skip, skip + take);

  const openDeals = deals.filter((d) => d.stage !== "CLOSED_WON" && d.stage !== "CLOSED_LOST");
  const pipelineValue = openDeals.reduce((s, d) => s + (d.expectedValue ?? 0), 0);
  const expectedCommission = openDeals.reduce((s, d) => s + ((d.expectedValue ?? 0) * (d.expectedCommissionPct ?? 0)) / 100, 0);

  return (
    <div>
      <PageHeader
        eyebrow={`Deals · ${deals.length}`}
        title="Deals pipeline"
        description={canSeeFinance(user) ? `Open pipeline value ${formatCurrency(pipelineValue)} · expected commission ${formatCurrency(expectedCommission)}` : "New inquiry through closing."}
        actions={
          <>
            <Link href="/deals?view=kanban" className={`ir-btn ${view === "kanban" ? "ir-btn-primary" : "ir-btn-ghost"}`}>Kanban</Link>
            <Link href="/deals?view=list" className={`ir-btn ${view === "list" ? "ir-btn-primary" : "ir-btn-ghost"}`}>List</Link>
            <Link href="/deals/new" className="ir-btn ir-btn-gold"><Plus size={15} /> New deal</Link>
          </>
        }
      />

      {view === "kanban" ? (
        <DealsKanban
          stages={DEAL_STAGES}
          deals={deals.map((d) => ({
            id: d.id,
            stage: d.stage,
            expectedValue: d.expectedValue,
            property: { title: d.property.title },
            client: { name: d.client.name },
            assignedAgent: d.assignedAgent ? { name: d.assignedAgent.name } : null,
          }))}
        />
      ) : deals.length === 0 ? (
        <EmptyState
          title="No deals yet"
          description="A deal is created the moment a requirement is matched to a property. Start from Matchmaker, or add one directly."
          action={<Link href="/deals/new" className="ir-btn ir-btn-gold"><Plus size={15} /> New deal</Link>}
        />
      ) : (
        <div className="ir-card overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/8 text-[0.7rem] uppercase tracking-wide text-black/40">
                <th className="px-4 py-3 font-medium">Deal</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Value</th>
                <th className="px-4 py-3 font-medium">Stage</th>
                <th className="px-4 py-3 font-medium">Probability</th>
                <th className="px-4 py-3 font-medium">Agent</th>
              </tr>
            </thead>
            <tbody>
              {pagedDeals.map((d) => (
                <ClickableRow key={d.id} href={`/deals/${d.id}`} className="border-b border-black/6 last:border-0 hover:bg-black/[0.015]">
                  <td className="px-4 py-3">
                    <Link href={`/deals/${d.id}`} className="font-medium text-ir-navy hover:text-ir-gold-dark">{d.property.title}</Link>
                    <div className="mt-0.5 text-[0.7rem] text-black/40">{d.dealRef}</div>
                  </td>
                  <td className="px-4 py-3 text-black/70">{d.client.name}</td>
                  <td className="px-4 py-3 text-black/70">{formatCurrency(d.expectedValue)}</td>
                  <td className="px-4 py-3"><Badge tone="navy">{COLUMN_LABELS[d.stage]}</Badge></td>
                  <td className="px-4 py-3 text-black/60">{d.probability}%</td>
                  <td className="px-4 py-3 text-black/60">{d.assignedAgent?.name ?? "-"}</td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === "list" && <Pagination page={page} totalPages={pages} total={deals.length} basePath="/deals" searchParams={sp} />}
    </div>
  );
}
