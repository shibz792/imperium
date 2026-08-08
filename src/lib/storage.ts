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

// ---------------------------------------------------------------------------
// Property photos — a separate, public bucket. Unlike documents, photos are
// rendered directly as <img> tags across property cards, list rows and
// galleries; going through the gated download route for every thumbnail
// would mean a signed-URL round trip per image. Photos aren't confidential
// (the same shots go out over WhatsApp anyway), so a public bucket with a
// permanent public URL is the right trade here, not a security gap.
// ---------------------------------------------------------------------------
const PHOTO_BUCKET = "property-photos";

export async function savePropertyPhoto(file: File): Promise<{ url: string; storedName: string }> {
  return savePhotoBuffer(Buffer.from(await file.arrayBuffer()), file.name, file.type);
}

export async function savePhotoBuffer(buffer: Buffer, originalName: string, contentType?: string): Promise<{ url: string; storedName: string }> {
  const storedName = `${crypto.randomUUID()}-${sanitize(originalName)}`;
  const { error } = await client()
    .storage.from(PHOTO_BUCKET)
    .upload(storedName, buffer, { contentType: contentType || "image/jpeg", upsert: false });
  if (error) throw new Error(`Photo upload failed: ${error.message}`);
  const { data } = client().storage.from(PHOTO_BUCKET).getPublicUrl(storedName);
  return { url: data.publicUrl, storedName };
}

export async function deletePropertyPhoto(storedName: string): Promise<void> {
  await client().storage.from(PHOTO_BUCKET).remove([storedName]);
}
