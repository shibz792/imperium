"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { FINANCE_ROLES } from "@/lib/auth";
import { computeAgentSplit, DEFAULT_AGENCY_FEE_PCT } from "@/lib/commission";

export async function updateCommissionStatus(id: string, status: string) {
  const user = await requireRole(FINANCE_ROLES);
  await prisma.commission.update({
    where: { id },
    data: { status: status as never, paidDate: status === "PAID" ? new Date() : undefined },
  });
  await writeAudit({ userId: user.id, action: "COMMISSION_STATUS", entityType: "commission", entityId: id, after: { status } });
  revalidatePath("/commissions");
}

function num(fd: FormData, key: string): number | undefined {
  const v = fd.get(key);
  if (typeof v !== "string" || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

// Recomputes a specific deal's commission split — the agent's own default
// rate drafted it, but a specific deal can always need a different deal
// (a one-off bonus split, a manager stepping in, a correction). Every
// number here is derived from agencyFeePct/agentSplitType/agentSplitRate
// rather than typed in directly, so the split always adds up.
export async function updateCommissionSplit(commissionId: string, formData: FormData) {
  const user = await requireRole(FINANCE_ROLES);
  const commission = await prisma.commission.findUnique({ where: { id: commissionId }, include: { deal: true } });
  if (!commission) return;

  const agencyFeePct = num(formData, "agencyFeePct") ?? commission.agencyFeePct ?? DEFAULT_AGENCY_FEE_PCT;
  const agencyFeeAmount = Math.round(((commission.deal.expectedValue ?? 0) * agencyFeePct) / 100);

  const commissionRateType = formData.get("agentSplitType") === "FIXED" ? "FIXED" : "PERCENT";
  const commissionRate = num(formData, "agentSplitRate");
  const agentSplit = computeAgentSplit(agencyFeeAmount, { commissionRateType, commissionRate });

  const brokerSplitPct = num(formData, "brokerSplitPct") ?? commission.brokerSplitPct ?? 0;
  const brokerSplitAmount = Math.round((agencyFeeAmount * brokerSplitPct) / 100);

  await prisma.commission.update({
    where: { id: commissionId },
    data: {
      agencyFeePct,
      agencyFeeAmount,
      agentSplitType: agentSplit.type,
      agentSplitPct: agentSplit.pct,
      agentSplitAmount: agentSplit.amount,
      brokerSplitPct,
      brokerSplitAmount,
    },
  });
  await writeAudit({ userId: user.id, action: "COMMISSION_RECALCULATED", entityType: "commission", entityId: commissionId, after: { agencyFeePct, agentSplit, brokerSplitPct } });
  revalidatePath(`/deals/${commission.dealId}`);
  revalidatePath("/commissions");
}
