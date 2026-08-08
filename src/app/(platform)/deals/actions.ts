"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { nextDealRef } from "@/lib/refs";
import { writeAudit, logActivity } from "@/lib/audit";
import { computeAgentSplit, agencyFeePctForCategory } from "@/lib/commission";

function str(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}
function num(fd: FormData, key: string): number | undefined {
  const v = str(fd, key);
  if (v === undefined) return undefined;
  const n = Number(v.replace(/,/g, ""));
  return Number.isNaN(n) ? undefined : n;
}

function collaboratorIds(fd: FormData): string[] {
  return fd.getAll("collaboratorIds").filter((v): v is string => typeof v === "string" && v.length > 0);
}

export async function createDeal(formData: FormData) {
  const user = await requireUser();
  const propertyId = str(formData, "propertyId")!;
  const clientId = str(formData, "clientId")!;

  const deal = await prisma.deal.create({
    data: {
      dealRef: await nextDealRef(),
      propertyId,
      clientId,
      requirementId: str(formData, "requirementId"),
      assignedAgentId: str(formData, "assignedAgentId") ?? user.id,
      stage: (str(formData, "stage") ?? "NEW_INQUIRY") as never,
      expectedValue: num(formData, "expectedValue"),
      expectedCommissionPct: num(formData, "expectedCommissionPct"),
      probability: num(formData, "probability") ?? 20,
      nextAction: str(formData, "nextAction") ?? "Contact client",
      collaborators: { connect: collaboratorIds(formData).map((id) => ({ id })) },
    },
  });

  await writeAudit({ userId: user.id, action: "CREATE", entityType: "deal", entityId: deal.id });
  await logActivity({ entityType: "deal", dealId: deal.id, type: "CREATED", message: `${user.name} opened this deal.`, userId: user.id });

  revalidatePath("/deals");
  redirect(`/deals/${deal.id}`);
}

export async function updateDealStage(id: string, stage: string) {
  const user = await requireUser();
  const isClosed = stage === "CLOSED_WON" || stage === "CLOSED_LOST";
  const deal = await prisma.deal.update({
    where: { id },
    data: {
      stage: stage as never,
      probability: stage === "CLOSED_WON" ? 100 : stage === "CLOSED_LOST" ? 0 : undefined,
      closingDate: isClosed ? new Date() : undefined,
    },
    include: { commission: true, assignedAgent: true, property: true },
  });
  await logActivity({ entityType: "deal", dealId: id, type: "STAGE", message: `${user.name} moved this deal to ${stage.replace(/_/g, " ")}.`, userId: user.id });
  await writeAudit({ userId: user.id, action: "STAGE_CHANGE", entityType: "deal", entityId: id, after: { stage } });

  // Auto-draft a commission record the first time a deal closes won — spec
  // §7 "commission tracking" should never require a separate manual step.
  // The agent's split comes from their own commission rate (set on their
  // agent profile) — a flat 50% for everyone was never actually right.
  if (stage === "CLOSED_WON" && !deal.commission && deal.expectedValue) {
    // A deal-specific rate (typed in on the deal) always wins; otherwise
    // fall back to whatever this property's category is configured for
    // (Admin → Categories) rather than one flat rate for every property.
    const pct = deal.expectedCommissionPct ?? (await agencyFeePctForCategory(deal.property.category));
    const agencyFeeAmount = Math.round((deal.expectedValue * pct) / 100);
    const agentSplit = computeAgentSplit(agencyFeeAmount, deal.assignedAgent);
    await prisma.commission.create({
      data: {
        dealId: id,
        agencyFeePct: pct,
        agencyFeeAmount,
        agentSplitType: agentSplit.type,
        agentSplitPct: agentSplit.pct,
        agentSplitAmount: agentSplit.amount,
        brokerSplitPct: deal.otherBrokerId ? 20 : 0,
        brokerSplitAmount: deal.otherBrokerId ? Math.round(agencyFeeAmount * 0.2) : 0,
        status: "PENDING",
        dueDate: new Date(Date.now() + 14 * 86_400_000),
      },
    });
  }

  revalidatePath("/deals");
  revalidatePath(`/deals/${id}`);
  revalidatePath("/commissions");
}

export async function addOffer(dealId: string, formData: FormData) {
  const user = await requireUser();
  const amount = num(formData, "amount") ?? 0;
  await prisma.offer.create({
    data: { dealId, amount, terms: str(formData, "terms"), submittedBy: str(formData, "submittedBy") ?? user.name },
  });
  await prisma.deal.update({ where: { id: dealId }, data: { stage: "OFFER_SUBMITTED" } });
  await logActivity({ entityType: "deal", dealId, type: "OFFER", message: `${user.name} logged an offer of ${amount.toLocaleString()}.`, userId: user.id });
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
}

export async function respondOffer(offerId: string, status: string) {
  const user = await requireUser();
  const offer = await prisma.offer.update({ where: { id: offerId }, data: { status: status as never, respondedAt: new Date() } });
  await logActivity({ entityType: "deal", dealId: offer.dealId, type: "OFFER_RESPONSE", message: `${user.name} marked the offer as ${status.toLowerCase()}.`, userId: user.id });
  revalidatePath(`/deals/${offer.dealId}`);
}

export async function addDealCollaborator(dealId: string, formData: FormData) {
  const user = await requireUser();
  const agentId = str(formData, "agentId");
  if (!agentId) return;
  const [deal, agent] = await Promise.all([
    prisma.deal.update({ where: { id: dealId }, data: { collaborators: { connect: { id: agentId } } } }),
    prisma.user.findUnique({ where: { id: agentId } }),
  ]);
  await logActivity({ entityType: "deal", dealId: deal.id, type: "COLLABORATOR_ADDED", message: `${user.name} added ${agent?.name ?? "an agent"} as a collaborator on this deal.`, userId: user.id });
  revalidatePath(`/deals/${dealId}`);
}
