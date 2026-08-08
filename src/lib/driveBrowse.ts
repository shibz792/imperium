"use server";

import { requireUser } from "@/lib/auth";
import { listDriveFiles, type DriveFile } from "@/lib/google";

// Thin "use server" wrapper so the client-side Drive browser can call
// listDriveFiles without a dedicated API route — the browser modal itself
// lives wherever it's embedded (property Media tab, Document Vault), but
// browsing is the same call everywhere.
export async function browseDrive(folderId?: string): Promise<{ files: DriveFile[]; nextPageToken?: string } | { error: string }> {
  const user = await requireUser();
  const result = await listDriveFiles(user.id, { folderId });
  if (!result) return { error: "Google Drive isn't connected — connect it from Settings first." };
  return result;
}
