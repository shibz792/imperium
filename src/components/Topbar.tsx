import Link from "next/link";
import { Sparkles } from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import { ROLE_LABELS, type CurrentUser } from "@/lib/auth";
import { initials } from "@/lib/format";
import { MobileMenuButton } from "@/components/MobileMenuButton";

// Navy, matching the sidebar — together they frame the ivory canvas in an
// L-shape rather than the standard "white topbar over dark sidebar" split
// every admin template defaults to.
export function Topbar({ user }: { user: CurrentUser }) {
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

        <div className="mx-0.5 h-6 w-px bg-white/[0.1] sm:mx-1.5" />

        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-ir-gold/30 bg-white/5 text-[0.65rem] font-semibold text-ir-gold">
            {initials(user.name)}
          </div>
          <div className="hidden leading-tight sm:block">
            <div className="text-sm font-medium text-white">{user.name}</div>
            <div className="text-[0.7rem] text-white/40">{ROLE_LABELS[user.role]}</div>
          </div>
        </div>

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
