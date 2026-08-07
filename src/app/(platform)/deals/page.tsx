import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { canSeeFinance, requireUser } from "@/lib/auth";
import { PageHeader, Badge } from "@/components/ui";
import { ClickableRow } from "@/components/ClickableRow";
import { DEAL_STAGES } from "@/lib/badges";
import { formatCurrency } from "@/lib/format";
import { updateDealStage } from "./actions";

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

// Grouped to match how a deal actually moves here: chasing it, matching /
// showing inventory, then the closing mechanics. Purely a visual grouping
// in the kanban header band — the stages themselves are unchanged.
const STAGE_GROUPS: { label: string; stages: string[] }[] = [
  { label: "Contact", stages: ["NEW_INQUIRY", "CONTACT_ATTEMPTED", "QUALIFIED"] },
  { label: "Matching", stages: ["SHORTLISTED", "VIEWING_ARRANGED", "VIEWING_COMPLETED"] },
  { label: "Closing", stages: ["NEGOTIATION", "OFFER_SUBMITTED", "AGREEMENT_PENDING"] },
  { label: "Done", stages: ["CLOSED_WON", "CLOSED_LOST"] },
];

export default async function DealsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const view = sp.view === "list" ? "list" : "kanban";

  const deals = await prisma.deal.findMany({
    include: { property: true, client: true, assignedAgent: true },
    orderBy: { updatedAt: "desc" },
  });

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
        <div>
          <div className="mb-2 flex gap-3 overflow-x-auto">
            {STAGE_GROUPS.map((g) => (
              <div key={g.label} className="ir-label !mb-0" style={{ width: g.stages.length * 292 - 12 }}>
                {g.label}
              </div>
            ))}
          </div>
          <div className="flex gap-3 overflow-x-auto pb-4">
            {DEAL_STAGES.map((stage) => {
              const items = deals.filter((d) => d.stage === stage);
              const stageValue = items.reduce((s, d) => s + (d.expectedValue ?? 0), 0);
              return (
                <div key={stage} className="w-[280px] shrink-0">
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className="text-xs font-semibold text-ir-navy">{COLUMN_LABELS[stage]}</span>
                    <span className="text-[0.65rem] text-black/40">{items.length}</span>
                  </div>
                  <div className="mb-2 px-1 text-[0.7rem] text-black/35">{formatCurrency(stageValue)}</div>
                  <div className="space-y-2.5">
                    {items.map((d) => (
                      <div key={d.id} className="ir-card ir-card-hover overflow-hidden">
                        <Link href={`/deals/${d.id}`} className="block p-3">
                          <div className="text-[0.8125rem] font-medium leading-snug text-ir-navy">{d.property.title}</div>
                          <div className="mt-1.5 flex items-center justify-between">
                            <span className="text-[0.7rem] text-black/45">{d.client.name}</span>
                            <span className="ir-figure text-sm text-ir-navy">{formatCurrency(d.expectedValue)}</span>
                          </div>
                          <div className="mt-1 text-[0.7rem] text-black/40">{d.assignedAgent?.name ?? "Unassigned"}</div>
                        </Link>
                        {nextStage(stage) && (
                          <form action={updateDealStage.bind(null, d.id, nextStage(stage)!)} className="border-t border-black/[0.06]">
                            <button type="submit" className="w-full px-3 py-2 text-left text-[0.7rem] font-medium text-ir-gold-dark hover:bg-ir-gold/10">
                              Move to {COLUMN_LABELS[nextStage(stage)!]} →
                            </button>
                          </form>
                        )}
                      </div>
                    ))}
                    {items.length === 0 && <div className="rounded border border-dashed border-black/10 p-3 text-center text-[0.7rem] text-black/30">Empty</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
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
              {deals.map((d) => (
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
    </div>
  );
}

function nextStage(current: string): string | null {
  const idx = DEAL_STAGES.indexOf(current);
  if (idx === -1 || idx >= DEAL_STAGES.length - 3) return null; // don't auto-advance into closed states
  return DEAL_STAGES[idx + 1];
}
