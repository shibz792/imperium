"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { nextContactRef } from "@/lib/refs";
import { writeAudit } from "@/lib/audit";

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
