"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { saveUploadedFile } from "@/lib/storage";
import { writeAudit, logActivity } from "@/lib/audit";

function str(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

export async function uploadDocument(formData: FormData) {
  const user = await requireUser();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("No file selected");

  const { storedName, originalName } = await saveUploadedFile(file);
  const propertyId = str(formData, "propertyId");
  const contactId = str(formData, "contactId");

  const doc = await prisma.document.create({
    data: {
      propertyId,
      contactId,
      name: str(formData, "name") ?? originalName,
      category: (str(formData, "category") ?? "OTHER") as never,
      fileUrl: storedName,
      confidential: formData.get("confidential") === "on",
      uploadedById: user.id,
    },
  });

  await writeAudit({ userId: user.id, action: "UPLOAD", entityType: "document", entityId: doc.id });
  if (propertyId) await logActivity({ entityType: "property", propertyId, type: "DOCUMENT_UPLOADED", message: `${user.name} uploaded ${doc.name}.`, userId: user.id });

  revalidatePath("/documents");
  if (propertyId) revalidatePath(`/properties/${propertyId}`);
}
