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
export const MARKETING_STUDIO_ROLES: Role[] = ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER", "AGENT", "MARKETING"];
export const DOCUMENT_ROLES: Role[] = ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER", "AGENT", "LEGAL", "FINANCE"];
export const DEAL_ROLES: Role[] = ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER", "AGENT", "FINANCE", "EXTERNAL_BROKER"];
export const VIEWING_MATCH_ROLES: Role[] = ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER", "AGENT", "EXTERNAL_BROKER"];
