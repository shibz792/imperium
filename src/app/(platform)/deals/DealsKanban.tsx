"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { GripVertical, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { updateDealStage, deleteDeal } from "./actions";

const COLUMN_LABELS: Record<string, string> = {
  NEW_INQUIRY: "New inquiry",
  CONTACT_ATTEMPTED: "Contact attempted",
  QUALIFIED: "Qualified",
  SHORTLISTED: "Shortlisted",
  VIEWING_ARRANGED: "Viewing arranged",
  VIEWING_COMPLETED: "Viewing completed",
  NEGOTIATION: "Negotiation",
  OFFER_SUBMITTED: "Offer submitted",
  AGREEMENT_PENDING: "Agreement pending",
  CLOSED_WON: "Closed won",
  CLOSED_LOST: "Closed lost",
};

// Grouped to match how a deal actually moves here: chasing it, matching /
// showing inventory, then the closing mechanics. Purely a visual grouping
// in the kanban header band — the stages themselves are unchanged.
const STAGE_GROUPS: { label: string; stages: string[] }[] = [
  { label: "Contact", stages: ["NEW_INQUIRY", "CONTACT_ATTEMPTED", "QUALIFIED"] },
  { label: "Matching", stages: ["SHORTLISTED", "VIEWING_ARRANGED", "VIEWING_COMPLETED"] },
  { label: "Closing", stages: ["NEGOTIATION", "OFFER_SUBMITTED", "AGREEMENT_PENDING"] },
  { label: "Done", stages: ["CLOSED_WON", "CLOSED_LOST"] },
];

function nextStage(current: string, stages: string[]): string | null {
  const idx = stages.indexOf(current);
  if (idx === -1 || idx >= stages.length - 3) return null; // don't auto-advance into closed states
  return stages[idx + 1];
}

export type KanbanDeal = {
  id: string;
  stage: string;
  expectedValue: number | null;
  property: { title: string };
  client: { name: string };
  assignedAgent: { name: string } | null;
};

