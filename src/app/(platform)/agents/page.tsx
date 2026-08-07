import Link from "next/link";
import { Plus, UserPlus, Building2, ClipboardList, Kanban } from "lucide-react";
import { requireUser, canSeeConfidential } from "@/lib/auth";
import { getAgentRoster } from "@/lib/queries/agents";
import { PageHeader, Badge } from "@/components/ui";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { ClickableCard } from "@/components/ClickableCard";
import { ROLE_LABELS } from "@/lib/roles";
import { initials } from "@/lib/format";

const MANAGE_ROLES = ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER"];

export default async function AgentsPage() {
  const user = await requireUser();
  const showConfidential = canSeeConfidential(user);
  const { internal, external } = await getAgentRoster();
  const canManage = MANAGE_ROLES.includes(user.role);

  return (
    <div>
      <PageHeader
        eyebrow={`Agents · ${internal.length + external.length}`}
        title="The team"
        description="Internal agents and the external brokers we co-work deals with, one roster, every assignment and collaboration visible."
        actions={
          canManage ? (
            <div className="flex gap-2">
              <Link href="/contacts/new?type=BROKER" className="ir-btn ir-btn-ghost"><UserPlus size={15} /> Add external broker / agency</Link>
              <Link href="/agents/new" className="ir-btn ir-btn-primary"><Plus size={15} /> Add internal agent</Link>
            </div>
          ) : undefined
        }
      />

      <div className="mb-3 flex items-center gap-2.5">
        <h2 className="ir-label !text-ir-navy/70">Internal team</h2>
        <div className="h-px flex-1 bg-black/[0.06]" />
      </div>
      <div className="mb-9 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {internal.map((a) => {
          const collaborating = a._count.collaboratingProperties + a._count.collaboratingRequirements + a._count.collaboratingDeals;
          return (
            <Link key={a.id} href={`/agents/${a.id}`} className="ir-card ir-card-hover flex flex-col p-5">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-ir-gold/30 bg-ir-navy text-xs font-semibold text-ir-gold">
                  {initials(a.name)}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ir-navy">{a.name}</div>
                  <div className="truncate text-xs text-black/45">{a.title || ROLE_LABELS[a.role]}</div>
                </div>
                {!a.active && <Badge tone="gray">Inactive</Badge>}
              </div>
              <div className="mt-auto grid grid-cols-3 gap-2 border-t border-black/[0.06] pt-3 text-center">
                <Stat icon={Building2} value={a._count.assignedProperties} label="Properties" />
                <Stat icon={ClipboardList} value={a._count.assignedRequirements} label="Reqs" />
                <Stat icon={Kanban} value={a._count.assignedDeals} label="Deals" />
              </div>
              {collaborating > 0 && (
                <div className="mt-2.5 text-center text-[0.7rem] text-black/40">
                  + collaborating on <span className="text-ir-gold-dark font-medium">{collaborating}</span> more
                </div>
              )}
            </Link>
          );
        })}
      </div>

      <div className="mb-3 flex items-center gap-2.5">
        <h2 className="ir-label !text-ir-navy/70">External partners</h2>
        <div className="h-px flex-1 bg-black/[0.06]" />
      </div>
      {external.length === 0 ? (
        <p className="text-xs text-black/40">
          No external brokers or agencies on file yet
          {canManage && (
            <>
              {", "}
              <Link href="/contacts/new?type=BROKER" className="font-medium text-ir-gold-dark hover:underline">add one</Link>.
            </>
          )}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {external.map((c) => (
            <ClickableCard key={c.id} href={`/contacts/${c.id}`} className="ir-card ir-card-hover flex flex-col p-5">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-black/10 bg-ir-ivory-deep text-xs font-semibold text-ir-navy">
                  {initials(`${c.name}`)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ir-navy">{c.name}</div>
                  <div className="truncate text-xs text-black/45">{c.companyName || "External broker"}</div>
                </div>
                {showConfidential && <WhatsAppButton phone={c.phone} variant="icon" />}
              </div>
              <div className="mt-auto border-t border-black/[0.06] pt-3 text-center">
                <div className="ir-figure text-lg text-ir-navy">{c._count.dealsAsBroker}</div>
                <div className="ir-label !text-[0.6rem]">Co-brokered deals</div>
              </div>
            </ClickableCard>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, value, label }: { icon: typeof Building2; value: number; label: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-center gap-1 text-black/30">
        <Icon size={11} />
      </div>
      <div className="ir-figure text-base text-ir-navy">{value}</div>
      <div className="text-[0.6rem] uppercase tracking-wide text-black/35">{label}</div>
    </div>
  );
}
