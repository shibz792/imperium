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
