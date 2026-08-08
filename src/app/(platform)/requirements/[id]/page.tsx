import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, RefreshCcw, Trash2, CheckCircle2, Circle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser, canSeeConfidential } from "@/lib/auth";
import { Badge, Field, PageHeader, SectionCard, Tabs, EmptyState } from "@/components/ui";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { CopyableMessage } from "@/components/CopyableMessage";
import { whatsAppMessageForRequirement } from "@/lib/property";
import { REQUIREMENT_STATUS_TONE, URGENCY_TONE, DEAL_STAGE_TONE } from "@/lib/badges";
import { formatCurrency, formatDate, formatDateTime, titleCase, daysAgo } from "@/lib/format";
import { scoreMatch, explainMatch } from "@/lib/match";
import { reconfirmRequirement, changeRequirementStatus } from "../actions";
import { createTask, setTaskStatus, deleteTask } from "../../tasks/actions";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "matches", label: "Matches" },
  { key: "deals", label: "Deals" },
  { key: "tasks", label: "Tasks" },
  { key: "activity", label: "Activity" },
];

export default async function RequirementDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab = "overview" } = await searchParams;
  const user = await requireUser();
  const showConfidential = canSeeConfidential(user);

  const requirement = await prisma.requirement.findUnique({
    where: { id },
    include: {
      client: true,
      assignedAgent: true,
      collaborators: true,
      deals: { include: { property: true } },
      activities: { include: { user: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!requirement) notFound();

  const [tasks, activeUsers] = await Promise.all([
    prisma.task.findMany({
      where: { relatedEntityType: "requirement", relatedEntityId: id },
      include: { assignedTo: true },
      orderBy: { dueAt: "asc" },
    }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const locations = Array.isArray(requirement.preferredLocationsJson) ? (requirement.preferredLocationsJson as string[]) : [];
  const surrounding = Array.isArray(requirement.acceptableSurroundingJson) ? (requirement.acceptableSurroundingJson as string[]) : [];
  const features = (requirement.requiredFeaturesJson as Record<string, boolean>) ?? {};
  const basePath = `/requirements/${id}`;
  const needsReconfirm = requirement.lastContacted ? daysAgo(requirement.lastContacted)! > 14 : true;

  let matches: { property: Awaited<ReturnType<typeof prisma.property.findMany>>[number]; result: NonNullable<ReturnType<typeof scoreMatch>> }[] = [];
  if (tab === "matches" || tab === "overview") {
    const properties = await prisma.property.findMany({ where: { listingStatus: "ACTIVE" } });
    matches = properties
      .map((p) => {
        const result = scoreMatch(p, requirement);
        return result ? { property: p, result } : null;
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .sort((a, b) => b.result.score - a.result.score);
  }

  return (
    <div>
      <PageHeader
        eyebrow={`${requirement.requirementRef} · ${titleCase(requirement.type)}`}
        title={requirement.title}
        description={`${requirement.client.name}${requirement.companyName ? ` · ${requirement.companyName}` : ""}`}
        actions={
          <>
            <Link href={`/requirements/${id}/edit`} className="ir-btn ir-btn-ghost"><Pencil size={14} /> Edit</Link>
            <form action={reconfirmRequirement.bind(null, id)}>
              <button type="submit" className="ir-btn ir-btn-gold"><RefreshCcw size={14} /> Reconfirm active</button>
            </form>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge tone={(REQUIREMENT_STATUS_TONE[requirement.status] as never) ?? "gray"}>{titleCase(requirement.status)}</Badge>
        <Badge tone={(URGENCY_TONE[requirement.urgency] as never) ?? "gray"}>{titleCase(requirement.urgency)} urgency</Badge>
        <Badge tone={requirement.quality === "PREMIUM" ? "gold" : "gray"}>{titleCase(requirement.quality)}</Badge>
        {needsReconfirm && <Badge tone="red">Needs reconfirmation</Badge>}
        <span className="ml-auto text-xs text-black/45">Last contacted: {formatDate(requirement.lastContacted)}</span>
        <form action={async (fd: FormData) => { "use server"; await changeRequirementStatus(id, String(fd.get("status"))); }} className="flex items-center gap-1.5">
          <select name="status" defaultValue={requirement.status} className="ir-select !py-1 !text-xs">
            {["NEW", "UNVERIFIED", "QUALIFIED", "ACTIVELY_SEARCHING", "OPTIONS_SHARED", "VIEWING_ARRANGED", "NEGOTIATING", "ON_HOLD", "COMPLETED", "LOST_EXPIRED"].map((s) => (
              <option key={s} value={s}>{titleCase(s)}</option>
            ))}
          </select>
          <button type="submit" className="ir-btn ir-btn-ghost !py-1 !text-xs">Update</button>
        </form>
      </div>

      <Tabs tabs={TABS} active={tab} basePath={basePath} />

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <SectionCard title="Requirement">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label="Deal type" value={titleCase(requirement.dealType)} />
              <Field label="Category" value={titleCase(requirement.category)} />
              <Field label="Subtype" value={requirement.subtype} />
              <Field label="Budget" value={requirement.budgetMax ? `up to ${formatCurrency(requirement.budgetMax)}` : requirement.budgetMin ? `from ${formatCurrency(requirement.budgetMin)}` : "Not confirmed"} />
              <Field label="Size range" value={requirement.sizeMin || requirement.sizeMax ? `${requirement.sizeMin ?? "?"} to ${requirement.sizeMax ?? "?"} sqft` : undefined} />
              <Field label="Financing" value={titleCase(requirement.financingStatus)} />
              <Field label="Decision stage" value={requirement.decisionStage} />
              <Field label="Deadline" value={formatDate(requirement.deadline)} />
              <Field label="Expiry" value={formatDate(requirement.expiryDate)} />
              <Field label="Assigned agent" value={requirement.assignedAgent?.name} />
              <Field label="Source" value={requirement.source} />
              <Field label="Next action" value={requirement.nextAction ? `${requirement.nextAction} (${formatDate(requirement.nextActionDate)})` : undefined} />
            </div>
            {requirement.collaborators.length > 0 && (
              <div className="mt-4 border-t border-black/6 pt-4">
                <div className="ir-label mb-1.5">Collaborating agents</div>
                <div className="flex flex-wrap gap-1.5">
                  {requirement.collaborators.map((c) => (
                    <Link key={c.id} href={`/agents/${c.id}`}>
                      <Badge tone="navy">{c.name}</Badge>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-4 border-t border-black/6 pt-4">
              <div className="ir-label mb-1.5">Preferred locations</div>
              <div className="flex flex-wrap gap-1.5">
                {locations.length === 0 ? <span className="text-xs text-black/40">No strict constraint</span> : locations.map((l) => <Badge key={l} tone="navy">{l}</Badge>)}
              </div>
            </div>
            {surrounding.length > 0 && (
              <div className="mt-3">
                <div className="ir-label mb-1.5">Acceptable surrounding areas</div>
                <div className="flex flex-wrap gap-1.5">{surrounding.map((l) => <Badge key={l} tone="gray">{l}</Badge>)}</div>
              </div>
            )}
            {Object.keys(features).length > 0 && (
              <div className="mt-3">
                <div className="ir-label mb-1.5">Required features</div>
                <div className="flex flex-wrap gap-1.5">{Object.keys(features).map((f) => <Badge key={f} tone="gold">{titleCase(f)}</Badge>)}</div>
              </div>
            )}
            {requirement.intendedUse && (
              <div className="mt-4 border-t border-black/6 pt-4">
                <div className="ir-label mb-1.5">Intended use</div>
                <p className="text-sm text-black/70">{requirement.intendedUse}</p>
              </div>
            )}
            {showConfidential && requirement.confidentialNotes && (
              <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <span className="font-semibold">Confidential notes: </span>{requirement.confidentialNotes}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Client">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Name" value={`${requirement.client.name}`} />
              <Field
                label="Phone"
                value={
                  showConfidential ? (
                    <span className="flex items-center gap-1.5">
                      {requirement.client.phone}
                      <WhatsAppButton phone={requirement.client.phone} variant="icon" />
                    </span>
                  ) : (
                    "Restricted"
                  )
                }
              />
              <Field label="Company" value={requirement.companyName} />
              <Field label="Decision maker" value={requirement.decisionMaker} />
            </div>
            <Link href={`/contacts/${requirement.client.id}`} className="mt-3 inline-block text-xs font-medium text-ir-gold-dark hover:underline">View full contact record →</Link>
          </SectionCard>

          <SectionCard title="Top matches">
            {matches.length === 0 ? (
              <p className="text-xs text-black/40">No qualifying active properties right now.</p>
            ) : (
              <ul className="space-y-3">
                {matches.slice(0, 4).map((m) => (
                  <li key={m.property.id} className="border-b border-black/6 pb-3 last:border-0">
                    <Link href={`/properties/${m.property.id}`} className="text-[0.8125rem] font-medium text-ir-navy hover:text-ir-gold-dark">{m.property.title}</Link>
                    <p className="mt-0.5 text-[0.7rem] text-black/50">{explainMatch(m.result)}</p>
                  </li>
                ))}
              </ul>
            )}
            <Link href={`${basePath}?tab=matches`} className="mt-2 inline-block text-xs font-medium text-ir-gold-dark hover:underline">View all matches →</Link>
          </SectionCard>

          <div className="lg:col-span-3">
            <CopyableMessage message={whatsAppMessageForRequirement(requirement)} />
          </div>
        </div>
      )}

      {tab === "matches" && (
        <SectionCard title={`Matching properties (${matches.length})`}>
          {matches.length === 0 ? (
            <EmptyState title="No qualifying properties" description="Hard filters (category, budget, size, location) excluded all current active listings." />
          ) : (
            <ul className="divide-y divide-black/6">
              {matches.map((m) => (
                <li key={m.property.id} className="flex items-center gap-4 py-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-current text-xs font-semibold text-ir-gold-dark tabular-nums">{m.result.score}</div>
                  <div className="min-w-0 flex-1">
                    <Link href={`/properties/${m.property.id}`} className="text-sm font-medium text-ir-navy hover:text-ir-gold-dark">{m.property.title}</Link>
                    <p className="mt-0.5 truncate text-xs text-black/50">{explainMatch(m.result)}</p>
                  </div>
                  <Link href={`/matchmaker?requirementId=${id}`} className="shrink-0 text-xs font-medium text-ir-gold-dark hover:underline">Open in Matchmaker</Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {tab === "deals" && (
        <SectionCard title={`Linked deals (${requirement.deals.length})`}>
          {requirement.deals.length === 0 ? (
            <EmptyState title="No deals linked yet" />
          ) : (
            <ul className="divide-y divide-black/6">
              {requirement.deals.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="text-sm font-medium text-ir-navy">{d.property.title}</div>
                    <div className="text-xs text-black/45">{d.dealRef} · {formatCurrency(d.expectedValue)}</div>
                  </div>
                  <Badge tone={(DEAL_STAGE_TONE[d.stage] as never) ?? "gray"}>{titleCase(d.stage)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {tab === "tasks" && (
        <SectionCard title="Tasks">
          <form action={createTask} className="mb-4 flex flex-wrap items-end gap-2.5">
            <input type="hidden" name="link" value={`requirement:${id}`} />
            <div className="min-w-[200px] flex-1">
              <label className="ir-label mb-1 block">Task</label>
              <input name="title" required placeholder="Follow up on financing…" className="ir-input" />
            </div>
            <div>
              <label className="ir-label mb-1 block">Due</label>
              <input name="dueAt" type="datetime-local" required className="ir-input" />
            </div>
            <div>
              <label className="ir-label mb-1 block">Assign to</label>
              <select name="assignedToId" defaultValue={user.id} className="ir-select">
                <option value="">Unassigned</option>
                {activeUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}{u.id === user.id ? " (you)" : ""}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="ir-btn ir-btn-primary">Add task</button>
          </form>
          {tasks.length === 0 ? (
            <EmptyState title="No tasks on this requirement yet" />
          ) : (
            <ul className="divide-y divide-black/6">
              {tasks.map((t) => {
                const overdue = t.status !== "DONE" && t.dueAt < new Date();
                const done = t.status === "DONE";
                return (
                  <li key={t.id} className="flex items-center gap-3 py-2.5">
                    <form action={setTaskStatus.bind(null, t.id, done ? "OPEN" : "DONE")}>
                      <button type="submit" title={done ? "Mark open" : "Mark done"} className={done ? "text-[color:var(--color-forest)]" : "text-black/25 hover:text-ir-gold-dark"}>
                        {done ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                      </button>
                    </form>
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm ${done ? "text-black/40 line-through" : "text-ir-navy"}`}>{t.title}</div>
                      <div className="mt-0.5 text-[0.7rem] text-black/40">
                        <span className={overdue ? "font-medium text-[color:var(--color-brick)]" : ""}>{overdue ? "Overdue" : "Due"} {formatDateTime(t.dueAt)}</span>
                        {t.assignedTo && <> · {t.assignedTo.name}</>}
                      </div>
                    </div>
                    <form action={deleteTask.bind(null, t.id)}>
                      <button type="submit" title="Delete task" className="text-black/25 hover:text-[color:var(--color-brick)]">
                        <Trash2 size={13} />
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      )}

      {tab === "activity" && (
        <SectionCard title="Activity history">
          {requirement.activities.length === 0 ? (
            <EmptyState title="No activity recorded" />
          ) : (
            <ul className="space-y-3">
              {requirement.activities.map((a) => (
                <li key={a.id} className="border-b border-black/6 pb-3 text-sm last:border-0">
                  <div className="text-ir-navy">{a.message}</div>
                  <div className="mt-0.5 text-xs text-black/40">{a.user?.name ?? "System"} · {formatDateTime(a.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}
    </div>
  );
}
