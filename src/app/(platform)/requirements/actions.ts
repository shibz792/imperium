"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, requireRole, ADMIN_ROLES } from "@/lib/auth";
import { nextRequirementRef, nextContactRef } from "@/lib/refs";
import { writeAudit, logActivity } from "@/lib/audit";
import { deleteGuarded } from "@/lib/deleteGuard";
import { scoreMatch } from "@/lib/match";
import { buildClientDigest, buildBrokerBroadcast } from "@/lib/requirementMarketing";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { sendEmail } from "@/lib/email";
import type { BulkActionResult } from "@/lib/bulk";

function str(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}
function num(fd: FormData, key: string): number | undefined {
  const v = str(fd, key);
  if (v === undefined) return undefined;
  const n = Number(v.replace(/,/g, ""));
  return Number.isNaN(n) ? undefined : n;
}
function date(fd: FormData, key: string): Date | undefined {
  const v = str(fd, key);
  return v ? new Date(v) : undefined;
}
function list(fd: FormData, key: string): string[] {
  const v = str(fd, key);
  if (!v) return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}
function featureList(fd: FormData): Record<string, boolean> {
  const raw = fd.getAll("requiredFeatures");
  const out: Record<string, boolean> = {};
  for (const f of raw) if (typeof f === "string") out[f] = true;
  return out;
}

async function resolveClient(fd: FormData, agentId: string): Promise<string> {
  const existing = str(fd, "clientId");
  if (existing) return existing;
  const name = str(fd, "clientNewName") ?? "New client";
  const phone = str(fd, "clientNewPhone") ?? "";
  const contact = await prisma.contact.create({
    data: {
      contactRef: await nextContactRef(),
      name,
      contactType: str(fd, "clientContactType") === "TENANT" ? "TENANT" : "BUYER",
      phone,
      whatsapp: phone,
      assignedAgentId: agentId,
      source: "Requirement intake",
    },
  });
  return contact.id;
}

function buildRequirementData(fd: FormData) {
  return {
    type: (str(fd, "type") ?? "BUYER") as never,
    companyName: str(fd, "companyName"),
    decisionMaker: str(fd, "decisionMaker"),
    title: str(fd, "title") ?? "Untitled requirement",
    dealType: (str(fd, "dealType") ?? "BUY") as never,
    category: (str(fd, "category") ?? "RESIDENTIAL") as never,
    subtype: str(fd, "subtype"),
    preferredLocationsJson: list(fd, "preferredLocations"),
    acceptableSurroundingJson: list(fd, "acceptableSurrounding"),
    budgetMin: num(fd, "budgetMin"),
    budgetMax: num(fd, "budgetMax"),
    sizeMin: num(fd, "sizeMin"),
    sizeMax: num(fd, "sizeMax"),
    requiredFeaturesJson: featureList(fd),
    intendedUse: str(fd, "intendedUse"),
    deadline: date(fd, "deadline"),
    financingStatus: (str(fd, "financingStatus") ?? "UNCONFIRMED") as never,
    decisionStage: str(fd, "decisionStage"),
    urgency: (str(fd, "urgency") ?? "MEDIUM") as never,
    quality: (str(fd, "quality") ?? "UNVERIFIED") as never,
    source: str(fd, "source"),
    nextAction: str(fd, "nextAction"),
    nextActionDate: date(fd, "nextActionDate"),
    confidentialNotes: str(fd, "confidentialNotes"),
    expiryDate: date(fd, "expiryDate"),
    status: (str(fd, "status") ?? "NEW") as never,
  };
}

function collaboratorIds(fd: FormData): string[] {
  return fd.getAll("collaboratorIds").filter((v): v is string => typeof v === "string" && v.length > 0);
}

export async function createRequirement(formData: FormData) {
  const user = await requireUser();
  const clientId = await resolveClient(formData, user.id);
  const data = buildRequirementData(formData);

  const requirement = await prisma.requirement.create({
    data: {
      ...data,
      requirementRef: await nextRequirementRef(),
      clientId,
      assignedAgentId: str(formData, "assignedAgentId") ?? user.id,
      lastContacted: new Date(),
      collaborators: { connect: collaboratorIds(formData).map((id) => ({ id })) },
    } as never,
  });

  await writeAudit({ userId: user.id, action: "CREATE", entityType: "requirement", entityId: requirement.id, after: data });
  await logActivity({ entityType: "requirement", requirementId: requirement.id, type: "CREATED", message: `${user.name} created this requirement.`, userId: user.id });

  revalidatePath("/requirements");
  redirect(`/requirements/${requirement.id}`);
}

