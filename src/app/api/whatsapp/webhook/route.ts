import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookHandshake, verifyWebhookSignature, parseInboundMessages, sendWhatsAppMessage, downloadWhatsAppMedia } from "@/lib/whatsapp";
import { ensureWhatsAppMediaFolder, uploadToPropertyFolder } from "@/lib/google";
import { findOrCreateContact } from "@/lib/contacts";
import { runAgentTurn, maybeMaterializeLead, buildPriorContext, type ConversationSlots } from "@/lib/whatsappAgent";
import { createHandoffTask } from "@/lib/whatsappHandoff";
import { logActivity } from "@/lib/audit";

// Point Meta's WhatsApp Business app at
// https://<your-domain>/api/whatsapp/webhook with WHATSAPP_VERIFY_TOKEN set
// in .env. Not reachable from Meta until this app is deployed somewhere
// with a public HTTPS URL — localhost can't receive webhooks — but the
// handshake and signature verification below match Meta's contract exactly.
//
// Every inbound message drives the WhatsApp AI Agent (src/lib/whatsappAgent.ts):
// find-or-create a WhatsAppConversation (+ Contact on first contact), log
// the message, run one conversational turn, send the reply, and — once
// enough is known — materialize a real Requirement (buyer/tenant) or
// Property (owner) and/or hand off to a human agent. See the approved plan
// at the time this was built for the full design rationale.

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const challenge = verifyWebhookHandshake(
    searchParams.get("hub.mode"),
    searchParams.get("hub.verify_token"),
    searchParams.get("hub.challenge"),
  );
  if (challenge === null) return new NextResponse("Forbidden", { status: 403 });
  return new NextResponse(challenge, { status: 200 });
}

const FALLBACK_REPLY = "Thanks for reaching out — one of our property consultants will get back to you shortly.";
const MAX_TURNS = 20;
const LOW_CONFIDENCE_ESCALATION_THRESHOLD = 2;

export async function POST(req: Request) {
  const rawBody = await req.text();

  if (process.env.WHATSAPP_APP_SECRET) {
    const valid = verifyWebhookSignature(rawBody, req.headers.get("x-hub-signature-256"));
    if (!valid) return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Bad payload", { status: 400 });
  }

  const messages = parseInboundMessages(payload);
  for (const msg of messages) {
    await handleInboundMessage(msg);
  }

  return NextResponse.json({ received: messages.length });
}

