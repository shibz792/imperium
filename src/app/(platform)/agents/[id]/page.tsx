import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { requireUser, canSeeFinance } from "@/lib/auth";
import { getAgentProfile } from "@/lib/queries/agents";
import { Badge, SectionCard, EmptyState, StatTile } from "@/components/ui";
import { LISTING_STATUS_TONE, REQUIREMENT_STATUS_TONE, DEAL_STAGE_TONE } from "@/lib/badges";
import { formatCurrency, titleCase, initials } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/roles";

const MANAGE_ROLES = ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER"];

export default async function AgentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireUser();
  const { user: agent, closedDeals, commissionEarned, openDeals } = await getAgentProfile(id);
  if (!agent) notFound();

  const territory = Array.isArray(agent.territoryJson) ? (agent.territoryJson as string[]) : [];
  const canManage = MANAGE_ROLES.includes(viewer.role);
  const showFinance = canSeeFinance(viewer);

  const collabProperties = agent.collaboratingProperties;
  const collabRequirements = agent.collaboratingRequirements;
  const collabDeals = agent.collaboratingDeals;

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-ir-gold/30 bg-ir-navy text-lg font-semibold text-ir-gold">
            {initials(agent.name)}
          </div>
          <div>
            <div className="ir-label mb-1">{ROLE_LABELS[agent.role]}</div>
            <h1 className="ir-editorial text-[2rem] leading-tight text-ir-navy">{agent.name}</h1>
            {agent.title && <p className="text-sm text-black/50">{agent.title}</p>}
          </div>
        </div>
        {canManage && (
          <Link href={`/agents/${id}/edit`} className="ir-btn ir-btn-ghost">
            <Pencil size={14} /> Edit profile
          </Link>
        )}
      </div>

      {(agent.bio || territory.length > 0) && (
        <div className="ir-card mb-6 p-5">
          {agent.bio && <p className="mb-3 text-sm leading-relaxed text-black/65">{agent.bio}</p>}
          {territory.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {territory.map((t) => <Badge key={t} tone="navy">{t}</Badge>)}
            </div>
          )}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Open deals" value={openDeals} />
        <StatTile label="Closed won" value={closedDeals} tone="good" />
        <StatTile label="Properties assigned" value={agent.assignedProperties.length} />
        {showFinance ? <StatTile label="Commission earned" value={formatCurrency(commissionEarned)} tone="gold" /> : <StatTile label="Requirements assigned" value={agent.assignedRequirements.length} />}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard title={`Assigned properties (${agent.assignedProperties.length})`}>
          {agent.assignedProperties.length === 0 ? (
            <EmptyState title="None assigned" />
          ) : (
            <ul className="space-y-2.5">
              {agent.assignedProperties.slice(0, 8).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 border-b border-black/6 pb-2.5 last:border-0">
                  <Link href={`/properties/${p.id}`} className="truncate text-sm text-ir-navy hover:text-ir-gold-dark">{p.title}</Link>
                  <Badge tone={(LISTING_STATUS_TONE[p.listingStatus] as never) ?? "gray"}>{titleCase(p.listingStatus)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title={`Assigned requirements (${agent.assignedRequirements.length})`}>
          {agent.assignedRequirements.length === 0 ? (
            <EmptyState title="None assigned" />
          ) : (
            <ul className="space-y-2.5">
              {agent.assignedRequirements.slice(0, 8).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 border-b border-black/6 pb-2.5 last:border-0">
                  <Link href={`/requirements/${r.id}`} className="truncate text-sm text-ir-navy hover:text-ir-gold-dark">{r.title}</Link>
                  <Badge tone={(REQUIREMENT_STATUS_TONE[r.status] as never) ?? "gray"}>{titleCase(r.status)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title={`Assigned deals (${agent.assignedDeals.length})`}>
          {agent.assignedDeals.length === 0 ? (
            <EmptyState title="None assigned" />
          ) : (
            <ul className="space-y-2.5">
              {agent.assignedDeals.slice(0, 8).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 border-b border-black/6 pb-2.5 last:border-0">
                  <Link href={`/deals/${d.id}`} className="truncate text-sm text-ir-navy hover:text-ir-gold-dark">{d.property.title}</Link>
                  <Badge tone={(DEAL_STAGE_TONE[d.stage] as never) ?? "gray"}>{titleCase(d.stage)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title={`Collaborating on (${collabProperties.length + collabRequirements.length + collabDeals.length})`}>
          {collabProperties.length + collabRequirements.length + collabDeals.length === 0 ? (
            <EmptyState title="Not co-working any records" description="Add this agent as a collaborator from any property, requirement or deal." />
          ) : (
            <ul className="space-y-2.5">
              {collabProperties.slice(0, 4).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 border-b border-black/6 pb-2.5 last:border-0">
                  <Link href={`/properties/${p.id}`} className="truncate text-sm text-ir-navy hover:text-ir-gold-dark">{p.title}</Link>
                  <Badge tone="navy">Property</Badge>
                </li>
              ))}
              {collabRequirements.slice(0, 4).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 border-b border-black/6 pb-2.5 last:border-0">
                  <Link href={`/requirements/${r.id}`} className="truncate text-sm text-ir-navy hover:text-ir-gold-dark">{r.title}</Link>
                  <Badge tone="gold">Requirement</Badge>
                </li>
              ))}
              {collabDeals.slice(0, 4).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 border-b border-black/6 pb-2.5 last:border-0">
                  <Link href={`/deals/${d.id}`} className="truncate text-sm text-ir-navy hover:text-ir-gold-dark">{d.property.title}</Link>
                  <Badge tone="blue">Deal</Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
