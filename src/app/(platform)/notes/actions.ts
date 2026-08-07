"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

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
