import { prisma } from "@/lib/prisma";

// "Agent" in the product sense (spec: "sometimes we work with multiple
// agents") spans two different records:
//  - internal staff (User rows with a client-facing role)
//  - external co-broking partners (Contact rows with contactType BROKER)
// Both get a roster card; only internal staff get a full performance
// profile since only they have assignedX / collaboratingX relations.
const AGENT_ROLES = ["AGENT", "SALES_MANAGER", "DIRECTOR", "SUPER_ADMIN"] as const;

export async function getAgentRoster() {
  const [internal, external] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: [...AGENT_ROLES] } },
      include: {
        _count: {
          select: {
            assignedProperties: true,
            assignedRequirements: true,
            assignedDeals: true,
            collaboratingProperties: true,
            collaboratingRequirements: true,
            collaboratingDeals: true,
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.contact.findMany({
      where: { contactType: "BROKER" },
      include: { _count: { select: { dealsAsBroker: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  return { internal, external };
}

export async function getAgentProfile(id: string) {
  const [user, closedDeals, commissions] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: {
        assignedProperties: { orderBy: { updatedAt: "desc" } },
        assignedRequirements: { orderBy: { updatedAt: "desc" }, include: { client: true } },
        assignedDeals: { include: { property: true, client: true }, orderBy: { updatedAt: "desc" } },
        collaboratingProperties: { orderBy: { updatedAt: "desc" } },
        collaboratingRequirements: { include: { client: true }, orderBy: { updatedAt: "desc" } },
        collaboratingDeals: { include: { property: true, client: true }, orderBy: { updatedAt: "desc" } },
      },
    }),
    prisma.deal.count({ where: { assignedAgentId: id, stage: "CLOSED_WON" } }),
    prisma.commission.findMany({ where: { deal: { assignedAgentId: id } } }),
  ]);

  const commissionEarned = commissions.reduce((s, c) => s + (c.agentSplitAmount ?? 0), 0);
  const openDeals = user?.assignedDeals.filter((d) => d.stage !== "CLOSED_WON" && d.stage !== "CLOSED_LOST").length ?? 0;

  return { user, closedDeals, commissionEarned, openDeals };
}
