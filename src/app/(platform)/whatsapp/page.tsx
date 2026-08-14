import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { SALES_TEAM_ROLES } from "@/lib/roles";
import { PageHeader, Badge, EmptyState, Tabs } from "@/components/ui";
import { ClickableRow } from "@/components/ClickableRow";
import { Pagination } from "@/components/Pagination";
import { paginationParams, totalPages as computeTotalPages } from "@/lib/pagination";
import { formatDateTime, titleCase } from "@/lib/format";
import type { Prisma } from "@/generated/prisma/client";

const INTENT_TONE: Record<string, string> = { SEEKING: "blue", OFFERING: "gold", UNCLEAR: "gray" };

export default async function WhatsAppLeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole(SALES_TEAM_ROLES);
  const sp = await searchParams;
  const status = sp.tab === "HANDED_OFF" || sp.tab === "CLOSED" ? sp.tab : "ACTIVE";

  const where: Prisma.WhatsAppConversationWhereInput = { status: status as never };
  const { page, skip, take } = paginationParams(sp);
  const [conversations, total, counts] = await Promise.all([
    prisma.whatsAppConversation.findMany({
      where,
      include: {
        contact: { select: { id: true, name: true } },
        requirement: { select: { id: true, requirementRef: true } },
        property: { select: { id: true, propertyRef: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { lastInboundAt: "desc" },
      skip,
      take,
    }),
    prisma.whatsAppConversation.count({ where }),
    prisma.whatsAppConversation.groupBy({ by: ["status"], _count: true }),
  ]);
  const pages = computeTotalPages(total);
  const countFor = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;

  return (
    <div>
      <PageHeader
        eyebrow={`WhatsApp AI Agent · ${total}`}
        title="Live WhatsApp leads"
        description="Every conversation the AI agent is handling — qualifying buyers/tenants, capturing owner listings with photos, and handing off to a human at the right moment."
      />

      <Tabs
        basePath="/whatsapp"
        active={status}
        tabs={[
          { key: "ACTIVE", label: `Active (${countFor("ACTIVE")})` },
          { key: "HANDED_OFF", label: `Handed off (${countFor("HANDED_OFF")})` },
          { key: "CLOSED", label: `Closed (${countFor("CLOSED")})` },
        ]}
      />

      {conversations.length === 0 ? (
        <EmptyState title="No conversations here yet" description="Once a lead messages your connected WhatsApp number, it shows up here immediately — before a Contact or Requirement necessarily exists." />
      ) : (
        <div className="ir-card overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/8 text-[0.7rem] uppercase tracking-wide text-black/40">
                <th className="px-4 py-3 font-medium">Lead</th>
                <th className="px-4 py-3 font-medium">Intent</th>
                <th className="px-4 py-3 font-medium">Last message</th>
                <th className="px-4 py-3 font-medium">Linked record</th>
                <th className="px-4 py-3 font-medium">Turns</th>
                <th className="px-4 py-3 font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((c) => {
                const slots = c.slotsJson as { intent?: string } | null;
                const intent = slots?.intent ?? "UNCLEAR";
                const lastMessage = c.messages[0];
                return (
                  <ClickableRow key={c.id} href={`/whatsapp/${c.id}`} className="border-b border-black/6 last:border-0 hover:bg-black/[0.015]">
                    <td className="px-4 py-3">
                      <Link href={`/whatsapp/${c.id}`} className="font-medium text-ir-navy hover:text-ir-gold-dark">{c.profileName || c.contact?.name || c.waId}</Link>
                      <div className="mt-0.5 text-[0.7rem] text-black/40">{c.waId}</div>
                    </td>
                    <td className="px-4 py-3"><Badge tone={(INTENT_TONE[intent] as never) ?? "gray"}>{titleCase(intent)}</Badge></td>
                    <td className="max-w-[280px] px-4 py-3 text-black/60">
                      <div className="truncate">{lastMessage ? `${lastMessage.direction === "IN" ? "" : "You: "}${lastMessage.text}` : "—"}</div>
                    </td>
                    <td className="px-4 py-3">
                      {c.requirement ? (
                        <Link href={`/requirements/${c.requirement.id}`} className="text-ir-gold-dark hover:underline">{c.requirement.requirementRef}</Link>
                      ) : c.property ? (
                        <Link href={`/properties/${c.property.id}`} className="text-ir-gold-dark hover:underline">{c.property.propertyRef}</Link>
                      ) : (
                        <span className="text-black/30">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-black/60">{c.turnCount}</td>
                    <td className="px-4 py-3 text-black/60">{formatDateTime(c.lastInboundAt ?? c.createdAt)}</td>
                  </ClickableRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={pages} total={total} basePath="/whatsapp" searchParams={sp} />
    </div>
  );
}
