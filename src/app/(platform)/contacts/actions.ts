"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, requireRole, ADMIN_ROLES } from "@/lib/auth";
import { nextContactRef } from "@/lib/refs";
import { writeAudit } from "@/lib/audit";
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
  await prisma.contact.update({ where: { id }, data: { ...data, assignedAgentId: str(formData, "assignedAgentId") ?? before.assignedAgentId } as never });
  await writeAudit({ userId: user.id, action: "UPDATE", entityType: "contact", entityId: id, before, after: data });
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
// Only writeAudit (not logActivity) is used, matching every other Contact
// action here — logActivity's entityType union has no "contact" case.
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
        const before = await prisma.contact.findUnique({ where: { id }, select: { assignedAgentId: true } });
        await prisma.contact.update({ where: { id }, data: { assignedAgentId: agentId } });
        await writeAudit({ userId: user.id, action: "REASSIGN", entityType: "contact", entityId: id, before: { assignedAgentId: before?.assignedAgentId }, after: { assignedAgentId: agentId } });
        succeeded.push(id);
      } catch (e) {
        failed.push({ id, error: e instanceof Error ? e.message : "Update failed." });
      }
    }),
  );

  if (succeeded.length) revalidatePath("/contacts");
  return { succeeded, failed };
}
