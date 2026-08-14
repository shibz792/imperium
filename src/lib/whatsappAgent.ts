// The WhatsApp lead-chat agent's core turn engine — dual-intent
// (SEEKING: a buyer/tenant qualifying, OFFERING: an owner listing their own
// property) multi-turn conversation over Groq, plus the "materialize into a
// real CRM record" step once enough is known. See src/app/api/whatsapp/webhook/route.ts
// for how this gets called per inbound message.

import { prisma } from "@/lib/prisma";
import { groqChat, type GroqChatMessage } from "@/lib/groq";
import { findOrCreateContact } from "@/lib/contacts";
import { nextPropertyRef, nextRequirementRef } from "@/lib/refs";
import { districtForCity } from "@/lib/locations";
import { writeAudit, logActivity } from "@/lib/audit";
import type { PropertyDraftFields, RequirementDraftFields } from "@/lib/intake-types";

export type LeadIntent = "SEEKING" | "OFFERING" | "UNCLEAR";

export type ConversationSlots = {
  intent: LeadIntent;
  requirement?: Partial<RequirementDraftFields>;
  property?: Partial<PropertyDraftFields>;
};

export type AgentTurnResult = {
  reply: string;
  intent: LeadIntent;
  requirementSlots?: Partial<RequirementDraftFields>;
  propertySlots?: Partial<PropertyDraftFields>;
  handoffRequested: boolean;
  handoffReason?: string;
  confused: boolean;
};

// ---------------------------------------------------------------------------
// System prompt — same Sri Lankan real-estate domain knowledge as AI
// Intake's extractor (src/lib/ai-intake.ts), rewritten for a live-chat
// persona instead of a one-shot extraction pass: greet, ask one or two
// questions per turn (not an interrogation), classify intent from context
// rather than a keyword rule (a lead sending house photos with no "looking
// for" framing is a strong OFFERING signal, but that's for the model to
// read, not a hardcoded trigger).
// ---------------------------------------------------------------------------