export async function updateRequirement(id: string, formData: FormData) {
  const user = await requireUser();
  const before = await prisma.requirement.findUniqueOrThrow({ where: { id } });
  const clientId = str(formData, "clientId");
  const data = buildRequirementData(formData);

  await prisma.requirement.update({
    where: { id },
    data: {
      ...data,
      clientId: clientId ?? before.clientId,
      assignedAgentId: str(formData, "assignedAgentId") ?? before.assignedAgentId,
      collaborators: { set: collaboratorIds(formData).map((id) => ({ id })) },
    } as never,
  });

  await writeAudit({ userId: user.id, action: "UPDATE", entityType: "requirement", entityId: id, before, after: data });
  await logActivity({ entityType: "requirement", requirementId: id, type: "UPDATED", message: `${user.name} updated this requirement.`, userId: user.id });

  revalidatePath("/requirements");
  revalidatePath(`/requirements/${id}`);
  redirect(`/requirements/${id}`);
}

export async function reconfirmRequirement(id: string) {
  const user = await requireUser();
  await prisma.requirement.update({ where: { id }, data: { lastContacted: new Date() } });
  await logActivity({ entityType: "requirement", requirementId: id, type: "RECONFIRMED", message: `${user.name} reconfirmed this requirement is still active.`, userId: user.id });
  await writeAudit({ userId: user.id, action: "RECONFIRM", entityType: "requirement", entityId: id });
  revalidatePath(`/requirements/${id}`);
  revalidatePath("/requirements");
}

export async function changeRequirementStatus(id: string, status: string) {
  const user = await requireUser();
  await prisma.requirement.update({ where: { id }, data: { status: status as never } });
  await logActivity({ entityType: "requirement", requirementId: id, type: "STATUS", message: `${user.name} changed status to ${status.replace("_", " ")}.`, userId: user.id });
  await writeAudit({ userId: user.id, action: "STATUS_CHANGE", entityType: "requirement", entityId: id, after: { status } });
  revalidatePath(`/requirements/${id}`);
  revalidatePath("/requirements");
}

export async function deleteRequirement(id: string) {
  const admin = await requireRole(ADMIN_ROLES);
  const result = await deleteGuarded(() => prisma.requirement.delete({ where: { id } }), "deals or matches on this requirement");
  if (!result.ok) redirect(`/requirements/${id}?deleteError=${encodeURIComponent(result.error)}`);

  await writeAudit({ userId: admin.id, action: "DELETE", entityType: "requirement", entityId: id });
  revalidatePath("/requirements");
  redirect("/requirements");
}

// ---------------------------------------------------------------------------
// Bulk actions — same gating conventions as the single-row equivalents
// above (delete stays admin-only via deleteGuarded; status/reassign stay
// open to any signed-in viewer of this list). See properties/actions.ts's
// bulk actions for the identical pattern this mirrors.
// ---------------------------------------------------------------------------

export async function bulkDeleteRequirements(ids: string[]): Promise<BulkActionResult> {
  const admin = await requireRole(ADMIN_ROLES);
  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];

  await Promise.all(
    ids.map(async (id) => {
      const result = await deleteGuarded(() => prisma.requirement.delete({ where: { id } }), "deals or matches on this requirement");
      if (!result.ok) {
        failed.push({ id, error: result.error });
        return;
      }
      await writeAudit({ userId: admin.id, action: "DELETE", entityType: "requirement", entityId: id });
      succeeded.push(id);
    }),
  );

  if (succeeded.length) revalidatePath("/requirements");
  return { succeeded, failed };
}

