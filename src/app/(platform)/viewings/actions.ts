"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/audit";

function str(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

export async function scheduleViewing(formData: FormData) {
  const user = await requireUser();
  const propertyId = str(formData, "propertyId")!;
  const contactId = str(formData, "contactId")!;
  const scheduledAt = new Date(String(formData.get("scheduledAt")));

  await prisma.viewing.create({
    data: {
      propertyId,
      contactId,
      dealId: str(formData, "dealId"),
      agentId: str(formData, "agentId") ?? user.id,
      scheduledAt,
      status: "SCHEDULED",
    },
  });

  await logActivity({ entityType: "property", propertyId, type: "VIEWING_SCHEDULED", message: `${user.name} scheduled a viewing.`, userId: user.id });
  revalidatePath("/viewings");
  revalidatePath("/command-centre");
  redirect("/viewings");
}

export async function updateViewingStatus(id: string, status: string) {
  const user = await requireUser();
  const viewing = await prisma.viewing.update({ where: { id }, data: { status: status as never } });
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
