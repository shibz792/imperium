import type { Role } from "@/generated/prisma/client";

// Pure, client-safe role metadata. Kept separate from lib/auth.ts, which
// pulls in next/headers + Prisma (server-only) — importing that from a
// Client Component silently breaks the Turbopack dev build.
export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Administrator",
  DIRECTOR: "Director",
  SALES_MANAGER: "Sales Manager",
  AGENT: "Property Agent",
  MARKETING: "Marketing Team",
  LEGAL: "Legal / Documentation",
  FINANCE: "Finance",
  EXTERNAL_BROKER: "External Broker",
  OWNER_PORTAL: "Property Owner",
  CLIENT_PORTAL: "Buyer / Tenant",
};

// Single source of truth for who gets which page — used by both nav.ts
// (what's shown in the sidebar) and each page's own requireRole() check
// (what's actually reachable by URL). A hidden nav link that the page
// itself doesn't enforce isn't really a restriction, just a shortcut
// someone can navigate around — every group below is checked in both
// places so the two can't drift apart.
export const SALES_TEAM_ROLES: Role[] = ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER", "AGENT"];
export const AI_INTAKE_ROLES: Role[] = ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER", "AGENT", "MARKETING"];
export const SOURCING_ROLES: Role[] = ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER", "AGENT"];
export const DOCUMENT_ROLES: Role[] = ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER", "AGENT", "LEGAL", "FINANCE"];
export const DEAL_ROLES: Role[] = ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER", "AGENT", "FINANCE", "EXTERNAL_BROKER"];
export const VIEWING_MATCH_ROLES: Role[] = ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER", "AGENT", "EXTERNAL_BROKER"];
// Roles with full financial visibility (commission centre, pipeline value).
// Also re-exported from lib/auth.ts (canSeeFinance()'s source of truth) so
// both the server-side check and the nav/page role gates read one array.
export const FINANCE_ROLES: Role[] = ["SUPER_ADMIN", "DIRECTOR", "FINANCE", "SALES_MANAGER"];
export const ANALYTICS_ROLES: Role[] = ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER", "FINANCE", "MARKETING"];
// Roles that can administer users, roles, locations, templates, audit logs
// — also Marketing Studio's own access, per the standing decision that the
// whole feature (content, publishing, ads, connecting Meta/WhatsApp) is
// admin-only, not shared with the wider marketing team. Also re-exported
// from lib/auth.ts (isAdmin()'s source of truth) for the same reason
// FINANCE_ROLES is: one array read by both the server-only check and the
// client-safe nav gate.
export const ADMIN_ROLES: Role[] = ["SUPER_ADMIN"];
// Every non-portal, non-client role — for the handful of pages (Properties,
// Command Centre, Settings) that are meant to be reachable by anyone on
// staff rather than scoped to one function.
export const ALL_INTERNAL_ROLES: Role[] = ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER", "AGENT", "MARKETING", "LEGAL", "FINANCE", "EXTERNAL_BROKER"];
