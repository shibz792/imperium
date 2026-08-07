import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import type { Role, User } from "@/generated/prisma/client";

export type CurrentUser = Pick<User, "id" | "name" | "email" | "role" | "phone" | "active" | "lastNotificationsSeenAt">;

// Roles that can see confidential fields (owner minimum price, internal legal
// notes, confidential contact/requirement notes) per spec §10 & §13.
export const CONFIDENTIAL_ROLES: Role[] = ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER", "FINANCE", "LEGAL"];

// Roles that can administer users, roles, locations, templates, audit logs.
export const ADMIN_ROLES: Role[] = ["SUPER_ADMIN"];

// Roles with full financial visibility (commission centre, pipeline value).
export const FINANCE_ROLES: Role[] = ["SUPER_ADMIN", "DIRECTOR", "FINANCE", "SALES_MANAGER"];

export { ROLE_LABELS } from "@/lib/roles";

// cache() de-dupes within a single request render pass.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const payload = verifySessionToken(token);
  if (!payload) return null;
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, name: true, email: true, role: true, phone: true, active: true, lastNotificationsSeenAt: true },
  });
  if (!user || !user.active) return null;
  return user;
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/command-centre?denied=1");
  return user;
}

export function canSeeConfidential(user: Pick<CurrentUser, "role">) {
  return CONFIDENTIAL_ROLES.includes(user.role as Role);
}

export function canSeeFinance(user: Pick<CurrentUser, "role">) {
  return FINANCE_ROLES.includes(user.role as Role);
}

export function isAdmin(user: Pick<CurrentUser, "role">) {
  return ADMIN_ROLES.includes(user.role as Role);
}
