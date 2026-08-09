import Link from "next/link";
import { Sparkles, ListTodo, StickyNote } from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import { requireUser } from "@/lib/auth";
import { MobileMenuButton } from "@/components/MobileMenuButton";
import { NotificationBell } from "@/components/NotificationBell";
import { GlobalSearch } from "@/components/GlobalSearch";
import { getNotificationSummary } from "@/lib/queries/notifications";

// Navy, matching the sidebar — together they frame the ivory canvas in an
// L-shape rather than the standard "white topbar over dark sidebar" split
// every admin template defaults to. Identity (avatar/name/role) lives once,
// in the sidebar's own footer — this bar doesn't repeat it.
export async function Topbar() {
  const user = await requireUser();
  const notifications = await getNotificationSummary(user.lastNotificationsSeenAt ?? null);

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-2 border-b border-ir-gold/20 bg-ir-navy px-4 sm:px-7">
      <div className="flex items-center gap-1 min-w-0">
        <MobileMenuButton />
        <div className="ir-label !text-white/35 truncate">
          {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <Link href="/ai-intake" className="ir-btn ir-btn-gold !px-2.5 sm:!px-3.5">
          <Sparkles size={14} />
          <span className="hidden sm:inline">AI Intake</span>
        </Link>

        <GlobalSearch />

        <Link href="/tasks" title="Tasks" aria-label="Tasks" className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white">
          <ListTodo size={16} />
        </Link>
        <Link href="/notes" title="Notes" aria-label="Notes" className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white">
          <StickyNote size={16} />
        </Link>

        <div className="mx-0.5 h-6 w-px bg-white/[0.1] sm:mx-1.5" />

        <NotificationBell {...notifications} />

        <form action={logoutAction}>
          <button type="submit" className="ir-btn !border-white/15 !px-2.5 !py-1.5 !text-xs !text-white/70 hover:!border-white/40 hover:!bg-white/5 hover:!text-white sm:!px-3.5">
            <span className="hidden sm:inline">Sign out</span>
            <span className="sm:hidden">Out</span>
          </button>
        </form>
      </div>
    </header>
  );
}
