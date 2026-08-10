"use client";

import { useState, useTransition } from "react";
import { UploadCloud, Loader2, TriangleAlert } from "lucide-react";
import { uploadPropertyPhotos } from "./actions";

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.82;

// Real phone-camera photos routinely run 3-12MB — well past Vercel's hard
// 4.5MB Serverless Function request body ceiling, a platform limit next.config
// can't raise. Every photo is downscaled and re-encoded client-side before
// it ever leaves the browser (this is also just good practice — a listing
// tile never needs a 12MB original), and each file goes up as its own
// request rather than bundled into one, so upload size is never a function
// of how many photos someone selects at once.
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file; // compression didn't actually help — keep the original
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // decode failed (e.g. an unsupported format) — let the server reject it with a clear message instead
  }
}

// A <label> wrapping a visually-hidden file input, not a div+onClick+ref —
// that keeps drag-and-drop AND plain click-to-choose AND keyboard (Tab,
// Enter/Space on the focused input) all working without extra JS wiring.
export function PropertyPhotoUploader({ propertyId }: { propertyId: string }) {
  const [pending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  function upload(fileList: FileList) {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setError(null);
    startTransition(async () => {
      setProgress({ done: 0, total: files.length });
      const errors: string[] = [];
      for (const file of files) {
        const compressed = await compressImage(file);
        const fd = new FormData();
        fd.append("files", compressed);
        const result = await uploadPropertyPhotos(propertyId, fd);
        if (!result.ok) errors.push(`${file.name}: ${result.error ?? "upload failed"}`);
        setProgress((p) => (p ? { done: p.done + 1, total: p.total } : p));
      }
      setProgress(null);
      if (errors.length) setError(errors.join(" · "));
    });
  }

  return (
    <div className="mb-4">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          upload(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded border-2 border-dashed p-8 text-center transition-colors ${
          dragOver ? "border-ir-gold bg-ir-gold/5" : "border-black/12 hover:border-black/25"
        }`}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={pending}
          onChange={(e) => {
            if (e.target.files) upload(e.target.files);
            e.target.value = "";
          }}
        />
        {pending ? <Loader2 size={20} className="animate-spin text-ir-gold-dark" /> : <UploadCloud size={20} className="text-black/30" />}
        <div className="text-sm font-medium text-ir-navy">
          {progress ? `Uploading ${progress.done}/${progress.total}…` : "Drop photos here, or click to choose"}
        </div>
        <div className="text-xs text-black/40">JPG, PNG or WEBP · resized automatically · saved to the company Google Drive</div>
      </label>
      {error && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-[color:var(--color-brick)]">
          <TriangleAlert size={12} className="shrink-0" /> {error}
        </div>
      )}
    </div>
  );
}
