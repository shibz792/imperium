"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, requireRole, ADMIN_ROLES } from "@/lib/auth";
import { nextContactRef } from "@/lib/refs";
import { writeAudit, logActivity } from "@/lib/audit";
import { deleteGuarded } from "@/lib/deleteGuard";
import type { BulkActionResult } from "@/lib/bulk";

function str(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

function buildContactData(fd: FormData) {
  return {
    name: str(fd, "name") ?? "Unnamed",
    capacity: (str(fd, "capacity") ?? "INDIVIDUAL") as never,
    companyName: str(fd, "companyName"),
    contactType: (str(fd, "contactType") ?? "BUYER") as never,
    phone: str(fd, "phone") ?? "",
    whatsapp: str(fd, "whatsapp") ?? str(fd, "phone"),
    email: str(fd, "email"),
    address: str(fd, "address"),
    city: str(fd, "city"),
    district: str(fd, "district"),
    source: str(fd, "source"),
    notes: str(fd, "notes"),
    confidentialNotes: str(fd, "confidentialNotes"),
  };
}

export async function createContact(formData: FormData) {
  const user = await requireUser();
  const data = buildContactData(formData);
  const contact = await prisma.contact.create({
    data: { ...data, contactRef: await nextContactRef(), assignedAgentId: str(formData, "assignedAgentId") ?? user.id } as never,
  });
  await writeAudit({ userId: user.id, action: "CREATE", entityType: "contact", entityId: contact.id, after: data });
  revalidatePath("/contacts");
  redirect(`/contacts/${contact.id}`);
}

export async function updateContact(id: string, formData: FormData) {
  const user = await requireUser();
  const before = await prisma.contact.findUniqueOrThrow({ where: { id } });
  const data = buildContactData(formData);
  const assignedAgentId = str(formData, "assignedAgentId") ?? before.assignedAgentId;

  // Warn + block, per spec: a contact flagged as not working with a
  // specific agent can't be assigned to that agent, full stop — not just a
  // note someone might miss.
  if (assignedAgentId && assignedAgentId !== before.assignedAgentId) {
    const excluded = await prisma.contactAgentExclusion.findUnique({ where: { contactId_agentId: { contactId: id, agentId: assignedAgentId } } });
    if (excluded) redirect(`/contacts/${id}/edit?error=excluded-agent`);
  }

  await prisma.contact.update({ where: { id }, data: { ...data, assignedAgentId } as never });
  await writeAudit({ userId: user.id, action: "UPDATE", entityType: "contact", entityId: id, before, after: data });
  if (assignedAgentId !== before.assignedAgentId) {
    const agent = assignedAgentId ? await prisma.user.findUnique({ where: { id: assignedAgentId }, select: { name: true } }) : null;
    await logActivity({ entityType: "contact", contactId: id, type: "REASSIGNED", message: `${user.name} reassigned this contact to ${agent?.name ?? "unassigned"}.`, userId: user.id });
  }
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${id}`);
  redirect(`/contacts/${id}`);
}

export async function deleteContact(id: string) {
  const admin = await requireRole(ADMIN_ROLES);
  const result = await deleteGuarded(() => prisma.contact.delete({ where: { id } }), "requirements, deals or viewings linked to this contact");
  if (!result.ok) redirect(`/contacts/${id}?deleteError=${encodeURIComponent(result.error)}`);

  await writeAudit({ userId: admin.id, action: "DELETE", entityType: "contact", entityId: id });
  revalidatePath("/contacts");
  redirect("/contacts");
}

// ---------------------------------------------------------------------------
// Bulk actions — same gating conventions as the single-row actions above.
// ---------------------------------------------------------------------------

export async function bulkDeleteContacts(ids: string[]): Promise<BulkActionResult> {
  const admin = await requireRole(ADMIN_ROLES);
  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];

  await Promise.all(
    ids.map(async (id) => {
      const result = await deleteGuarded(() => prisma.contact.delete({ where: { id } }), "requirements, deals or viewings linked to this contact");
      if (!result.ok) {
        failed.push({ id, error: result.error });
        return;
      }
      await writeAudit({ userId: admin.id, action: "DELETE", entityType: "contact", entityId: id });
      succeeded.push(id);
    }),
  );

  if (succeeded.length) revalidatePath("/contacts");
  return { succeeded, failed };
}

export async function bulkChangeContactType(ids: string[], contactType: string): Promise<BulkActionResult> {
  const user = await requireUser();
  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];

  await Promise.all(
    ids.map(async (id) => {
      try {
        await prisma.contact.update({ where: { id }, data: { contactType: contactType as never } });
        await writeAudit({ userId: user.id, action: "TYPE_CHANGE", entityType: "contact", entityId: id, after: { contactType } });
        await logActivity({ entityType: "contact", contactId: id, type: "TYPE_CHANGE", message: `${user.name} changed contact type to ${contactType} (bulk update).`, userId: user.id });
        succeeded.push(id);
      } catch (e) {
        failed.push({ id, error: e instanceof Error ? e.message : "Update failed." });
      }
    }),
  );

  if (succeeded.length) {
    revalidatePath("/contacts");
    succeeded.forEach((id) => revalidatePath(`/contacts/${id}`));
  }
  return { succeeded, failed };
}

export async function bulkReassignContactAgent(ids: string[], agentId: string): Promise<BulkActionResult> {
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
        // Warn + block, per spec — checked per contact since an exclusion
        // is specific to one contact/agent pairing, not global.
        const excluded = await prisma.contactAgentExclusion.findUnique({ where: { contactId_agentId: { contactId: id, agentId } } });
        if (excluded) {
          failed.push({ id, error: `This contact has flagged they don't work with ${agent.name}.` });
          return;
        }
        const before = await prisma.contact.findUnique({ where: { id }, select: { assignedAgentId: true } });
        await prisma.contact.update({ where: { id }, data: { assignedAgentId: agentId } });
        await writeAudit({ userId: user.id, action: "REASSIGN", entityType: "contact", entityId: id, before: { assignedAgentId: before?.assignedAgentId }, after: { assignedAgentId: agentId } });
        await logActivity({ entityType: "contact", contactId: id, type: "REASSIGNED", message: `${user.name} reassigned this contact to ${agent.name} (bulk update).`, userId: user.id });
        succeeded.push(id);
      } catch (e) {
        failed.push({ id, error: e instanceof Error ? e.message : "Update failed." });
      }
    }),
  );

  if (succeeded.length) revalidatePath("/contacts");
  return { succeeded, failed };
}

