import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Trash2, ShieldAlert, X } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole, canSeeConfidential, isAdmin } from "@/lib/auth";
import { SALES_TEAM_ROLES } from "@/lib/roles";
import { Badge, Field, PageHeader, SectionCard, EmptyState } from "@/components/ui";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { SubmitButton } from "@/components/SubmitButton";
import { LISTING_STATUS_TONE, REQUIREMENT_STATUS_TONE, DEAL_STAGE_TONE } from "@/lib/badges";
import { formatCurrency, formatDate, formatDateTime, titleCase } from "@/lib/format";
import { deleteContact, logContactInteraction, addContactAgentExclusion, removeContactAgentExclusion } from "../actions";

export default async function ContactDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ deleteError?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireRole(SALES_TEAM_ROLES);
  const showConfidential = canSeeConfidential(user);

  const [contact, agents] = await Promise.all([
    prisma.contact.findUnique({
      where: { id },
      include: {
        assignedAgent: true,
        ownedProperties: true,
        requirements: true,
        dealsAsClient: { include: { property: true } },
        dealsAsBroker: { include: { property: true, client: true } },
        activities: { include: { user: true }, orderBy: { createdAt: "desc" } },
        agentExclusions: { include: { agent: true }, orderBy: { createdAt: "desc" } },
        whatsappConversations: { select: { id: true }, take: 1 },
      },
    }),
    prisma.user.findMany({ where: { role: { in: ["AGENT", "SALES_MANAGER", "DIRECTOR", "SUPER_ADMIN"] }, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!contact) notFound();
  const isBroker = contact.contactType === "BROKER";
  const canManageExclusions = isAdmin(user) || contact.assignedAgentId === user.id;
  const currentUserExcluded = contact.agentExclusions.some((e) => e.agentId === user.id);
  const excludableAgents = agents.filter((a) => !contact.agentExclusions.some((e) => e.agentId === a.id));

  return (
    <div>
      {sp.deleteError && (
        <div className="mb-5 flex items-center gap-2 rounded border border-[#92601f4d] bg-[color:var(--color-bronze-tint)] px-4 py-2.5 text-sm text-[color:var(--color-bronze)]">
          {sp.deleteError}
        </div>
      )}
      {currentUserExcluded && (
        <div className="mb-5 flex items-center gap-2 rounded border border-[#8c4a3e4d] bg-[color:var(--color-brick-tint)] px-4 py-2.5 text-sm text-[color:var(--color-brick)]">
          <ShieldAlert size={15} className="shrink-0" /> This contact has indicated they don&apos;t work with you.
        </div>
      )}

      <PageHeader
        eyebrow={`${contact.contactRef} · ${titleCase(contact.contactType)}`}
        title={`${contact.name}`}
        description={contact.companyName}
        actions={
          <>
            {isBroker && <Link href="/agents" className="ir-btn ir-btn-ghost">View Agents roster</Link>}
            {contact.whatsappConversations[0] && (
              <Link href={`/whatsapp/${contact.whatsappConversations[0].id}`} className="ir-btn ir-btn-ghost">View WhatsApp conversation →</Link>
            )}
            <Link href={`/contacts/${id}/edit`} className="ir-btn ir-btn-ghost"><Pencil size={14} /> Edit</Link>
            {showConfidential && <WhatsAppButton phone={contact.phone} message={`Hi ${contact.name.split(" ")[0]}, `} />}
            {isAdmin(user) && (
              <form action={deleteContact.bind(null, id)}>
                <ConfirmSubmitButton
                  confirmMessage={`Permanently delete ${contact.name}? This can't be undone, and only works if nothing else references them.`}
                  className="ir-btn ir-btn-danger"
                >
                  <Trash2 size={14} /> Delete
                </ConfirmSubmitButton>
              </form>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <SectionCard title="Contact details">
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Phone"
              value={
                showConfidential ? (
                  <span className="flex items-center gap-1.5">
                    {contact.phone}
                    <WhatsAppButton phone={contact.phone} variant="icon" />
                  </span>
                ) : (
                  "Restricted"
                )
              }
            />
            <Field label="WhatsApp" value={showConfidential ? contact.whatsapp : "Restricted"} />
            <Field label="Email" value={showConfidential ? contact.email : "Restricted"} />
            <Field label="City" value={contact.city} />
            <Field label="District" value={contact.district} />
            <Field label="Source" value={contact.source} />
            <Field label="Assigned agent" value={contact.assignedAgent?.name} />
            <Field label="Added" value={formatDate(contact.createdAt)} />
          </div>
          {contact.notes && (
            <div className="mt-4 border-t border-black/6 pt-4">
              <div className="ir-label mb-1.5">Notes</div>
              <p className="text-sm text-black/70">{contact.notes}</p>
            </div>
          )}
          {showConfidential && contact.confidentialNotes && (
            <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <span className="font-semibold">Confidential: </span>{contact.confidentialNotes}
            </div>
          )}
        </SectionCard>

        <SectionCard title={`Properties owned (${contact.ownedProperties.length})`}>
          {contact.ownedProperties.length === 0 ? (
            <EmptyState title="No properties linked" />
          ) : (
            <ul className="space-y-2.5">
              {contact.ownedProperties.map((p) => (
                <li key={p.id} className="border-b border-black/6 pb-2.5 last:border-0">
                  <Link href={`/properties/${p.id}`} className="flex items-center justify-between gap-2 text-sm text-ir-navy hover:text-ir-gold-dark">
                    <span className="truncate">{p.title}</span>
                    <Badge tone={(LISTING_STATUS_TONE[p.listingStatus] as never) ?? "gray"}>{titleCase(p.listingStatus)}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title={`Requirements (${contact.requirements.length})`}>
          {contact.requirements.length === 0 ? (
            <EmptyState title="No requirements linked" />
          ) : (
            <ul className="space-y-2.5">
              {contact.requirements.map((r) => (
                <li key={r.id} className="border-b border-black/6 pb-2.5 last:border-0">
                  <Link href={`/requirements/${r.id}`} className="flex items-center justify-between gap-2 text-sm text-ir-navy hover:text-ir-gold-dark">
                    <span className="truncate">{r.title}</span>
                    <Badge tone={(REQUIREMENT_STATUS_TONE[r.status] as never) ?? "gray"}>{titleCase(r.status)}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title={`Deals (${contact.dealsAsClient.length})`}>
        {contact.dealsAsClient.length === 0 ? (
          <EmptyState title="No deals yet" />
        ) : (
          <ul className="divide-y divide-black/6">
            {contact.dealsAsClient.map((d) => (
              <li key={d.id}>
                <Link href={`/deals/${d.id}`} className="flex items-center justify-between py-2.5 hover:text-ir-gold-dark">
                  <div>
                    <span className="text-sm text-ir-navy">{d.property.title}</span>
                    <span className="ml-2 text-xs text-black/40">{formatCurrency(d.expectedValue)}</span>
                  </div>
                  <Badge tone={(DEAL_STAGE_TONE[d.stage] as never) ?? "gray"}>{titleCase(d.stage)}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {isBroker && (
        <div className="mt-5">
          <SectionCard title={`Co-brokered deals (${contact.dealsAsBroker.length})`}>
            {contact.dealsAsBroker.length === 0 ? (
              <EmptyState title="No deals co-brokered yet" description="This partner will appear here when added as the other broker on a deal." />
            ) : (
              <ul className="divide-y divide-black/6">
                {contact.dealsAsBroker.map((d) => (
                  <li key={d.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <Link href={`/deals/${d.id}`} className="text-sm text-ir-navy hover:text-ir-gold-dark">{d.property.title}</Link>
                      <span className="ml-2 text-xs text-black/40">{d.client.name} · {formatCurrency(d.expectedValue)}</span>
                    </div>
                    <Badge tone={(DEAL_STAGE_TONE[d.stage] as never) ?? "gray"}>{titleCase(d.stage)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <SectionCard title={`Doesn't work with (${contact.agentExclusions.length})`}>
          {contact.agentExclusions.length === 0 ? (
            <p className="text-xs text-black/40">No conflicts flagged.</p>
          ) : (
            <ul className="mb-3 space-y-2">
              {contact.agentExclusions.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 rounded border border-black/8 px-2.5 py-1.5 text-xs">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ir-navy">{e.agent.name}</div>
                    {e.reason && <div className="truncate text-black/40">{e.reason}</div>}
                  </div>
                  {canManageExclusions && (
                    <form action={removeContactAgentExclusion.bind(null, contact.id, e.agentId)}>
                      <button type="submit" title="Remove" className="flex h-5 w-5 items-center justify-center rounded text-black/25 hover:bg-black/[0.05] hover:text-[color:var(--color-brick)]">
                        <X size={12} />
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canManageExclusions && excludableAgents.length > 0 && (
            <form action={addContactAgentExclusion.bind(null, contact.id)} className="border-t border-black/6 pt-3">
              <ExclusionForm agents={excludableAgents} />
            </form>
          )}
        </SectionCard>

        <div className="lg:col-span-2">
          <SectionCard title="Activity & interactions">
            <form action={logContactInteraction.bind(null, contact.id)} className="mb-4 flex flex-wrap items-end gap-2.5 border-b border-black/6 pb-4">
              <div>
                <label className="ir-label mb-1 block">Type</label>
                <select name="type" defaultValue="CALL" className="ir-select !text-xs">
                  {["CALL", "WHATSAPP", "EMAIL", "MEETING", "OTHER"].map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
                </select>
              </div>
              <div className="min-w-[220px] flex-1">
                <label className="ir-label mb-1 block">Log an interaction</label>
                <input name="message" placeholder="Called about the listing, agreed to follow up next week…" className="ir-input !text-xs" />
              </div>
              <SubmitButton className="ir-btn ir-btn-gold !py-1.5 !text-xs">Log</SubmitButton>
            </form>

            {contact.activities.length === 0 ? (
              <EmptyState title="No activity recorded" />
            ) : (
              <ul className="space-y-3">
                {contact.activities.map((a) => (
                  <li key={a.id} className="border-b border-black/6 pb-3 text-sm last:border-0">
                    <div className="flex items-center gap-2">
                      <Badge tone="gray">{titleCase(a.type)}</Badge>
                      <span className="text-ir-navy">{a.message}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-black/40">{a.user?.name ?? "System"} · {formatDateTime(a.createdAt)}</div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function ExclusionForm({ agents }: { agents: { id: string; name: string }[] }) {
  return (
    <div className="flex flex-wrap items-end gap-2.5">
      <div>
        <label className="ir-label mb-1 block">Agent</label>
        <select name="agentId" className="ir-select !text-xs">
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <div className="min-w-[160px] flex-1">
        <label className="ir-label mb-1 block">Reason (optional)</label>
        <input name="reason" placeholder="Past dispute, personal conflict…" className="ir-input !text-xs" />
      </div>
      <SubmitButton className="ir-btn ir-btn-ghost !py-1.5 !text-xs text-[color:var(--color-brick)]">Flag conflict</SubmitButton>
    </div>
  );
}
