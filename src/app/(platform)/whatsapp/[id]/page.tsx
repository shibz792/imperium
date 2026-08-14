import Link from "next/link";
import { notFound } from "next/navigation";
import { Megaphone } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { SALES_TEAM_ROLES } from "@/lib/roles";
import { PageHeader, Badge, EmptyState, SectionCard } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { formatDateTime, titleCase } from "@/lib/format";
import { sendManualMessage, resumeBot } from "../actions";

const STATUS_TONE: Record<string, string> = { ACTIVE: "green", HANDED_OFF: "amber", CLOSED: "gray" };
const INTENT_TONE: Record<string, string> = { SEEKING: "blue", OFFERING: "gold", UNCLEAR: "gray" };

export default async function WhatsAppConversationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sendError?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  await requireRole(SALES_TEAM_ROLES);

  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { id },
    include: {
      contact: { select: { id: true, name: true } },
      requirement: { select: { id: true, requirementRef: true, title: true } },
      property: { select: { id: true, propertyRef: true, title: true } },
      assignedAgent: { select: { name: true } },
      messages: { orderBy: { createdAt: "asc" }, include: { authorUser: { select: { name: true } } } },
    },
  });
  if (!conversation) notFound();

  const slots = (conversation.slotsJson as { intent?: string; requirement?: Record<string, unknown>; property?: Record<string, unknown> } | null) ?? {};
  const intent = slots.intent ?? "UNCLEAR";
  const referral = conversation.referralJson as { headline?: string; source_url?: string; source_type?: string } | null;
  const slotFields = intent === "OFFERING" ? slots.property : slots.requirement;

  return (
    <div>
      {sp.sendError && (
        <div className="mb-5 flex items-center gap-2 rounded border border-[#8c4a3e4d] bg-[color:var(--color-brick-tint)] px-4 py-2.5 text-sm text-[color:var(--color-brick)]">
          Message not sent: {sp.sendError}
        </div>
      )}

      <PageHeader
        eyebrow={`${conversation.waId} · ${conversation.messages.length} message${conversation.messages.length === 1 ? "" : "s"}`}
        title={conversation.profileName || conversation.contact?.name || "WhatsApp lead"}
        actions={
          <>
            <Badge tone={(STATUS_TONE[conversation.status] as never) ?? "gray"}>{titleCase(conversation.status)}</Badge>
            <Badge tone={(INTENT_TONE[intent] as never) ?? "gray"}>{titleCase(intent)}</Badge>
            {conversation.contact && <Link href={`/contacts/${conversation.contact.id}`} className="ir-btn ir-btn-ghost">View contact</Link>}
            {conversation.status === "HANDED_OFF" && (
              <form action={resumeBot.bind(null, conversation.id)}>
                <SubmitButton className="ir-btn ir-btn-ghost" pendingText="Resuming…">Resume bot</SubmitButton>
              </form>
            )}
          </>
        }
      />

      {referral && (
        <div className="mb-5 flex items-start gap-2.5 rounded border border-[#a97f5659] bg-[color:var(--color-bronze-tint)] px-4 py-2.5 text-sm text-[color:var(--color-bronze)]">
          <Megaphone size={15} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">Came from a Meta ad{referral.headline ? `: "${referral.headline}"` : ""}</div>
            {referral.source_url && <div className="mt-0.5 truncate text-xs opacity-80">{referral.source_url}</div>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <SectionCard title="Transcript">
          <div className="max-h-[60vh] space-y-3 overflow-y-auto">
            {conversation.messages.length === 0 ? (
              <EmptyState title="No messages yet" />
            ) : (
              conversation.messages.map((m) => (
                <div key={m.id} className={`flex ${m.direction === "IN" ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${m.direction === "IN" ? "bg-black/[0.04] text-ir-navy" : "bg-ir-navy text-white"}`}>
                    {m.mediaDriveFileId && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/drive-media/${m.mediaDriveFileId}?w=400`} alt={m.mediaCaption ?? "Photo received"} className="mb-1.5 max-h-64 rounded object-cover" />
                    )}
                    <div className="whitespace-pre-wrap">{m.text}</div>
                    <div className={`mt-1 text-[0.65rem] ${m.direction === "IN" ? "text-black/35" : "text-white/60"}`}>
                      {m.authorUserId ? `${m.authorUser?.name ?? "Agent"} · ` : m.direction === "OUT" ? "Bot · " : ""}
                      {formatDateTime(m.createdAt)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <form action={sendManualMessage.bind(null, conversation.id)} className="mt-4 flex items-end gap-2.5 border-t border-black/8 pt-4">
            <div className="min-w-0 flex-1">
              <label className="ir-label mb-1 block">Send a message{conversation.status === "ACTIVE" ? " (takes over from the bot)" : ""}</label>
              <input name="message" placeholder="Type a message…" className="ir-input" autoComplete="off" />
            </div>
            <SubmitButton className="ir-btn ir-btn-gold" pendingText="Sending…">Send</SubmitButton>
          </form>
        </SectionCard>

        <div className="space-y-5">
          <SectionCard title="Captured so far">
            {!slotFields || Object.keys(slotFields).length === 0 ? (
              <p className="text-xs text-black/40">Nothing captured yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(slotFields)
                  .filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0))
                  .map(([k, v]) => (
                    <Badge key={k} tone="navy">
                      {titleCase(k)}: {Array.isArray(v) ? v.join(", ") : String(v)}
                    </Badge>
                  ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Linked record">
            {conversation.requirement ? (
              <Link href={`/requirements/${conversation.requirement.id}`} className="text-sm text-ir-gold-dark hover:underline">
                {conversation.requirement.requirementRef} — {conversation.requirement.title}
              </Link>
            ) : conversation.property ? (
              <Link href={`/properties/${conversation.property.id}`} className="text-sm text-ir-gold-dark hover:underline">
                {conversation.property.propertyRef} — {conversation.property.title}
              </Link>
            ) : (
              <p className="text-xs text-black/40">Nothing created yet — still gathering enough to qualify this lead.</p>
            )}
          </SectionCard>

          <SectionCard title="Status">
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between"><dt className="text-black/40">Assigned agent</dt><dd className="text-ir-navy">{conversation.assignedAgent?.name ?? "Unassigned"}</dd></div>
              <div className="flex justify-between"><dt className="text-black/40">Turns</dt><dd className="text-ir-navy">{conversation.turnCount}</dd></div>
              <div className="flex justify-between"><dt className="text-black/40">Last inbound</dt><dd className="text-ir-navy">{formatDateTime(conversation.lastInboundAt)}</dd></div>
              <div className="flex justify-between"><dt className="text-black/40">Handed off</dt><dd className="text-ir-navy">{conversation.handedOffAt ? formatDateTime(conversation.handedOffAt) : "—"}</dd></div>
            </dl>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
