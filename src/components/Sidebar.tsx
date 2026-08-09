"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import {
  LayoutDashboard,
  Building2,
  ClipboardList,
  Sparkles,
  Radar,
  Users,
  UserRound,
  Kanban,
  CalendarClock,
  Megaphone,
  FolderLock,
  Wallet,
  BarChart3,
  ShieldCheck,
  Search,
  StickyNote,
  ListTodo,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  X,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import type { NavItem } from "@/lib/nav";
import { ROLE_LABELS } from "@/lib/roles";
import type { CurrentUser } from "@/lib/auth";
import { initials } from "@/lib/format";
import { useMobileNav } from "@/components/MobileNavContext";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  Building2,
  ClipboardList,
  Sparkles,
  Radar,
  Users,
  UserRound,
  Kanban,
  CalendarClock,
  Megaphone,
  FolderLock,
  Wallet,
  BarChart3,
  ShieldCheck,
  Search,
  StickyNote,
  ListTodo,
  Settings,
};

export function Sidebar({ items, user }: { items: NavItem[]; user: CurrentUser }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { open, setOpen } = useMobileNav();

  // Grouped in the order sections first appear in `items` (already
  // Workspace → Tools → Records → Business, per nav.ts) rather than a
  // fixed list here — a role missing an entire section (e.g. no Business
  // items visible) just doesn't render that heading, nothing to keep in sync.
  const sections: [string, NavItem[]][] = [];
  for (const item of items) {
    const existing = sections.find(([s]) => s === item.section);
    if (existing) existing[1].push(item);
    else sections.push([item.section, [item]]);
  }

  return (
    <>
      {open && <div onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/40 lg:hidden" />}

      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex h-screen w-[280px] shrink-0 flex-col bg-ir-navy text-white transition-transform duration-200",
          "lg:sticky lg:top-0 lg:z-auto lg:translate-x-0 lg:transition-[width]",
          open ? "translate-x-0" : "-translate-x-full",
          collapsed ? "lg:w-[68px]" : "lg:w-[248px]",
        )}
      >
        <div className={clsx("flex items-center justify-between border-b border-white/[0.08]", collapsed ? "lg:h-16 lg:justify-center lg:px-0" : "px-6 py-6")}>
          <Link href="/command-centre" onClick={() => setOpen(false)}>
            <span className={collapsed ? "lg:hidden" : ""}>
              <Logo variant="full" tone="dark" size="md" />
            </span>
            {collapsed && <span className="hidden lg:inline"><Logo variant="icon" size="sm" /></span>}
          </Link>
          <button onClick={() => setOpen(false)} aria-label="Close menu" className="flex h-8 w-8 items-center justify-center rounded text-white/50 hover:bg-white/10 hover:text-white lg:hidden">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          {sections.map(([section, sectionItems]) => (
            <div key={section} className="mb-1 px-3">
              <div className={clsx("mb-1 mt-3 px-3.5 text-[0.65rem] font-semibold uppercase tracking-[0.09em] text-white/25 first:mt-0", collapsed && "lg:hidden")}>
                {section}
              </div>
              <ul className="space-y-0.5">
                {sectionItems.map((item) => {
                  const Icon = ICONS[item.icon];
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <li key={item.href} className="relative">
                      {active && <span className={clsx("absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 bg-ir-gold", collapsed && "lg:hidden")} />}
                      <Link
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        onClick={() => setOpen(false)}
                        className={clsx(
                          "flex items-center gap-3 rounded-[3px] px-3.5 py-2 text-[0.8125rem] font-medium transition-colors",
                          active ? "bg-white/[0.06] text-ir-gold-light" : "text-white/55 hover:bg-white/[0.04] hover:text-white/90",
                          collapsed && "lg:justify-center lg:px-0",
                        )}
                      >
                        {Icon && <Icon size={16} strokeWidth={1.6} className="shrink-0" />}
                        <span className={clsx("truncate tracking-[0.005em]", collapsed && "lg:hidden")}>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/[0.08] p-3">
          <div className="mb-1 flex items-center gap-2.5 px-3.5 py-1.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ir-gold/30 bg-white/5 text-[0.65rem] font-semibold text-ir-gold">
              {initials(user.name)}
            </div>
            <div className={clsx("min-w-0", collapsed && "lg:hidden")}>
              <div className="truncate text-xs font-medium text-white">{user.name}</div>
              <div className="truncate text-[0.7rem] text-white/40">{ROLE_LABELS[user.role]}</div>
            </div>
          </div>
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : undefined}
            className={clsx(
              "hidden w-full items-center gap-2 rounded-[3px] px-3.5 py-2 text-xs text-white/40 transition-colors hover:bg-white/[0.04] hover:text-white/80 lg:flex",
              collapsed && "lg:justify-center lg:px-0",
            )}
          >
            {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
            <span className={collapsed ? "lg:hidden" : ""}>Collapse</span>
          </button>
        </div>
      </aside>
    </>
  );
}