async function handleInboundMessage(msg: Awaited<ReturnType<typeof parseInboundMessages>>[number]) {
  // Webhook-retry idempotency — Meta redelivers on anything but a prompt
  // 200, and can genuinely double-send. This is the primary guard; the
  // @unique constraint on externalMessageId is the backstop against a race
  // between two concurrent deliveries (caught below).
  if (msg.id) {
    const dup = await prisma.whatsAppMessage.findUnique({ where: { externalMessageId: msg.id } });
    if (dup) return;
  }

  let conversation = await prisma.whatsAppConversation.findUnique({ where: { waId: msg.from } });
  if (!conversation) {
    const contactId = await findOrCreateContact(msg.profileName, msg.from, "BUYER", null, { source: "WhatsApp AI Agent" });
    // findOrCreateContact dedupes by phone — an existing Contact here means
    // a genuine returning lead, so surface their history to Sam rather than
    // starting the conversation cold.
    const priorContext = await buildPriorContext(contactId);
    conversation = await prisma.whatsAppConversation.create({
      data: {
        waId: msg.from,
        profileName: msg.profileName,
        contactId,
        // First-touch Click-to-WhatsApp ad attribution — only ever set on
        // the message that started the conversation, never overwritten.
        referralJson: msg.referral ? (msg.referral as object) : undefined,
        slotsJson: priorContext ? ({ intent: "UNCLEAR", priorContext } satisfies ConversationSlots as object) : undefined,
      },
    });
  }

  // Photo pipeline — download from Meta, upload to Drive. Never blocks the
  // conversation: any failure here (Drive not connected, Meta media URL
  // expired, network blip) just leaves this message's media fields null
  // and the chat continues normally.
  let mediaDriveFileId: string | undefined;
  let mediaMimeType: string | undefined;
  if (msg.image) {
    try {
      const downloaded = await downloadWhatsAppMedia(msg.image.mediaId);
      if (downloaded) {
        const folderId = await ensureWhatsAppMediaFolder();
        if (folderId) {
          const uploadResult = await uploadToPropertyFolder(folderId, downloaded.buffer, `${msg.id || Date.now()}.jpg`, downloaded.mimeType);
          if (uploadResult.ok) {
            mediaDriveFileId = uploadResult.fileId;
            mediaMimeType = downloaded.mimeType;
          } else {
            console.error("WhatsApp photo Drive upload failed", uploadResult.error);
          }
        }
      }
    } catch (err) {
      console.error("WhatsApp photo pipeline failed", err);
    }
  }

  try {
    await prisma.whatsAppMessage.create({
      data: {
        conversationId: conversation.id,
        direction: "IN",
        text: msg.text,
        externalMessageId: msg.id || undefined,
        mediaDriveFileId,
        mediaMimeType,
        mediaCaption: msg.image?.caption,
      },
    });
  } catch (e) {
    // Unique constraint race on externalMessageId — a concurrent webhook
    // delivery already recorded this exact message; safe to stop here.
    if ((e as { code?: string })?.code === "P2002") return;
    throw e;
  }

  const turnCount = conversation.turnCount + 1;
  await prisma.whatsAppConversation.update({ where: { id: conversation.id }, data: { lastInboundAt: new Date(), turnCount } });

  if (conversation.contactId) {
    await logActivity({ entityType: "contact", contactId: conversation.contactId, type: "WHATSAPP", message: msg.text, userId: null });
  }

  // Handed off / closed — a human has (or should have) taken over; the bot
  // stays silent so it never talks over an active human negotiation.
  if (conversation.status !== "ACTIVE") return;

  const historyRows = await prisma.whatsAppMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const history = historyRows.reverse().map((m) => ({ direction: m.direction, text: m.text }));
  const photoCount = await prisma.whatsAppMessage.count({
    where: { conversationId: conversation.id, direction: "IN", mediaDriveFileId: { not: null } },
  });

  const result = await runAgentTurn({ slotsJson: conversation.slotsJson }, history, photoCount);

  if (!result) {
    // Hard Groq failure — never leave the lead hanging. Fixed fallback
    // reply, then immediate escalation, no retry.
    await sendWhatsAppMessage(msg.from, FALLBACK_REPLY);
    await prisma.whatsAppMessage.create({ data: { conversationId: conversation.id, direction: "OUT", text: FALLBACK_REPLY } });
    await prisma.whatsAppConversation.update({ where: { id: conversation.id }, data: { lastOutboundAt: new Date() } });
    if (conversation.contactId) {
      await escalate(conversation.id, conversation.contactId, "UNCLEAR", "AI agent unavailable");
    }
    return;
  }

  await sendWhatsAppMessage(msg.from, result.reply);
  await prisma.whatsAppMessage.create({ data: { conversationId: conversation.id, direction: "OUT", text: result.reply } });

  const lowConfidenceRuns = result.confused ? conversation.lowConfidenceRuns + 1 : 0;
  // Carry the returning-lead summary forward — it's only ever set once, at
  // conversation creation, and the per-turn result never includes it.
  const priorContext = (conversation.slotsJson as ConversationSlots | null)?.priorContext;
  const slotsJson: ConversationSlots = { intent: result.intent, requirement: result.requirementSlots, property: result.propertySlots, priorContext };
  await prisma.whatsAppConversation.update({
    where: { id: conversation.id },
    data: { slotsJson: slotsJson as object, lastOutboundAt: new Date(), lowConfidenceRuns },
  });

  await maybeMaterializeLead(conversation.id, msg.from, result);

  const shouldHandoff = result.handoffRequested || lowConfidenceRuns >= LOW_CONFIDENCE_ESCALATION_THRESHOLD || turnCount >= MAX_TURNS;
  if (shouldHandoff && conversation.contactId) {
    const reason =
      result.handoffReason ??
      (lowConfidenceRuns >= LOW_CONFIDENCE_ESCALATION_THRESHOLD
        ? "Bot was repeatedly unable to help"
        : turnCount >= MAX_TURNS
          ? "Conversation length limit reached"
          : "Requested by the lead");
    await escalate(conversation.id, conversation.contactId, result.intent, reason);
  }
}

async function escalate(conversationId: string, contactId: string, intent: "SEEKING" | "OFFERING" | "UNCLEAR", reason: string) {
  const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { name: true } });
  await createHandoffTask({ conversationId, contactId, contactName: contact?.name ?? "WhatsApp lead", intent, reason });
}
