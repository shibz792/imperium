// Human handoff for the WhatsApp lead-chat agent — round-robin assignment
// and the Task that gets a human looking at a lead promptly. This is the
// first automated Task creator in the app (every other Task today is
// created by a human via a form), which is why it's a small dedicated
// module rather than folded into an existing action.

import { prisma } from "@/lib/prisma";
import type { LeadIntent } from "@/lib/whatsappAgent";

// Scoped to AGENT specifically, not the broader SALES_TEAM_ROLES (which
// also includes Sales Managers/Directors who shouldn't get raw inbound
// leads auto-assigned by default).
export async function pickNextAgent(): Promise<string | null> {
  const agents = await prisma.user.findMany({
    where: { role: "AGENT", active: true },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  if (!agents.length) return null;

  const last = await prisma.whatsAppConversation.findFirst({
    where: { assignedAgentId: { not: null } },
    orderBy: { handedOffAt: "desc" },
    select: { assignedAgentId: true },
  });
  const lastIdx = last ? agents.findIndex((a) => a.id === last.assignedAgentId) : -1;
  return agents[(lastIdx + 1) % agents.length].id;
}

export async function createHandoffTask(opts: { conversationId: string; contactId: string; contactName: string; intent: LeadIntent; reason: string }): Promise<void> {
  const assignedToId = await pickNextAgent();
  const title = opts.intent === "OFFERING" ? `New property lead ready for review — ${opts.contactName}` : `WhatsApp lead ready for handoff — ${opts.contactName}`;

  const task = await prisma.task.create({
    data: {
      type: "CONTACT_INQUIRY",
      title,
      dueAt: new Date(),
      relatedEntityType: "contact",
      relatedEntityId: opts.contactId,
      assignedToId: assignedToId ?? undefined,
      createdById: null,
    },
  });

  await prisma.whatsAppConversation.update({
    where: { id: opts.conversationId },
    data: { status: "HANDED_OFF", handedOffAt: new Date(), assignedAgentId: assignedToId },
  });

  await prisma.activity.create({
    data: {
      entityType: "contact",
      contactId: opts.contactId,
      type: "WHATSAPP_HANDOFF",
      message: `Handed off to a human agent (${opts.reason}). Task: "${task.title}".`,
      userId: null,
    },
  });
}
