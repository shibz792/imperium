import type { Role } from "@/generated/prisma/client";
import { SALES_TEAM_ROLES, AI_INTAKE_ROLES, SOURCING_ROLES, DOCUMENT_ROLES, DEAL_ROLES, VIEWING_MATCH_ROLES, ALL_INTERNAL_ROLES, FINANCE_ROLES, ANALYTICS_ROLES, ADMIN_ROLES } from "@/lib/roles";

export type NavSection = "Workspace" | "Tools" | "Records" | "Business";

export type NavItem = {
  href: string;
  label: string;
  icon: string; // lucide-react icon name, resolved in Sidebar
  section: NavSection;
  roles?: Role[]; // undefined = all internal roles
};

// Grouped by how often a role actually reaches for it, not alphabetically —
// Workspace is the daily spine, Tools is "find/match something", Records is
// supporting reference material, Business is oversight + the few admin-only
// screens.
//
// Every `roles` list here is one of the shared groups from lib/roles.ts,
// not a one-off array — the corresponding page calls requireRole() with
// the same constant, so a role that can't see a link here also can't
// reach it by typing the URL directly. Only SUPER_ADMIN and DIRECTOR see
// literally everything; everyone else is scoped to what their job
// actually touches (spec: "keep everyone else's account restricted to
// only what's needed for them").
export const NAV_ITEMS: NavItem[] = [
  { href: "/command-centre", label: "Command Centre", icon: "LayoutDashboard", section: "Workspace" },
  { href: "/properties", label: "Properties", icon: "Building2", section: "Workspace" },
  { href: "/requirements", label: "Requirements", icon: "ClipboardList", section: "Workspace", roles: SALES_TEAM_ROLES },
  { href: "/deals", label: "Deals Pipeline", icon: "Kanban", section: "Workspace", roles: DEAL_ROLES },
  { href: "/viewings", label: "Viewings", icon: "CalendarClock", section: "Workspace", roles: VIEWING_MATCH_ROLES },
  { href: "/tasks", label: "Tasks", icon: "ListTodo", section: "Workspace", roles: SALES_TEAM_ROLES },
  { href: "/notes", label: "Notes", icon: "StickyNote", section: "Workspace", roles: SALES_TEAM_ROLES },

  { href: "/ai-intake", label: "AI Intake", icon: "Sparkles", section: "Tools", roles: AI_INTAKE_ROLES },
  { href: "/whatsapp", label: "WhatsApp Leads", icon: "MessageCircle", section: "Tools", roles: SALES_TEAM_ROLES },
  { href: "/sourcing", label: "External Sourcing", icon: "Search", section: "Tools", roles: SOURCING_ROLES },
  { href: "/matchmaker", label: "Matchmaker", icon: "Radar", section: "Tools", roles: VIEWING_MATCH_ROLES },
  { href: "/marketing-studio", label: "Marketing Studio", icon: "Megaphone", section: "Tools", roles: ADMIN_ROLES },

  { href: "/contacts", label: "Contacts & CRM", icon: "Users", section: "Records", roles: SALES_TEAM_ROLES },
  { href: "/agents", label: "Agents", icon: "UserRound", section: "Records", roles: SALES_TEAM_ROLES },
  { href: "/documents", label: "Document Vault", icon: "FolderLock", section: "Records", roles: DOCUMENT_ROLES },

  { href: "/commissions", label: "Commission Centre", icon: "Wallet", section: "Business", roles: FINANCE_ROLES },
  { href: "/analytics", label: "Analytics", icon: "BarChart3", section: "Business", roles: ANALYTICS_ROLES },
  { href: "/admin", label: "Administration", icon: "ShieldCheck", section: "Business", roles: ADMIN_ROLES },
  { href: "/settings", label: "Settings", icon: "Settings", section: "Business" },
];

export function navForRole(role: Role): NavItem[] {
  if (!ALL_INTERNAL_ROLES.includes(role)) return [];
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));
}
