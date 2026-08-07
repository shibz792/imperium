"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Bell, CheckCircle2, FileWarning, ClipboardList } from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/format";
import { markNotificationsSeen } from "@/lib/notifications-actions";

type Task = { id: string; title: string; dueAt: Date | string; relatedEntityType: string | null; relatedEntityId: string | null };
type Offer = { id: string; dealId: string; amount: number; deal: { property: { title: string } } };

const ENTITY_PREFIX: Record<string, string> = { property: "/properties", requirement: "/requirements", deal: "/deals", contact: "/contacts" };

export function NotificationBell({ tasks, offers, staleCount, overdueCount, unseenCount, total }: { tasks: Task[]; offers: Offer[]; staleCount: number; overdueCount: number; unseenCount: number; total: number }) {
  const [open, setOpen] = useState(false);
  // Optimistic: the badge clears the instant you open the bell, without
  // waiting on the server round-trip or a full page revalidation.
  const [seen, setSeen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [, startTransition] = useTransition();
  const badgeCount = seen ? 0 : unseenCount;

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function toggle() {
    setOpen((o) => {
      const next = !o;
      if (next && unseenCount > 0) {
        setSeen(true);
        startTransition(() => {
          markNotificationsSeen();
        });
      }
      return next;
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        aria-label="Notifications"
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
      >
        <Bell size={16} />
        {badgeCount > 0 && (
          <span className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.6rem] font-semibold text-white ${overdueCount > 0 ? "bg-[color:var(--color-brick)]" : "bg-ir-gold-dark"}`}>
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-30 w-80 rounded-[3px] border border-black/10 bg-white shadow-lg">
          <div className="max-h-[70vh] overflow-y-auto">
            {total === 0 ? (
              <p className="p-5 text-center text-xs text-black/40">Nothing needs attention right now.</p>
            ) : (
              <>
                {tasks.length > 0 && (
                  <div className="border-b border-black/6 p-3">
                    <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[0.65rem] font-semibold uppercase tracking-wide text-black/40">
                      <CheckCircle2 size={12} /> Tasks due
                    </div>
                    {tasks.map((t) => {
                      const href = t.relatedEntityType && t.relatedEntityId ? `${ENTITY_PREFIX[t.relatedEntityType.toLowerCase()] ?? ""}/${t.relatedEntityId}` : "/deals";
                      const overdue = new Date(t.dueAt) < new Date();
                      return (
                        <Link key={t.id} href={href} onClick={() => setOpen(false)} className="block rounded-[3px] px-2 py-1.5 hover:bg-black/[0.03]">
                          <div className="text-xs text-ir-navy">{t.title}</div>
                          <div className={`text-[0.7rem] ${overdue ? "text-[color:var(--color-brick)]" : "text-black/40"}`}>{overdue ? "Overdue" : `Due ${formatDate(t.dueAt)}`}</div>
                        </Link>
                      );
                    })}
                  </div>
                )}
                {offers.length > 0 && (
                  <div className="border-b border-black/6 p-3">
                    <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[0.65rem] font-semibold uppercase tracking-wide text-black/40">
                      <FileWarning size={12} /> Offers awaiting action
                    </div>
                    {offers.map((o) => (
                      <Link key={o.id} href={`/deals/${o.dealId}`} onClick={() => setOpen(false)} className="block rounded-[3px] px-2 py-1.5 hover:bg-black/[0.03]">
                        <div className="text-xs text-ir-navy">{o.deal.property.title}</div>
                        <div className="text-[0.7rem] text-black/40">{formatCurrency(o.amount)}</div>
                      </Link>
                    ))}
                  </div>
                )}
                {staleCount > 0 && (
                  <div className="p-3">
                    <Link href="/properties?stale=1" onClick={() => setOpen(false)} className="flex items-center gap-1.5 rounded-[3px] px-2 py-1.5 text-xs text-ir-navy hover:bg-black/[0.03]">
                      <ClipboardList size={12} className="text-black/40" />
                      {staleCount} listing{staleCount === 1 ? "" : "s"} need reverification
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
