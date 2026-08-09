import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole, canSeeConfidential } from "@/lib/auth";
import { SALES_TEAM_ROLES } from "@/lib/roles";
import { Badge, Field, PageHeader, SectionCard, EmptyState } from "@/components/ui";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { LISTING_STATUS_TONE, REQUIREMENT_STATUS_TONE, DEAL_STAGE_TONE } from "@/lib/badges";
import { formatCurrency, formatDate, titleCase } from "@/lib/format";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole(SALES_TEAM_ROLES);
  const showConfidential = canSeeConfidential(user);

  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      assignedAgent: true,
      ownedProperties: true,
      requirements: true,
      dealsAsClient: { include: { property: true } },
      dealsAsBroker: { include: { property: true, client: true } },
    },
  });
  if (!contact) notFound();
  const isBroker = contact.contactType === "BROKER";

  return (
    <div>
      <PageHeader
        eyebrow={`${contact.contactRef} · ${titleCase(contact.contactType)}`}
        title={`${contact.name}`}
        description={contact.companyName}
        actions={
          <>
            {isBroker && <Link href="/agents" className="ir-btn ir-btn-ghost">View Agents roster</Link>}
            <Link href={`/contacts/${id}/edit`} className="ir-btn ir-btn-ghost"><Pencil size={14} /> Edit</Link>
            {showConfidential && <WhatsAppButton phone={contact.phone} message={`Hi ${contact.name.split(" ")[0]}, `} />}
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
    </div>
  );
}
