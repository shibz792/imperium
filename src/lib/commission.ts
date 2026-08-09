import { prisma } from "@/lib/prisma";

// Splits the agency fee between the company and the assigned agent. Two
// rate shapes because agents in practice aren't all paid the same way: most
// are a percentage cut of the fee, some senior/salaried arrangements are a
// flat amount per deal regardless of size.

export const DEFAULT_AGENT_SPLIT_PCT = 50;
export const DEFAULT_AGENCY_FEE_PCT = 2.5;

// The agency fee % a deal defaults to, keyed by the property's category —
// a warehouse and a house don't necessarily earn the agency the same rate.
// A deal's own expectedCommissionPct (typed in manually) always wins over
// this; this is only the fallback used when closing a deal that never got
// one, and as the pre-filled suggestion on the new-deal form.
export async function agencyFeePctForCategory(category: string): Promise<number> {
  const rule = await prisma.commissionRateRule.findUnique({ where: { category: category as never } });
  return rule?.agencyFeePct ?? DEFAULT_AGENCY_FEE_PCT;
}

export type AgentRate = { commissionRateType?: string | null; commissionRate?: number | null } | null | undefined;

export type AgentSplit = { type: "PERCENT" | "FIXED"; pct: number | null; amount: number };

export function computeAgentSplit(agencyFeeAmount: number, agent: AgentRate): AgentSplit {
  if (agent?.commissionRateType === "FIXED" && agent.commissionRate != null) {
    // A flat fee can't exceed the agency fee itself — otherwise the
    // company's share would go negative on a small deal.
    const amount = Math.max(0, Math.min(agent.commissionRate, agencyFeeAmount));
    return { type: "FIXED", pct: null, amount: Math.round(amount) };
  }
  const pct = agent?.commissionRate ?? DEFAULT_AGENT_SPLIT_PCT;
  return { type: "PERCENT", pct, amount: Math.round((agencyFeeAmount * pct) / 100) };
}

// What's left for the agency after the agent's cut and any co-broke split —
// derived at read time rather than stored, so it's never a second source of
// truth that can drift from the two numbers it's made of.
export function companyAmount(agencyFeeAmount: number | null, agentSplitAmount: number | null, brokerSplitAmount: number | null): number {
  return Math.max(0, (agencyFeeAmount ?? 0) - (agentSplitAmount ?? 0) - (brokerSplitAmount ?? 0));
}

// A commission's two rates each come from one of a few places, and neither
// number explains itself on screen — this names the source in plain words
// so reading "6.25%" doesn't require already knowing the priority order
// (deal override → property-category default; agent's own rate → company
// default). Reads off what's on record now, not a historical snapshot of
// what was true the moment the deal closed — good enough for "why is this
// what it is", not meant as an audit trail.
export function agencyFeePctSource(deal: { expectedCommissionPct: number | null }, propertyCategory: string): string {
  return deal.expectedCommissionPct != null ? "set on this deal" : `${propertyCategory.replace(/_/g, " ").toLowerCase()} category default`;
}

export function agentSplitSource(agent: AgentRate): string {
  if (agent?.commissionRateType === "FIXED" && agent.commissionRate != null) return "this agent's flat rate";
  if (agent?.commissionRate != null) return "this agent's rate";
  return `company default (${DEFAULT_AGENT_SPLIT_PCT}%)`;
}