// ---------------------------------------------------------------------------
// Interaction log — a manual, timestamped record of contact with this
// person (a call, a WhatsApp exchange, a meeting), reusing the same
// Activity model/logActivity() every other entity's history feed is built
// on rather than inventing a parallel system.
// ---------------------------------------------------------------------------

const INTERACTION_TYPES = ["CALL", "WHATSAPP", "EMAIL", "MEETING", "OTHER"] as const;

export async function logContactInteraction(contactId: string, formData: FormData) {
  const user = await requireUser();
  const type = str(formData, "type") ?? "OTHER";
  const message = str(formData, "message");
  if (!message) return;
  const kind = (INTERACTION_TYPES as readonly string[]).includes(type) ? type : "OTHER";
  await logActivity({ entityType: "contact", contactId, type: kind, message, userId: user.id });
  revalidatePath(`/contacts/${contactId}`);
}

// ---------------------------------------------------------------------------
// "Doesn't work with this agent" — a real, specific fact worth recording,
// not silently dropped. Enforced (not just displayed) at updateContact and
// bulkReassignContactAgent above.
// ---------------------------------------------------------------------------

export async function addContactAgentExclusion(contactId: string, formData: FormData) {
  const user = await requireUser();
  const agentId = str(formData, "agentId");
  if (!agentId) return;
  const reason = str(formData, "reason");
  const agent = await prisma.user.findUniqueOrThrow({ where: { id: agentId }, select: { name: true } });
  await prisma.contactAgentExclusion.upsert({
    where: { contactId_agentId: { contactId, agentId } },
    create: { contactId, agentId, reason, createdById: user.id },
    update: { reason, createdById: user.id },
  });
  await writeAudit({ userId: user.id, action: "EXCLUDE_AGENT", entityType: "contact", entityId: contactId, after: { agentId, reason } });
  await logActivity({ entityType: "contact", contactId, type: "AGENT_EXCLUDED", message: `${user.name} flagged that this contact doesn't work with ${agent.name}${reason ? ` (${reason})` : ""}.`, userId: user.id });
  revalidatePath(`/contacts/${contactId}`);
}

export async function removeContactAgentExclusion(contactId: string, agentId: string) {
  const user = await requireUser();
  await prisma.contactAgentExclusion.deleteMany({ where: { contactId, agentId } });
  await writeAudit({ userId: user.id, action: "UNEXCLUDE_AGENT", entityType: "contact", entityId: contactId, after: { agentId } });
  revalidatePath(`/contacts/${contactId}`);
}
