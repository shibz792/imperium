import Link from "next/link";
import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole, canSeeFinance, canSeeConfidential, isAdmin } from "@/lib/auth";
import { DEAL_ROLES } from "@/lib/roles";
import { Badge, Field, PageHeader, SectionCard, EmptyState } from "@/components/ui";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { DEAL_STAGE_TONE, OFFER_STATUS_TONE, VIEWING_STATUS_TONE, COMMISSION_STATUS_TONE } from "@/lib/badges";
import { formatCurrency, formatDate, formatDateTime, titleCase } from "@/lib/format";
import { updateDealStage, addOffer, respondOffer, addDealCollaborator, deleteDeal } from "../actions";
import { updateCommissionSplit } from "../../commissions/actions";
import { companyAmount, agencyFeePctSource, agentSplitSource } from "@/lib/commission";

export default async function DealDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ deleteError?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireRole(DEAL_ROLES);
  const showFinance = canSeeFinance(user);
  const showConfidential = canSeeConfidential(user);

  const [deal, allAgents] = await Promise.all([
    prisma.deal.findUnique({
      where: { id },
      include: {
        property: true,
        client: true,
        requirement: true,
        assignedAgent: true,
        otherBroker: true,
        collaborators: true,
        offers: { orderBy: { createdAt: "desc" } },
        viewings: { include: { contact: true }, orderBy: { scheduledAt: "desc" } },
        commission: true,
        activities: { include: { user: true }, orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.user.findMany({ where: { role: { in: ["AGENT", "SALES_MANAGER", "DIRECTOR", "SUPER_ADMIN"] }, active: true }, orderBy: { name: "asc" } }),
  ]);
  if (!deal) notFound();
  const availableAgents = allAgents.filter((a) => a.id !== deal.assignedAgentId && !deal.collaborators.some((c) => c.id === a.id));

  return (
    <div>
      {sp.deleteError && (
        <div className="mb-5 flex items-center gap-2 rounded border border-[#92601f4d] bg-[color:var(--color-bronze-tint)] px-4 py-2.5 text-sm text-[color:var(--color-bronze)]">
          {sp.deleteError}
        </div>
      )}

      <PageHeader
        eyebrow={deal.dealRef}
        title={deal.property.title}
        description={`${deal.client.name}${deal.requirement ? ` · matched via ${deal.requirement.requirementRef}` : ""}`}
        actions={
          isAdmin(user) ? (
            <form action={deleteDeal.bind(null, id)}>
              <ConfirmSubmitButton
                confirmMessage={`Permanently delete this deal (${deal.dealRef})? This can't be undone, and only works if nothing else references it.`}
                className="ir-btn ir-btn-danger"
              >
                <Trash2 size={14} /> Delete
              </ConfirmSubmitButton>
            </form>
          ) : undefined
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge tone={(DEAL_STAGE_TONE[deal.stage] as never) ?? "gray"}>{titleCase(deal.stage)}</Badge>
        <span className="text-xs text-black/45">{deal.probability}% probability</span>
        {showFinance && <span className="text-xs text-black/45">Expected: {formatCurrency(deal.expectedValue)}</span>}
        <form action={async (fd: FormData) => { "use server"; await updateDealStage(id, String(fd.get("stage"))); }} className="ml-auto flex items-center gap-1.5">
          <select name="stage" defaultValue={deal.stage} className="ir-select !py-1 !text-xs">
            {["NEW_INQUIRY", "CONTACT_ATTEMPTED", "QUALIFIED", "SHORTLISTED", "VIEWING_ARRANGED", "VIEWING_COMPLETED", "NEGOTIATION", "OFFER_SUBMITTED", "AGREEMENT_PENDING", "CLOSED_WON", "CLOSED_LOST"].map((s) => (
              <option key={s} value={s}>{titleCase(s)}</option>
            ))}
          </select>
          <button type="submit" className="ir-btn ir-btn-ghost !py-1 !text-xs">Update stage</button>
        </form>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <SectionCard title="Deal">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Property" value={<Link href={`/properties/${deal.propertyId}`} className="text-ir-gold-dark hover:underline">{deal.property.propertyRef}</Link>} />
            <Field
              label="Client"
              value={
                <span className="flex items-center gap-1.5">
                  <Link href={`/contacts/${deal.clientId}`} className="text-ir-gold-dark hover:underline">{deal.client.name}</Link>
                  {showConfidential && <WhatsAppButton phone={deal.client.phone} variant="icon" />}
                </span>
              }
            />
            <Field label="Assigned agent" value={deal.assignedAgent?.name} />
            <Field label="Other broker" value={deal.otherBroker ? `${deal.otherBroker.name}` : undefined} />
            {showFinance && <Field label="Expected value" value={formatCurrency(deal.expectedValue)} />}
            {showFinance && <Field label="Expected commission" value={deal.expectedCommissionPct ? `${deal.expectedCommissionPct}%` : undefined} />}
            <Field label="Next action" value={deal.nextAction} />
            <Field label="Closing date" value={formatDate(deal.closingDate)} />
          </div>
          {deal.lostReason && <div className="mt-3 rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">{deal.lostReason}</div>}
          <div className="mt-4 border-t border-black/6 pt-4">
            <div className="ir-label mb-1.5">Collaborating agents</div>
            {deal.collaborators.length > 0 && (
              <div className="mb-2.5 flex flex-wrap gap-1.5">
                {deal.collaborators.map((c) => (
                  <Link key={c.id} href={`/agents/${c.id}`}>
                    <Badge tone="navy">{c.name}</Badge>
                  </Link>
                ))}
              </div>
            )}
            {availableAgents.length > 0 && (
              <form action={addDealCollaborator.bind(null, deal.id)} className="flex gap-1.5">
                <select name="agentId" className="ir-select !py-1 !text-xs" defaultValue="">
                  <option value="" disabled>Add an agent…</option>
                  {availableAgents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <button type="submit" className="ir-btn ir-btn-ghost !py-1 !text-xs">Add</button>
              </form>
            )}
          </div>
        </SectionCard>

        <SectionCard title={`Offers (${deal.offers.length})`}>
          {deal.offers.length === 0 ? (
            <EmptyState title="No offers yet" />
          ) : (
            <ul className="mb-3 space-y-2.5">
              {deal.offers.map((o) => (
                <li key={o.id} className="border-b border-black/6 pb-2.5 last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-ir-navy">{formatCurrency(o.amount)}</span>
                    <Badge tone={(OFFER_STATUS_TONE[o.status] as never) ?? "gray"}>{titleCase(o.status)}</Badge>
                  </div>
                  <div className="mt-0.5 text-[0.7rem] text-black/40">{o.submittedBy} · {formatDate(o.createdAt)}</div>
                  {o.status === "SUBMITTED" && (
                    <div className="mt-1.5 flex gap-1.5">
                      <form action={respondOffer.bind(null, o.id, "ACCEPTED")}><button className="ir-btn ir-btn-ghost !py-1 !text-[0.7rem]">Accept</button></form>
                      <form action={respondOffer.bind(null, o.id, "COUNTERED")}><button className="ir-btn ir-btn-ghost !py-1 !text-[0.7rem]">Counter</button></form>
                      <form action={respondOffer.bind(null, o.id, "REJECTED")}><button className="ir-btn ir-btn-ghost !py-1 !text-[0.7rem]">Reject</button></form>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form action={addOffer.bind(null, deal.id)} className="flex gap-1.5">
            <input name="amount" type="number" placeholder="Amount" required className="ir-input !text-xs" />
            <SubmitButton className="ir-btn ir-btn-gold !text-xs">Log offer</SubmitButton>
          </form>
        </SectionCard>

        <SectionCard title="Commission">
          {!deal.commission ? (
            <EmptyState title="Not yet finalised" description="Commission records are created when a deal closes." action={<Link href="/commissions" className="ir-btn ir-btn-ghost">Commission Centre</Link>} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field
                  label="Agency fee"
                  value={
                    <>
                      {formatCurrency(deal.commission.agencyFeeAmount)} ({deal.commission.agencyFeePct}%)
                      <div className="mt-0.5 text-[0.65rem] font-normal normal-case text-black/35">{agencyFeePctSource(deal, deal.property.category)}</div>
                    </>
                  }
                />
                <Field label="Status" value={<Badge tone={(COMMISSION_STATUS_TONE[deal.commission.status] as never) ?? "gray"}>{titleCase(deal.commission.status)}</Badge>} />
                <Field
                  label={`Agent split${deal.assignedAgent ? ` (${deal.assignedAgent.name})` : ""}`}
                  value={
                    <>
                      {formatCurrency(deal.commission.agentSplitAmount)}
                      {deal.commission.agentSplitType === "PERCENT" ? ` (${deal.commission.agentSplitPct}%)` : deal.commission.agentSplitType === "FIXED" ? " (flat)" : ""}
                      <div className="mt-0.5 text-[0.65rem] font-normal normal-case text-black/35">{agentSplitSource(deal.assignedAgent)}</div>
                    </>
                  }
                />
                <Field label="Broker split" value={deal.commission.brokerSplitAmount ? `${formatCurrency(deal.commission.brokerSplitAmount)} (${deal.commission.brokerSplitPct}%)` : "-"} />
                <Field label="Company keeps" value={formatCurrency(companyAmount(deal.commission.agencyFeeAmount, deal.commission.agentSplitAmount, deal.commission.brokerSplitAmount))} />
                <Field label="Due date" value={formatDate(deal.commission.dueDate)} />
              </div>

              {showFinance && (
                <form action={updateCommissionSplit.bind(null, deal.commission.id)} className="mt-4 grid grid-cols-2 gap-3 border-t border-black/6 pt-4 sm:grid-cols-4">
                  <div>
                    <label className="ir-label mb-1 block">Agency fee %</label>
                    <input name="agencyFeePct" type="number" step="0.1" min={0} defaultValue={deal.commission.agencyFeePct ?? undefined} className="ir-input !py-1.5 !text-xs" />
                  </div>
                  <div>
                    <label className="ir-label mb-1 block">Agent paid</label>
                    <select name="agentSplitType" defaultValue={deal.commission.agentSplitType ?? "PERCENT"} className="ir-select !py-1.5 !text-xs">
                      <option value="PERCENT">% of fee</option>
                      <option value="FIXED">Flat amount</option>
                    </select>
                  </div>
                  <div>
                    <label className="ir-label mb-1 block">Agent rate</label>
                    <input name="agentSplitRate" type="number" min={0} defaultValue={deal.commission.agentSplitPct ?? deal.commission.agentSplitAmount ?? undefined} className="ir-input !py-1.5 !text-xs" />
                  </div>
                  <div>
                    <label className="ir-label mb-1 block">Broker split %</label>
                    <input name="brokerSplitPct" type="number" step="0.1" min={0} defaultValue={deal.commission.brokerSplitPct ?? 0} className="ir-input !py-1.5 !text-xs" />
                  </div>
                  <button type="submit" className="ir-btn ir-btn-ghost col-span-2 !text-xs sm:col-span-4">Recalculate split</button>
                </form>
              )}
            </>
          )}
        </SectionCard>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard title={`Viewings (${deal.viewings.length})`}>
          {deal.viewings.length === 0 ? (
            <EmptyState title="No viewings scheduled" action={<Link href={`/viewings/new?dealId=${deal.id}`} className="ir-btn ir-btn-ghost">Schedule viewing</Link>} />
          ) : (
            <ul className="space-y-2.5">
              {deal.viewings.map((v) => (
                <li key={v.id} className="flex items-center justify-between border-b border-black/6 pb-2.5 last:border-0">
                  <span className="text-sm text-ir-navy">{formatDateTime(v.scheduledAt)}</span>
                  <Badge tone={(VIEWING_STATUS_TONE[v.status] as never) ?? "gray"}>{titleCase(v.status)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Activity history">
          {deal.activities.length === 0 ? (
            <EmptyState title="No activity yet" />
          ) : (
            <ul className="space-y-2.5">
              {deal.activities.map((a) => (
                <li key={a.id} className="border-b border-black/6 pb-2.5 text-sm last:border-0">
                  <div className="text-ir-navy">{a.message}</div>
                  <div className="mt-0.5 text-xs text-black/40">{a.user?.name ?? "System"} · {formatDateTime(a.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
