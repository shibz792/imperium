import type { Role } from "@/generated/prisma/client";

export type NavItem = {
  href: string;
  label: string;
  icon: string; // lucide-react icon name, resolved in Sidebar
  roles?: Role[]; // undefined = all internal roles
};

const INTERNAL: Role[] = ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER", "AGENT", "MARKETING", "LEGAL", "FINANCE", "EXTERNAL_BROKER"];

export const NAV_ITEMS: NavItem[] = [
  { href: "/command-centre", label: "Command Centre", icon: "LayoutDashboard" },
  { href: "/properties", label: "Properties", icon: "Building2" },
  { href: "/requirements", label: "Requirements", icon: "ClipboardList" },
  { href: "/ai-intake", label: "Imperium AI Intake", icon: "Sparkles", roles: ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER", "AGENT", "MARKETING"] },
  { href: "/sourcing", label: "External Sourcing", icon: "Search", roles: ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER", "AGENT"] },
  { href: "/matchmaker", label: "Matchmaker", icon: "Radar" },
  { href: "/agents", label: "Agents", icon: "UserRound" },
  { href: "/contacts", label: "Contacts & CRM", icon: "Users" },
  { href: "/deals", label: "Deals Pipeline", icon: "Kanban" },
  { href: "/viewings", label: "Viewings", icon: "CalendarClock" },
  { href: "/tasks", label: "Tasks", icon: "ListTodo" },
  { href: "/notes", label: "Notes", icon: "StickyNote" },
  { href: "/marketing-studio", label: "Marketing Studio", icon: "Megaphone", roles: ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER", "MARKETING", "AGENT"] },
  { href: "/documents", label: "Document Vault", icon: "FolderLock", roles: ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER", "AGENT", "LEGAL", "FINANCE"] },
  { href: "/commissions", label: "Commission Centre", icon: "Wallet", roles: ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER", "FINANCE"] },
  { href: "/analytics", label: "Analytics", icon: "BarChart3", roles: ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER", "FINANCE", "MARKETING"] },
  { href: "/admin", label: "Administration", icon: "ShieldCheck", roles: ["SUPER_ADMIN"] },
  { href: "/settings", label: "Settings", icon: "Settings" },
];

export function navForRole(role: Role): NavItem[] {
  if (!INTERNAL.includes(role)) return [];
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));
}
