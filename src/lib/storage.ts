import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// Files live in a private Supabase Storage bucket, not `public/` — the only
// way to reach them is through the gated /api/documents/[id]/download route,
// which checks confidentiality + role before streaming bytes. Spec §13:
// "restricted document downloads" and "signed file links that expire".
// service_role bypasses the bucket's own access rules on purpose: this app
// does its own auth/confidentiality check in the download route already,
// so the bucket itself stays locked down to server-side access only.
const BUCKET = "documents";

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set — document storage is unavailable.");
  return createClient(url, key);
}

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-120);
}

export async function saveUploadedFile(file: File): Promise<{ storedName: string; originalName: string; size: number }> {
  return saveDocumentBuffer(Buffer.from(await file.arrayBuffer()), file.name, file.type);
}

// Same as saveUploadedFile, but from bytes already in hand (a Drive import)
// rather than a browser File — the two upload sources share this bottom half.
export async function saveDocumentBuffer(buffer: Buffer, originalName: string, contentType?: string): Promise<{ storedName: string; originalName: string; size: number }> {
  const storedName = `${crypto.randomUUID()}-${sanitize(originalName)}`;
  const { error } = await client()
    .storage.from(BUCKET)
    .upload(storedName, buffer, { contentType: contentType || "application/octet-stream", upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return { storedName, originalName, size: buffer.byteLength };
}

export async function readStoredFile(storedName: string): Promise<Buffer> {
  const { data, error } = await client().storage.from(BUCKET).download(storedName);
  if (error) throw new Error(`Download failed: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

// Best-effort — a Document row should never fail to delete just because
// the underlying Supabase object is already gone or the bucket call
// errors; the DB row is the source of truth for the app, storage cleanup
// is just tidying up after it, never blocking it.
export async function deleteStoredFile(storedName: string): Promise<void> {
  await client()
    .storage.from(BUCKET)
    .remove([storedName])
    .catch(() => {});
}

// Property photos used to live in a separate public Supabase bucket here.
// They now live in the company's shared Google Drive instead (see
// lib/google.ts's uploadToPropertyFolder / streamPropertyPhoto) — nowhere
// else, per how that storage is meant to work. A handful of photos
// uploaded before that change still point at the old bucket and keep
// working; nothing new is written there.
