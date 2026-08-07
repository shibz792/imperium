import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

// Files live outside `public/` on purpose — the only way to reach them is
// through the gated /api/documents/[id]/download route, which checks
// confidentiality + role before streaming bytes. Spec §13: "restricted
// document downloads" and "signed file links that expire".
const STORAGE_DIR = path.join(process.cwd(), "storage", "documents");

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-120);
}

export async function saveUploadedFile(file: File): Promise<{ storedName: string; originalName: string; size: number }> {
  await mkdir(STORAGE_DIR, { recursive: true });
  const storedName = `${crypto.randomUUID()}-${sanitize(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(STORAGE_DIR, storedName), buffer);
  return { storedName, originalName: file.name, size: buffer.byteLength };
}

export async function readStoredFile(storedName: string): Promise<Buffer> {
  const { readFile } = await import("node:fs/promises");
  return readFile(path.join(STORAGE_DIR, storedName));
}