export async function bulkChangeRequirementStatus(ids: string[], status: string): Promise<BulkActionResult> {
  const user = await requireUser();
  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];

  await Promise.all(
    ids.map(async (id) => {
      try {
        await prisma.requirement.update({ where: { id }, data: { status: status as never } });
        await logActivity({ entityType: "requirement", requirementId: id, type: "STATUS", message: `${user.name} changed status to ${status.replace("_", " ")} (bulk update).`, userId: user.id });
        await writeAudit({ userId: user.id, action: "STATUS_CHANGE", entityType: "requirement", entityId: id, after: { status } });
        succeeded.push(id);
      } catch (e) {
        failed.push({ id, error: e instanceof Error ? e.message : "Update failed." });
      }
    }),
  );

  if (succeeded.length) {
    revalidatePath("/requirements");
    succeeded.forEach((id) => revalidatePath(`/requirements/${id}`));
  }
  return { succeeded, failed };
}

export async function bulkReassignRequirementAgent(ids: string[], agentId: string): Promise<BulkActionResult> {
  const user = await requireUser();
  const agent = await prisma.user.findUnique({ where: { id: agentId }, select: { name: true, active: true } });
  if (!agent?.active) {
    return { succeeded: [], failed: ids.map((id) => ({ id, error: "Selected agent is not valid or inactive." })) };
  }

  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];

  await Promise.all(
    ids.map(async (id) => {
      try {
        const before = await prisma.requirement.findUnique({ where: { id }, select: { assignedAgentId: true } });
        await prisma.requirement.update({ where: { id }, data: { assignedAgentId: agentId } });
        await logActivity({ entityType: "requirement", requirementId: id, type: "REASSIGNED", message: `${user.name} reassigned this requirement to ${agent.name} (bulk update).`, userId: user.id });
        await writeAudit({ userId: user.id, action: "REASSIGN", entityType: "requirement", entityId: id, before: { assignedAgentId: before?.assignedAgentId }, after: { assignedAgentId: agentId } });
        succeeded.push(id);
      } catch (e) {
        failed.push({ id, error: e instanceof Error ? e.message : "Update failed." });
      }
    }),
  );

  if (succeeded.length) revalidatePath("/requirements");
  return { succeeded, failed };
}

// ---------------------------------------------------------------------------
// Requirement marketing — the other half of Marketing Studio: reaching out
// on a requirement's behalf, not just a property's. See lib/requirementMarketing.ts.
// ---------------------------------------------------------------------------

// "Send matches to client" — reuses scoreMatch (lib/match.ts), the exact
// engine Matchmaker and the property-side matched-audience panel already
// run on, just aimed the other direction (best properties for this one
// requirement, not best requirements for one property).
export async function clientDigestPreview(requirementId: string): Promise<{ message: string; clientPhone: string; clientEmail: string | null; matchCount: number } | { message: null }> {
  await requireUser();
  const requirement = await prisma.requirement.findUniqueOrThrow({ where: { id: requirementId }, include: { client: true } });
  const properties = await prisma.property.findMany({ where: { listingStatus: "ACTIVE" } });
  const topMatches = properties
    .map((p) => ({ property: p, result: scoreMatch(p, requirement) }))
    .filter((m): m is { property: (typeof properties)[number]; result: NonNullable<ReturnType<typeof scoreMatch>> } => m.result !== null && m.result.score >= 60)
    .sort((a, b) => b.result.score - a.result.score)
    .slice(0, 5)
    .map((m) => m.property);

  if (topMatches.length === 0 || !requirement.client.phone) return { message: null };
  const message = await buildClientDigest(requirement, topMatches);
  return { message, clientPhone: requirement.client.phone, clientEmail: requirement.client.email, matchCount: topMatches.length };
}

export type BrokerContact = { id: string; name: string; phone: string; email: string | null };

export async function brokerBroadcastPreview(requirementId: string): Promise<{ message: string; brokers: BrokerContact[] }> {
  await requireUser();
  const [requirement, brokers] = await Promise.all([
    prisma.requirement.findUniqueOrThrow({ where: { id: requirementId } }),
    prisma.contact.findMany({ where: { contactType: "BROKER" }, select: { id: true, name: true, phone: true, email: true } }),
  ]);
  const message = await buildBrokerBroadcast(requirement);
  return { message, brokers: brokers.filter((b) => b.phone) };
}

export async function sendRequirementWhatsApp(phone: string, content: string) {
  await requireUser();
  return sendWhatsAppMessage(phone, content);
}

export async function sendRequirementEmail(email: string, subject: string, body: string) {
  await requireUser();
  return sendEmail(email, subject, body);
}
