import type { Role } from "@/generated/prisma/client";

export type NavSection = "Workspace" | "Tools" | "Records" | "Business";

export type NavItem = {
  href: string;
  label: string;
  icon: string; // lucide-react icon name, resolved in Sidebar
  section: NavSection;
  roles?: Role[]; // undefined = all internal roles
};

const INTERNAL: Role[] = ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER", "AGENT", "MARKETING", "LEGAL", "FINANCE", "EXTERNAL_BROKER"];

// Grouped by how often a role actually reaches for it, not alphabetically —
// Workspace is the daily spine, Tools is "find/match something", Records is
// supporting reference material, Business is oversight + the few admin-only
// screens. Same 18 destinations as before, just no longer one undifferentiated
// list of equal visual weight.
export const NAV_ITEMS: NavItem[] = [
  { href: "/command-centre", label: "Command Centre", icon: "LayoutDashboard", section: "Workspace" },
  { href: "/properties", label: "Properties", icon: "Building2", section: "Workspace" },
  { href: "/requirements", label: "Requirements", icon: "ClipboardList", section: "Workspace" },
  { href: "/deals", label: "Deals Pipeline", icon: "Kanban", section: "Workspace" },
  { href: "/viewings", label: "Viewings", icon: "CalendarClock", section: "Workspace" },
  { href: "/tasks", label: "Tasks", icon: "ListTodo", section: "Workspace" },
  { href: "/notes", label: "Notes", icon: "StickyNote", section: "Workspace" },

  { href: "/ai-intake", label: "AI Intake", icon: "Sparkles", section: "Tools", roles: ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER", "AGENT", "MARKETING"] },
  { href: "/sourcing", label: "External Sourcing", icon: "Search", section: "Tools", roles: ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER", "AGENT"] },
  { href: "/matchmaker", label: "Matchmaker", icon: "Radar", section: "Tools" },
  { href: "/marketing-studio", label: "Marketing Studio", icon: "Megaphone", section: "Tools", roles: ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER", "MARKETING", "AGENT"] },

  { href: "/contacts", label: "Contacts & CRM", icon: "Users", section: "Records" },
  { href: "/agents", label: "Agents", icon: "UserRound", section: "Records" },
  { href: "/documents", label: "Document Vault", icon: "FolderLock", section: "Records", roles: ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER", "AGENT", "LEGAL", "FINANCE"] },

  { href: "/commissions", label: "Commission Centre", icon: "Wallet", section: "Business", roles: ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER", "FINANCE"] },
  { href: "/analytics", label: "Analytics", icon: "BarChart3", section: "Business", roles: ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER", "FINANCE", "MARKETING"] },
  { href: "/admin", label: "Administration", icon: "ShieldCheck", section: "Business", roles: ["SUPER_ADMIN"] },
  { href: "/settings", label: "Settings", icon: "Settings", section: "Business" },
];

export function navForRole(role: Role): NavItem[] {
  if (!INTERNAL.includes(role)) return [];
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));
}
