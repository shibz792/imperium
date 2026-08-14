import Link from "next/link";
import { CheckCircle2, Circle, Trash2, Building2, ClipboardList } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { SALES_TEAM_ROLES } from "@/lib/roles";
import { PageHeader, EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { createTask, setTaskStatus, deleteTask } from "./actions";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { SubmitButton } from "@/components/SubmitButton";

const TYPE_LABELS: Record<string, string> = {
  CONTACT_INQUIRY: "Contact inquiry",
  VIEWING_CONFIRM: "Confirm viewing",
  CLIENT_UPDATE: "Client update",
  LISTING_VERIFY: "Verify listing",
  OFFER_RESPONSE: "Offer response",
  LEASE_EXPIRY: "Lease expiry",
  COMMISSION_OVERDUE: "Commission overdue",
  REQUIREMENT_RECONFIRM: "Requirement reconfirm",
  CUSTOM: "General",
};

const CAN_DELETE_ANY = ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER"];

export default async function TasksPage() {
  const user = await requireRole(SALES_TEAM_ROLES);
  const [tasks, users, properties, requirements] = await Promise.all([
    prisma.task.findMany({ include: { assignedTo: true, createdBy: true }, orderBy: { dueAt: "asc" } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.property.findMany({ orderBy: { title: "asc" }, select: { id: true, title: true, propertyRef: true } }),
    prisma.requirement.findMany({ orderBy: { title: "asc" }, select: { id: true, title: true, requirementRef: true } }),
  ]);

  const open = tasks.filter((t) => t.status !== "DONE").sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  const done = tasks.filter((t) => t.status === "DONE");
  const overdueCount = open.filter((t) => t.dueAt < new Date()).length;

  return (
    <div>
      <PageHeader
        eyebrow={`Tasks · ${open.length} open${overdueCount > 0 ? ` · ${overdueCount} overdue` : ""}`}
        title="Tasks"
        description="Anything with a deadline: a call to make, a listing to verify, a lease to chase. Link it to a property or requirement, or leave it general."
      />

      <form action={createTask} className="ir-card mb-6 flex flex-wrap items-end gap-3 p-5">
        <div className="min-w-[220px] flex-1">
          <label className="ir-label mb-1 block">Task</label>
          <input name="title" required placeholder="Call the owner about…" className="ir-input" />
        </div>
        <div>
          <label className="ir-label mb-1 block">Due</label>
          <input name="dueAt" type="datetime-local" required className="ir-input" />
        </div>
        <div>
          <label className="ir-label mb-1 block">Type</label>
          <select name="type" defaultValue="CUSTOM" className="ir-select">
            {Object.entries(TYPE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="ir-label mb-1 block">Assign to</label>
          <select name="assignedToId" defaultValue={user.id} className="ir-select">
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}{u.id === user.id ? " (you)" : ""}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[200px]">
          <label className="ir-label mb-1 block">Link to (optional)</label>
          <select name="link" defaultValue="" className="ir-select">
            <option value="">Not linked</option>
            <optgroup label="Properties">
              {properties.map((p) => (
                <option key={p.id} value={`property:${p.id}`}>{p.propertyRef} · {p.title}</option>
              ))}
            </optgroup>
            <optgroup label="Requirements">
              {requirements.map((r) => (
                <option key={r.id} value={`requirement:${r.id}`}>{r.requirementRef} · {r.title}</option>
              ))}
            </optgroup>
          </select>
        </div>
        <SubmitButton className="ir-btn ir-btn-primary self-end">Add task</SubmitButton>
      </form>

      {tasks.length === 0 ? (
        <EmptyState title="No tasks yet" description="Whatever has a deadline goes here." />
      ) : (
        <div className="space-y-5">
          <div className="ir-card divide-y divide-black/6">
            {open.length === 0 ? (
              <p className="p-5 text-center text-xs text-black/40">Nothing open — nice work.</p>
            ) : (
              open.map((t) => <TaskRow key={t.id} task={t} currentUserId={user.id} canDeleteAny={CAN_DELETE_ANY.includes(user.role)} />)
            )}
          </div>

          {done.length > 0 && (
            <div>
              <div className="ir-label mb-2">Done ({done.length})</div>
              <div className="ir-card divide-y divide-black/6 opacity-60">
                {done.map((t) => <TaskRow key={t.id} task={t} currentUserId={user.id} canDeleteAny={CAN_DELETE_ANY.includes(user.role)} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const ENTITY_PATH: Record<string, string> = { property: "/properties", requirement: "/requirements", contact: "/contacts" };

function TaskRow({
  task,
  currentUserId,
  canDeleteAny,
}: {
  task: {
    id: string;
    title: string;
    type: string;
    dueAt: Date;
    status: string;
    relatedEntityType: string | null;
    relatedEntityId: string | null;
    assignedTo: { name: string } | null;
    assignedToId: string | null;
    createdBy: { name: string } | null;
    createdById: string | null;
  };
  currentUserId: string;
  canDeleteAny: boolean;
}) {
  const overdue = task.status !== "DONE" && task.dueAt < new Date();
  const done = task.status === "DONE";
  const linkHref = task.relatedEntityType && ENTITY_PATH[task.relatedEntityType] && task.relatedEntityId ? `${ENTITY_PATH[task.relatedEntityType]}/${task.relatedEntityId}` : null;
  const canDelete = task.createdById === currentUserId || task.assignedToId === currentUserId || canDeleteAny;

  return (
    <div className="flex items-center gap-3 p-3.5">
      <form action={setTaskStatus.bind(null, task.id, done ? "OPEN" : "DONE")}>
        <button type="submit" title={done ? "Mark open" : "Mark done"} className={done ? "text-[color:var(--color-forest)]" : "text-black/25 hover:text-ir-gold-dark"}>
          {done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
        </button>
      </form>

      <div className="min-w-0 flex-1">
        <div className={`text-sm ${done ? "text-black/40 line-through" : "text-ir-navy"}`}>{task.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.7rem] text-black/40">
          <span>{TYPE_LABELS[task.type] ?? task.type}</span>
          <span>·</span>
          <span className={overdue ? "font-medium text-[color:var(--color-brick)]" : ""}>{overdue ? "Overdue" : "Due"} {formatDateTime(task.dueAt)}</span>
          {task.assignedTo && (
            <>
              <span>·</span>
              <span>{task.assignedTo.name}</span>
            </>
          )}
          {linkHref && (
            <Link href={linkHref} className="ir-badge inline-flex items-center gap-1 border-ir-gold/40 bg-ir-gold/10 !py-0 text-ir-gold-dark hover:bg-ir-gold/20">
              {task.relatedEntityType === "property" ? <Building2 size={10} /> : <ClipboardList size={10} />} View
            </Link>
          )}
        </div>
      </div>

      {canDelete && (
        <form action={deleteTask.bind(null, task.id)}>
          <ConfirmSubmitButton confirmMessage="Delete this task? This can't be undone." title="Delete task" className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-black/25 hover:bg-black/[0.05] hover:text-[color:var(--color-brick)]">
            <Trash2 size={13} />
          </ConfirmSubmitButton>
        </form>
      )}
    </div>
  );
}
