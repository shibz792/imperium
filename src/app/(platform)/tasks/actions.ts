"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from "@/lib/google";

const CAN_DELETE_ANY = ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER"];
const DAY = 86_400_000;
const TASK_BLOCK_MS = 30 * 60_000; // a task on the calendar is a 30-minute placeholder, not a real meeting
// "property" doesn't naively pluralize to its own route segment ("propertys").
const ENTITY_PATH: Record<string, string> = { property: "/properties", requirement: "/requirements", contact: "/contacts" };
function entityPath(type: string | null, id: string | null): string | null {
  if (!type || !id || !ENTITY_PATH[type]) return null;
  return `${ENTITY_PATH[type]}/${id}`;
}

function str(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

export async function createTask(formData: FormData) {
  const user = await requireUser();
  const title = str(formData, "title");
  const dueAtRaw = str(formData, "dueAt");
  if (!title || !dueAtRaw) return;

  // The "link to" select posts a single combined value ("property:<id>" /
  // "requirement:<id>" / "") rather than two separate fields — one control
  // to reason about instead of a kind-select plus a dependent id-select.
  const link = str(formData, "link");
  const [relatedEntityType, relatedEntityId] = link ? link.split(":") : [undefined, undefined];
  const dueAt = new Date(dueAtRaw);
  const assignedToId = str(formData, "assignedToId") ?? null;

  const task = await prisma.task.create({
    data: {
      title,
      type: (str(formData, "type") ?? "CUSTOM") as never,
      dueAt,
      assignedToId,
      relatedEntityType,
      relatedEntityId,
      createdById: user.id,
    },
  });

  if (assignedToId) {
    const googleEventId = await createCalendarEvent(assignedToId, { title, start: dueAt, end: new Date(dueAt.getTime() + TASK_BLOCK_MS) });
    if (googleEventId) await prisma.task.update({ where: { id: task.id }, data: { googleEventId } });
  }

  revalidatePath("/tasks");
  const path = entityPath(relatedEntityType ?? null, relatedEntityId ?? null);
  if (path) revalidatePath(path);
}

export async function setTaskStatus(id: string, status: "OPEN" | "DONE" | "SNOOZED") {
  await requireUser();
  const task = await prisma.task.update({ where: { id }, data: { status } });

  // Done means it's off the calendar too — a finished task showing up as an
  // upcoming event is more confusing than having no event at all.
  if (status === "DONE" && task.googleEventId && task.assignedToId) {
    await deleteCalendarEvent(task.assignedToId, task.googleEventId);
    await prisma.task.update({ where: { id }, data: { googleEventId: null } });
  } else if (status === "OPEN" && !task.googleEventId && task.assignedToId) {
    const googleEventId = await createCalendarEvent(task.assignedToId, { title: task.title, start: task.dueAt, end: new Date(task.dueAt.getTime() + TASK_BLOCK_MS) });
    if (googleEventId) await prisma.task.update({ where: { id }, data: { googleEventId } });
  }

  revalidatePath("/tasks");
  const path = entityPath(task.relatedEntityType, task.relatedEntityId);
  if (path) revalidatePath(path);
}

export async function snoozeTask(id: string, days: number) {
  await requireUser();
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return;
  const dueAt = new Date(task.dueAt.getTime() + days * DAY);
  await prisma.task.update({ where: { id }, data: { dueAt, status: "OPEN" } });

  if (task.googleEventId && task.assignedToId) {
    await updateCalendarEvent(task.assignedToId, task.googleEventId, { title: task.title, start: dueAt, end: new Date(dueAt.getTime() + TASK_BLOCK_MS) });
  }
  revalidatePath("/tasks");
}

export async function deleteTask(id: string) {
  const user = await requireUser();
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return;
  if (task.createdById !== user.id && task.assignedToId !== user.id && !CAN_DELETE_ANY.includes(user.role)) {
    throw new Error("You can only delete tasks you created or are assigned to.");
  }
  if (task.googleEventId && task.assignedToId) await deleteCalendarEvent(task.assignedToId, task.googleEventId);
  await prisma.task.delete({ where: { id } });
  revalidatePath("/tasks");
  const path = entityPath(task.relatedEntityType, task.relatedEntityId);
  if (path) revalidatePath(path);
}
