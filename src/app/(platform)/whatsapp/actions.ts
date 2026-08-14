"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { SALES_TEAM_ROLES } from "@/lib/roles";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { logActivity } from "@/lib/audit";

// Typing into the conversation detail view's send box *is* the takeover
// action — it sends the message, logs it, and flips the conversation to
// HANDED_OFF (if it wasn't already) so the bot never talks over a human
// who has just jumped in, without needing a separate "take over" button to
// keep in sync with this one.
//
// A delivery failure (Cloud API not configured, Meta rate-limited, wrong
// number) is surfaced back to the agent, not silently swallowed — same
// ?xError=… banner pattern deleteContact already uses. Silently no-op-ing
// here would let an agent believe a reply reached a real client on a live
// deal when it never left the server.
export async function sendManualMessage(conversationId: string, formData: FormData): Promise<void> {
  const user = await requireRole(SALES_TEAM_ROLES);
  const message = String(formData.get("message") ?? "").trim();
  if (!message) return;

  const conversation = await prisma.whatsAppConversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return;

  const send = await sendWhatsAppMessage(conversation.waId, message);
  if (!send.ok) {
    redirect(`/whatsapp/${conversationId}?sendError=${encodeURIComponent(send.error ?? "Failed to send.")}`);
  }

  await prisma.whatsAppMessage.create({
    data: { conversationId, direction: "OUT", text: message, authorUserId: user.id },
  });

  await prisma.whatsAppConversation.update({
    where: { id: conversationId },
    data: {
      lastOutboundAt: new Date(),
      ...(conversation.status === "ACTIVE" ? { status: "HANDED_OFF", handedOffAt: new Date(), assignedAgentId: conversation.assignedAgentId ?? user.id } : {}),
    },
  });

  if (conversation.contactId) {
    await logActivity({ entityType: "contact", contactId: conversation.contactId, type: "WHATSAPP", message: `${user.name}: ${message}`, userId: user.id });
  }

  revalidatePath(`/whatsapp/${conversationId}`);
  revalidatePath("/whatsapp");
}

// Deliberately a separate, explicit action — never automatic (no timeout,
// no re-engagement) per the handoff design: resuming the bot on a
// conversation a human has taken over is a decision only a human makes.
export async function resumeBot(conversationId: string): Promise<void> {
  await requireRole(SALES_TEAM_ROLES);
  await prisma.whatsAppConversation.update({ where: { id: conversationId }, data: { status: "ACTIVE", lowConfidenceRuns: 0 } });
  revalidatePath(`/whatsapp/${conversationId}`);
  revalidatePath("/whatsapp");
}