function buildSystemPrompt(prior: ConversationSlots, photoCount: number): string {
  return `You are Imperium Realty's WhatsApp assistant, chatting live with someone who just messaged the business's WhatsApp number — often after clicking a Facebook/Instagram ad. Reply the way a helpful, brisk property consultant would over WhatsApp: short, warm, plain sentences, never a wall of text, never more than one or two questions in a single reply.

First, work out this person's intent from the conversation so far:
- "SEEKING" — they're looking for a property to buy or rent.
- "OFFERING" — they're an owner wanting to sell or rent out their own property (a very common real signal: they send photos of a house/room/land with no "looking for" framing, or say things like "I want to sell my house").
- "UNCLEAR" — not yet obvious either way; ask a light, natural question to find out (e.g. "Are you looking for a property, or do you have one you'd like to list with us?").
Once you're confident, commit to SEEKING or OFFERING and stay with it for the rest of the conversation — don't flip back to UNCLEAR on a single ambiguous message.

If SEEKING, gather (one or two at a time, never all at once): dealType (BUY/RENT/LEASE), category (RESIDENTIAL/COMMERCIAL/INDUSTRIAL_LOGISTICS/LAND_AGRICULTURE), subtype (house/apartment/land/etc — their own words are fine), locations (areas/cities they'd consider), budgetMin/budgetMax, sizeMin/sizeMax if relevant, urgency (LOW/MEDIUM/HIGH/CRITICAL) if it comes up naturally.

If OFFERING, gather: category, subtype, city, district, sizeSqft or sizePerches or sizeAcres, totalPrice (for sale) or monthlyRental (for rent), and encourage them to send a few photos if none have arrived yet. ${photoCount > 0 ? `They have already sent ${photoCount} photo(s) — acknowledge that naturally, don't ask them to resend.` : "No photos have arrived yet — if it's natural in the conversation, ask for a couple."}

Sri Lankan currency: LKR. "lakh(s)" = 100,000. "Cr"/"crore" = 10,000,000. "mn"/"million" = 1,000,000. Never invent a price, availability, or a specific property that wasn't actually given to you — you have no live inventory search in this conversation. If asked something you can't answer confidently, say a property consultant will follow up, and set handoffRequested true.

Set "handoffRequested": true when the person explicitly asks to speak to a person, wants to arrange a viewing, is ready to move forward, or you genuinely cannot help further in the conversation. Set "confused": true only when you could not make sense of their message at all (garbled, off-topic, or repeats something already answered) — not just because a field is still missing.

Every field you return for "requirementSlots"/"propertySlots" must be the FULL current value (e.g. the complete list of locations mentioned so far, not just new ones this turn) — you'll be given what's already known below, merge into it, never regress a filled field back to empty just because this message didn't repeat it.

Currently known slots: ${JSON.stringify(prior)}

Return strict JSON only, matching exactly this shape:
{
  "reply": "the WhatsApp message text to send back",
  "intent": "SEEKING" | "OFFERING" | "UNCLEAR",
  "requirementSlots": { "dealType": "BUY"|"RENT"|"LEASE", "category": "RESIDENTIAL"|"COMMERCIAL"|"INDUSTRIAL_LOGISTICS"|"LAND_AGRICULTURE", "subtype": string, "locations": string[], "budgetMin": number, "budgetMax": number, "sizeMin": number, "sizeMax": number, "urgency": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL" },
  "propertySlots": { "category": "RESIDENTIAL"|"COMMERCIAL"|"INDUSTRIAL_LOGISTICS"|"LAND_AGRICULTURE", "subtype": string, "city": string, "district": string, "sizeSqft": number, "sizePerches": number, "sizeAcres": number, "totalPrice": number, "monthlyRental": number, "description": string },
  "handoffRequested": boolean,
  "handoffReason": string,
  "confused": boolean
}
Omit any slot field you don't actually know — never invent a value. Include only "requirementSlots" once intent is SEEKING, only "propertySlots" once intent is OFFERING; omit both while still UNCLEAR.`;
}

type RawTurnOutput = {
  reply?: unknown;
  intent?: unknown;
  requirementSlots?: Partial<RequirementDraftFields>;
  propertySlots?: Partial<PropertyDraftFields>;
  handoffRequested?: unknown;
  handoffReason?: unknown;
  confused?: unknown;
};

// null return = the Groq call itself failed outright (network/API error) —
// the caller (webhook route) treats that as an immediate hard-escalation
// trigger, never a silent drop or a retry loop.
export async function runAgentTurn(
  conversation: { slotsJson: unknown },
  history: { direction: "IN" | "OUT"; text: string }[],
  photoCount: number,
): Promise<AgentTurnResult | null> {
  const prior: ConversationSlots = (conversation.slotsJson as ConversationSlots | null) ?? { intent: "UNCLEAR" };

  const messages: GroqChatMessage[] = [
    { role: "system", content: buildSystemPrompt(prior, photoCount) },
    ...history.map((m) => ({ role: m.direction === "IN" ? ("user" as const) : ("assistant" as const), content: m.text })),
  ];

  const result = await groqChat<RawTurnOutput>(messages);
  if (!result) return null;

  // Once resolved, intent is sticky — a single ambiguous turn shouldn't
  // erase established context back to UNCLEAR.
  const intent: LeadIntent =
    result.intent === "SEEKING" || result.intent === "OFFERING" ? result.intent : prior.intent !== "UNCLEAR" ? prior.intent : "UNCLEAR";

  return {
    reply: typeof result.reply === "string" && result.reply.trim() ? result.reply.trim() : "Thanks for your message — could you tell me a little more?",
    intent,
    requirementSlots: intent === "SEEKING" ? { ...prior.requirement, ...result.requirementSlots } : prior.requirement,
    propertySlots: intent === "OFFERING" ? { ...prior.property, ...result.propertySlots } : prior.property,
    handoffRequested: Boolean(result.handoffRequested),
    handoffReason: typeof result.handoffReason === "string" ? result.handoffReason : undefined,
    confused: Boolean(result.confused),
  };
}

// ---------------------------------------------------------------------------
// Minimum-viable thresholds — deliberately loose. Both created records land
// in the same "not yet verified/published" state every other AI-extracted
// record in this app already uses (Requirement.quality UNVERIFIED/status
// NEW, Property.listingStatus DRAFT) — the bar to create the row can stay
// low because nothing downstream treats it as final until a human reviews it.
// ---------------------------------------------------------------------------

export function isMinimumViableRequirement(slots: Partial<RequirementDraftFields> | undefined): boolean {
  if (!slots?.dealType || !slots?.category) return false;
  return Boolean((slots.locations && slots.locations.length > 0) || slots.budgetMin != null || slots.budgetMax != null);
}

export function isMinimumViableProperty(slots: Partial<PropertyDraftFields> | undefined, photoCount: number): boolean {
  if (photoCount < 1) return false;
  return Boolean(slots?.city || slots?.district || slots?.category || slots?.subtype);
}

// ---------------------------------------------------------------------------
// Materialization — turns accumulated slots into a real CRM record, no
// approval gate (per the confirmed plan decision). Mirrors the field
// mapping approveRequirementDraft/approvePropertyDraft already use
// (src/app/(platform)/ai-intake/actions.ts), kept as separate, independent
// logic rather than literally shared, since those two both start with
// requireUser() — unavailable in this unauthenticated webhook context — and
// this is a low-risk feature to build alongside already-tested code rather
// than inside it.
// ---------------------------------------------------------------------------

export async function ensureConversationContact(waId: string, profileName: string | undefined): Promise<string> {
  const conversation = await prisma.whatsAppConversation.findUnique({ where: { waId }, select: { contactId: true } });
  if (conversation?.contactId) return conversation.contactId;
  return findOrCreateContact(profileName, waId, "BUYER", null, { source: "WhatsApp AI Agent" });
}

async function materializeRequirement(contactId: string, slots: Partial<RequirementDraftFields>): Promise<string> {
  // Correct the Contact's type now that we actually know deal intent (it
  // was created as a generic BUYER placeholder the moment the conversation
  // started, before intent was known) — same BUYER/TENANT split
  // approveRequirementDraft already applies.
  if (slots.dealType === "RENT" || slots.dealType === "LEASE") {
    await prisma.contact.update({ where: { id: contactId }, data: { contactType: "TENANT" } }).catch(() => {});
  }

  const requirement = await prisma.requirement.create({
    data: {
      requirementRef: await nextRequirementRef(),
      type: slots.dealType === "RENT" ? "TENANT" : "BUYER",
      clientId: contactId,
      title: slots.title || `${slots.subtype ?? "Property"} requirement`,
      dealType: (slots.dealType ?? "BUY") as never,
      category: (slots.category ?? "RESIDENTIAL") as never,
      subtype: slots.subtype,
      preferredLocationsJson: slots.locations ?? [],
      sizeMin: slots.sizeMin,
      sizeMax: slots.sizeMax,
      budgetMin: slots.budgetMin,
      budgetMax: slots.budgetMax,
      urgency: slots.urgency ?? "MEDIUM",
      quality: "UNVERIFIED",
      status: "NEW",
      source: "WhatsApp AI Agent",
      lastContacted: new Date(),
    } as never,
  });

  await writeAudit({ userId: null, action: "WHATSAPP_AGENT_CREATE", entityType: "requirement", entityId: requirement.id, after: slots as never });
  await logActivity({ entityType: "requirement", requirementId: requirement.id, type: "AI_INTAKE", message: "Created automatically by the WhatsApp AI Agent from a live chat.", userId: null });

  return requirement.id;
}

async function materializeProperty(contactId: string, waId: string, slots: Partial<PropertyDraftFields>, mediaMessages: { mediaDriveFileId: string; mediaCaption: string | null }[]): Promise<string> {
  // Correct the Contact's type to OWNER — it was created as a generic BUYER
  // placeholder before intent resolved.
  await prisma.contact.update({ where: { id: contactId }, data: { contactType: "OWNER" } }).catch(() => {});

  const property = await prisma.property.create({
    data: {
      propertyRef: await nextPropertyRef(),
      title: slots.title || `${slots.subtype ?? "Property"} in ${slots.city ?? "location tbc"}`,
      description: slots.description,
      category: (slots.category ?? "RESIDENTIAL") as never,
      subtype: slots.subtype ?? "House",
      transactionType: (slots.transactionType ?? "SALE") as never,
      listingStatus: "DRAFT",
      exclusivity: "OPEN",
      source: "WhatsApp AI Agent",
      city: slots.city,
      district: slots.district ?? (slots.city ? districtForCity(slots.city) : undefined),
      sizeSqft: slots.sizeSqft,
      sizePerches: slots.sizePerches,
      sizeAcres: slots.sizeAcres,
      totalPrice: slots.totalPrice,
      monthlyRental: slots.monthlyRental,
      advertisedPrice: slots.totalPrice ?? slots.monthlyRental,
      currency: "LKR",
      ownerId: contactId,
      dateReceived: new Date(),
    } as never,
  });

  if (mediaMessages.length) {
    await prisma.$transaction(
      mediaMessages.map((m, i) =>
        prisma.propertyMedia.create({
          data: {
            propertyId: property.id,
            url: `/api/drive-media/${m.mediaDriveFileId}`,
            driveFileId: m.mediaDriveFileId,
            type: "PHOTO",
            caption: m.mediaCaption ?? undefined,
            isCover: i === 0,
            order: i,
          },
        }),
      ),
    );
  }

  await writeAudit({ userId: null, action: "WHATSAPP_AGENT_CREATE", entityType: "property", entityId: property.id, after: slots as never });
  await logActivity({ entityType: "property", propertyId: property.id, type: "AI_INTAKE", message: `Created automatically by the WhatsApp AI Agent from a live chat (${mediaMessages.length} photo${mediaMessages.length === 1 ? "" : "s"} attached).`, userId: null });

  return property.id;
}

// Called after every turn once the relevant MVR/MVP bar is passed. Each
// conversation materializes at most one Requirement and/or Property —
// WhatsAppConversation.requirementId/propertyId are @unique and checked
// before creating, so a re-triggered turn (e.g. slots pass the bar again on
// a later message) never creates a duplicate.
export async function maybeMaterializeLead(
  conversationId: string,
  waId: string,
  turn: AgentTurnResult,
): Promise<{ requirementId?: string; propertyId?: string }> {
  const conversation = await prisma.whatsAppConversation.findUniqueOrThrow({ where: { id: conversationId } });
  if (!conversation.contactId) return {};

  if (turn.intent === "SEEKING" && !conversation.requirementId && isMinimumViableRequirement(turn.requirementSlots)) {
    const requirementId = await materializeRequirement(conversation.contactId, turn.requirementSlots!);
    await prisma.whatsAppConversation.update({ where: { id: conversationId }, data: { requirementId } });
    return { requirementId };
  }

  if (turn.intent === "OFFERING" && !conversation.propertyId) {
    const mediaMessages = await prisma.whatsAppMessage.findMany({
      where: { conversationId, direction: "IN", mediaDriveFileId: { not: null } },
      orderBy: { createdAt: "asc" },
      select: { mediaDriveFileId: true, mediaCaption: true },
    });
    if (isMinimumViableProperty(turn.propertySlots, mediaMessages.length)) {
      const propertyId = await materializeProperty(conversation.contactId, waId, turn.propertySlots!, mediaMessages as { mediaDriveFileId: string; mediaCaption: string | null }[]);
      await prisma.whatsAppConversation.update({ where: { id: conversationId }, data: { propertyId } });
      return { propertyId };
    }
  }

  return {};
}
