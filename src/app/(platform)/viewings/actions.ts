"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, requireRole, ADMIN_ROLES } from "@/lib/auth";
import { writeAudit, logActivity } from "@/lib/audit";
import { createCalendarEvent, deleteCalendarEvent, freeBusy } from "@/lib/google";
import { deleteGuarded } from "@/lib/deleteGuard";

const VIEWING_DURATION_MS = 45 * 60_000;

function str(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

export async function scheduleViewing(formData: FormData) {
  const user = await requireUser();
  const propertyId = str(formData, "propertyId")!;
  const contactId = str(formData, "contactId")!;
  const scheduledAt = new Date(String(formData.get("scheduledAt")));
  const agentId = str(formData, "agentId") ?? user.id;
  const windowEnd = new Date(scheduledAt.getTime() + VIEWING_DURATION_MS);

  // Checked before creating so a conflict can be surfaced without blocking
  // the booking — the agent may want it anyway (double-booked viewings
  // happen; the CRM shouldn't be the thing that refuses to let you).
  const busy = await freeBusy(agentId, scheduledAt, windowEnd);
  const conflict = Boolean(busy?.some((b) => new Date(b.start) < windowEnd && new Date(b.end) > scheduledAt));

  const [property, contact] = await Promise.all([
    prisma.property.findUnique({ where: { id: propertyId }, select: { title: true, address: true, city: true } }),
    prisma.contact.findUnique({ where: { id: contactId }, select: { name: true, phone: true } }),
  ]);

  const viewing = await prisma.viewing.create({
    data: { propertyId, contactId, dealId: str(formData, "dealId"), agentId, scheduledAt, status: "SCHEDULED" },
  });

  const googleEventId = await createCalendarEvent(agentId, {
    title: `Viewing: ${property?.title ?? "Property"}`,
    description: `With ${contact?.name ?? "contact"}${contact?.phone ? ` (${contact.phone})` : ""}.`,
    location: [property?.address, property?.city].filter(Boolean).join(", ") || undefined,
    start: scheduledAt,
    end: windowEnd,
  });
  if (googleEventId) await prisma.viewing.update({ where: { id: viewing.id }, data: { googleEventId } });

  await logActivity({ entityType: "property", propertyId, type: "VIEWING_SCHEDULED", message: `${user.name} scheduled a viewing.`, userId: user.id });
  revalidatePath("/viewings");
  revalidatePath("/command-centre");
  redirect(`/viewings${conflict ? "?conflict=1" : ""}`);
}

export async function updateViewingStatus(id: string, status: string) {
  const user = await requireUser();
  const viewing = await prisma.viewing.update({ where: { id }, data: { status: status as never } });
  if (status === "CANCELLED" && viewing.googleEventId && viewing.agentId) {
    await deleteCalendarEvent(viewing.agentId, viewing.googleEventId);
    await prisma.viewing.update({ where: { id }, data: { googleEventId: null } });
  }
  await logActivity({ entityType: "property", propertyId: viewing.propertyId, type: "VIEWING_STATUS", message: `${user.name} marked a viewing as ${status.toLowerCase().replace("_", " ")}.`, userId: user.id });
  revalidatePath("/viewings");
}

export async function submitFeedback(id: string, formData: FormData) {
  const user = await requireUser();
  const rating = Number(formData.get("feedbackRating")) || undefined;
  const notes = str(formData, "feedbackNotes");
  const viewing = await prisma.viewing.update({ where: { id }, data: { feedbackRating: rating, feedbackNotes: notes, status: "COMPLETED" } });
  await logActivity({ entityType: "property", propertyId: viewing.propertyId, type: "VIEWING_FEEDBACK", message: `${user.name} logged viewing feedback${rating ? ` (${rating}/5)` : ""}.`, userId: user.id });
  revalidatePath("/viewings");
}

export async function deleteViewing(id: string) {
  const admin = await requireRole(ADMIN_ROLES);
  const viewing = await prisma.viewing.findUnique({ where: { id } });
  if (!viewing) return;
  if (viewing.googleEventId && viewing.agentId) await deleteCalendarEvent(viewing.agentId, viewing.googleEventId);

  const result = await deleteGuarded(() => prisma.viewing.delete({ where: { id } }), "records still tied to this viewing");
  if (!result.ok) redirect(`/viewings?deleteError=${encodeURIComponent(result.error)}`);

  await writeAudit({ userId: admin.id, action: "DELETE", entityType: "viewing", entityId: id });
  revalidatePath("/viewings");
  redirect("/viewings");
}
