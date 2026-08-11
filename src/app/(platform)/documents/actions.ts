"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, requireRole, ADMIN_ROLES } from "@/lib/auth";
import { saveUploadedFile, saveDocumentBuffer, deleteStoredFile } from "@/lib/storage";
import { downloadDriveFile } from "@/lib/google";
import { writeAudit, logActivity } from "@/lib/audit";
import { deleteGuarded } from "@/lib/deleteGuard";
import type { BulkActionResult } from "@/lib/bulk";

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

export async function importDocumentsFromDrive(fileIds: string[]) {
  const user = await requireUser();
  for (const fileId of fileIds) {
    const file = await downloadDriveFile(user.id, fileId);
    if (!file) continue; // Google-native (Docs/Sheets/Slides) or download failed — skip, not fatal
    const { storedName } = await saveDocumentBuffer(file.buffer, file.name, file.mimeType);
    const doc = await prisma.document.create({
      data: { name: file.name, category: "OTHER", fileUrl: storedName, confidential: false, uploadedById: user.id },
    });
    await writeAudit({ userId: user.id, action: "UPLOAD", entityType: "document", entityId: doc.id });
  }
  revalidatePath("/documents");
}

// ---------------------------------------------------------------------------
// Bulk actions — for the multi-select toolbar on the Document Vault list.
// Delete is admin-only (matching every other entity's delete convention in
// this app, even though no single-row delete button exists yet for
// Documents); category change is open to any signed-in viewer, matching
// uploadDocument's own requireUser() gating. No reassign action —
// Document has no assignee/owner field (only uploadedById, a historical
// "who uploaded it" fact, not a routing field like assignedAgentId on the
// other entities), so there's nothing to reassign.
// ---------------------------------------------------------------------------

export async function bulkDeleteDocuments(ids: string[]): Promise<BulkActionResult> {
  const admin = await requireRole(ADMIN_ROLES);
  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];

  await Promise.all(
    ids.map(async (id) => {
      const doc = await prisma.document.findUnique({ where: { id }, select: { fileUrl: true } });
      if (!doc) {
        succeeded.push(id); // already gone — not a failure
        return;
      }
      const result = await deleteGuarded(() => prisma.document.delete({ where: { id } }), "other records referencing this document");
      if (!result.ok) {
        failed.push({ id, error: result.error });
        return;
      }
      await deleteStoredFile(doc.fileUrl); // best-effort, never blocks the DB delete above
      await writeAudit({ userId: admin.id, action: "DELETE", entityType: "document", entityId: id });
      succeeded.push(id);
    }),
  );

  if (succeeded.length) revalidatePath("/documents");
  return { succeeded, failed };
}

export async function bulkChangeDocumentCategory(ids: string[], category: string): Promise<BulkActionResult> {
  const user = await requireUser();
  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];

  await Promise.all(
    ids.map(async (id) => {
      try {
        await prisma.document.update({ where: { id }, data: { category: category as never } });
        await writeAudit({ userId: user.id, action: "CATEGORY_CHANGE", entityType: "document", entityId: id, after: { category } });
        succeeded.push(id);
      } catch (e) {
        failed.push({ id, error: e instanceof Error ? e.message : "Update failed." });
      }
    }),
  );

  if (succeeded.length) revalidatePath("/documents");
  return { succeeded, failed };
}
