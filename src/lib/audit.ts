import { prisma } from "@/lib/prisma";

// Every create/update/status-change that matters for compliance goes through
// here — spec §13 requires "full audit history" and §16 requires "all
// changes recorded in an audit history".
export async function writeAudit(opts: {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      userId: opts.userId ?? null,
      action: opts.action,
      entityType: opts.entityType,
      entityId: opts.entityId,
      before: opts.before === undefined ? undefined : (opts.before as object),
      after: opts.after === undefined ? undefined : (opts.after as object),
    },
  });
}

export async function logActivity(opts: {
  entityType: "property" | "requirement" | "deal" | "contact";
  propertyId?: string;
  requirementId?: string;
  dealId?: string;
  contactId?: string;
  type: string;
  message: string;
  userId?: string | null;
}) {
  await prisma.activity.create({
    data: {
      entityType: opts.entityType,
      propertyId: opts.propertyId,
      requirementId: opts.requirementId,
      dealId: opts.dealId,
      contactId: opts.contactId,
      type: opts.type,
      message: opts.message,
      userId: opts.userId ?? null,
    },
  });
}