export function DealsKanban({ deals: initialDeals, stages, canDelete = false }: { deals: KanbanDeal[]; stages: string[]; canDelete?: boolean }) {
  const [deals, setDeals] = useState(initialDeals);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function remove(deal: KanbanDeal) {
    if (!window.confirm(`Permanently delete this deal (${deal.property.title})? This can't be undone.`)) return;
    setDeals((prev) => prev.filter((d) => d.id !== deal.id));
    startTransition(() => {
      deleteDeal(deal.id);
    });
  }

  // useState(initialDeals) only reads that value on the very first mount —
  // if this component instance ever gets reused across a server refetch
  // (a revalidation, an App Router navigation that doesn't remount it)
  // instead of a fresh mount, the board would keep showing whatever it
  // first loaded with. React's own recommended fix for "reset state when a
  // prop changes": compare during render and adjust immediately, not in a
  // useEffect (which would cost an extra render pass) — see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  const [prevInitialDeals, setPrevInitialDeals] = useState(initialDeals);
  if (initialDeals !== prevInitialDeals) {
    setPrevInitialDeals(initialDeals);
    setDeals(initialDeals);
  }

  const byStage = useMemo(() => {
    const map = new Map<string, KanbanDeal[]>();
    for (const stage of stages) map.set(stage, []);
    for (const deal of deals) map.get(deal.stage)?.push(deal);
    return map;
  }, [deals, stages]);

  function moveTo(dealId: string, stage: string) {
    setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage } : d)));
    startTransition(() => {
      updateDealStage(dealId, stage);
    });
  }

  function handleDrop(stage: string) {
    setDragOverStage(null);
    if (!draggingId) return;
    const dealId = draggingId;
    setDraggingId(null);
    const current = deals.find((d) => d.id === dealId);
    if (!current || current.stage === stage) return;
    moveTo(dealId, stage);
  }

  return (
    <div>
      <div className="mb-2 flex gap-3 overflow-x-auto">
        {STAGE_GROUPS.map((g) => (
          <div key={g.label} className="ir-label !mb-0" style={{ width: g.stages.length * 292 - 12 }}>
            {g.label}
          </div>
        ))}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const items = byStage.get(stage) ?? [];
          const stageValue = items.reduce((s, d) => s + (d.expectedValue ?? 0), 0);
          const isDropTarget = dragOverStage === stage && draggingId && deals.find((d) => d.id === draggingId)?.stage !== stage;
          return (
            <div
              key={stage}
              className="w-[280px] shrink-0"
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverStage !== stage) setDragOverStage(stage);
              }}
              onDragLeave={() => setDragOverStage((s) => (s === stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(stage);
              }}
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-semibold text-ir-navy">{COLUMN_LABELS[stage]}</span>
                <span className="text-[0.65rem] text-black/40">{items.length}</span>
              </div>
              <div className="mb-2 px-1 text-[0.7rem] text-black/35">{formatCurrency(stageValue)}</div>
              <div
                className={`space-y-2.5 rounded-md transition-colors ${isDropTarget ? "bg-ir-gold/10 ring-1 ring-inset ring-ir-gold/40" : ""}`}
                style={{ minHeight: 56 }}
              >
                {items.map((d) => {
                  const next = nextStage(d.stage, stages);
                  return (
                    <div
                      key={d.id}
                      className={`group/card ir-card ir-card-hover relative overflow-hidden ${draggingId === d.id ? "opacity-35" : ""}`}
                    >
                      {/* A dedicated handle, not the whole card — a card-wide
                          draggable="true" swallows any click that has even a
                          pixel of drift as a drag instead of a navigation
                          click, which made the card unopenable more often
                          than not. Only this handle initiates a drag. */}
                      <span
                        draggable
                        onDragStart={(e) => {
                          setDraggingId(d.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDragOverStage(null);
                        }}
                        title="Drag to move stage"
                        className="absolute right-1 top-1 z-10 flex h-6 w-6 cursor-grab items-center justify-center rounded text-black/15 opacity-0 transition-opacity hover:bg-black/5 hover:text-black/45 focus-visible:opacity-100 active:cursor-grabbing group-hover/card:opacity-100"
                      >
                        <GripVertical size={14} />
                      </span>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => remove(d)}
                          title="Delete deal"
                          className="absolute right-8 top-1 z-10 flex h-6 w-6 items-center justify-center rounded text-black/15 opacity-0 transition-opacity hover:bg-black/5 hover:text-[color:var(--color-brick)] focus-visible:opacity-100 group-hover/card:opacity-100"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                      <Link href={`/deals/${d.id}`} className="block p-3 pr-8">
                        <div className="text-[0.8125rem] font-medium leading-snug text-ir-navy">{d.property.title}</div>
                        <div className="mt-1.5 flex items-center justify-between">
                          <span className="text-[0.7rem] text-black/45">{d.client.name}</span>
                          <span className="ir-figure text-sm text-ir-navy">{formatCurrency(d.expectedValue)}</span>
                        </div>
                        <div className="mt-1 text-[0.7rem] text-black/40">{d.assignedAgent?.name ?? "Unassigned"}</div>
                      </Link>
                      {next && (
                        <button
                          type="button"
                          onClick={() => moveTo(d.id, next)}
                          className="w-full border-t border-black/[0.06] px-3 py-2 text-left text-[0.7rem] font-medium text-ir-gold-dark hover:bg-ir-gold/10"
                        >
                          Move to {COLUMN_LABELS[next]} →
                        </button>
                      )}
                    </div>
                  );
                })}
                {items.length === 0 && !isDropTarget && (
                  <div className="rounded border border-dashed border-black/10 p-3 text-center text-[0.7rem] text-black/30">Empty</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-1 px-1 text-[0.7rem] text-black/30">Drag a card to any stage, or use the quick-move button.</p>
    </div>
  );
}
