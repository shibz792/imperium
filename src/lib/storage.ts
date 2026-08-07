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
  const storedName = `${crypto.randomUUID()}-${sanitize(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await client()
    .storage.from(BUCKET)
    .upload(storedName, buffer, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return { storedName, originalName: file.name, size: buffer.byteLength };
}

export async function readStoredFile(storedName: string): Promise<Buffer> {
  const { data, error } = await client().storage.from(BUCKET).download(storedName);
  if (error) throw new Error(`Download failed: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}
