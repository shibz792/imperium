"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { suggestFromNote } from "@/lib/notesAi";
import type { TaskDraftFields } from "@/lib/intake-types";

const CAN_DELETE_ANY = ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER"];

function str(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

export async function createNote(formData: FormData) {
  const user = await requireUser();
  const content = str(formData, "content");
  if (!content) return;
  const propertyId = str(formData, "propertyId");

  await prisma.note.create({
    data: { content, propertyId, authorId: user.id },
  });

  revalidatePath("/notes");
  if (propertyId) revalidatePath(`/properties/${propertyId}`);
}

export async function deleteNote(id: string) {
  const user = await requireUser();
  const note = await prisma.note.findUnique({ where: { id } });
  if (!note) return;
  if (note.authorId !== user.id && !CAN_DELETE_ANY.includes(user.role)) {
    throw new Error("You can only delete your own notes.");
  }

  await prisma.note.delete({ where: { id } });
  revalidatePath("/notes");
  if (note.propertyId) revalidatePath(`/properties/${note.propertyId}`);
}

// On demand only — never run automatically on note creation. Returns [] for
// "analyzed, nothing worth suggesting" (a normal outcome) vs null for
// "Groq isn't configured", so the UI can tell those two apart.
export async function analyzeNote(noteId: string) {
  await requireUser();
  const note = await prisma.note.findUniqueOrThrow({ where: { id: noteId } });
  return suggestFromNote(note.content);
}

// Mirrors createTask (src/app/(platform)/tasks/actions.ts) rather than
// forking new create logic — the one difference is the assignee: a
// self-approved suggestion defaults to whoever's approving it, not
// unassigned, since it's someone acting on their own note.
export async function approveTaskFromNote(noteId: string, fields: TaskDraftFields) {
  const user = await requireUser();
  const note = await prisma.note.findUniqueOrThrow({ where: { id: noteId } });
  if (!fields.title || !fields.dueAt) return;

  const task = await prisma.task.create({
    data: {
      title: fields.title,
      type: (fields.type ?? "CUSTOM") as never,
      dueAt: new Date(fields.dueAt),
      assignedToId: user.id,
      createdById: user.id,
      relatedEntityType: note.propertyId ? "property" : undefined,
      relatedEntityId: note.propertyId ?? undefined,
    },
  });

  revalidatePath("/notes");
  revalidatePath("/tasks");
  if (note.propertyId) revalidatePath(`/properties/${note.propertyId}`);
  return { id: task.id };
}
