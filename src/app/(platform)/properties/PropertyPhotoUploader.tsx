"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Loader2, TriangleAlert, Check, RotateCcw, X } from "lucide-react";
import { uploadPropertyPhoto } from "./actions";

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.82;
// A small pool, not strictly sequential — cuts real wall-clock time for a
// typical 10-20 photo batch significantly, while staying well short of
// anything that would look like a burst/abuse pattern to Drive's API.
const CONCURRENCY = 3;

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

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;
  async function next(): Promise<void> {
    const index = cursor++;
    if (index >= items.length) return;
    await worker(items[index]);
    return next();
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
}

type FileState = {
  id: string;
  file: File;
  name: string;
  previewUrl: string;
  status: "queued" | "compressing" | "uploading" | "done" | "error";
  error?: string;
  asCover: boolean;
};

// A <label> wrapping a visually-hidden file input, not a div+onClick+ref —
// that keeps drag-and-drop AND plain click-to-choose AND keyboard (Tab,
// Enter/Space on the focused input) all working without extra JS wiring.
export function PropertyPhotoUploader({ propertyId, hasExistingPhotos }: { propertyId: string; hasExistingPhotos: boolean }) {
  const router = useRouter();
  const [dragOver, setDragOver] = useState(false);
  const [queue, setQueue] = useState<FileState[]>([]);

  function upload(fileList: FileList) {
    const files = Array.from(fileList).filter((f) => f.size > 0);
    if (files.length === 0) return;
    // Only the very first file of the very first batch this component ever
    // sends, when the gallery was genuinely empty beforehand, claims cover
    // — decided once, client-side, so no two parallel uploads can ever
    // both think they're "the first photo" (see uploadPropertyPhoto's own
    // comment on why this can't safely be decided server-side per-file).
    const claimCover = !hasExistingPhotos && queue.length === 0;
    const items: FileState[] = files.map((file, i) => ({
      id: `${Date.now()}-${i}-${file.name}`,
      file,
      name: file.name,
      previewUrl: URL.createObjectURL(file),
      status: "queued",
      asCover: claimCover && i === 0,
    }));
    setQueue((q) => [...q, ...items]);
    runBatch(items);
  }

  function runBatch(items: FileState[]) {
    runWithConcurrency(items, CONCURRENCY, async (item) => {
      setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "compressing" } : x)));
      const compressed = await compressImage(item.file);
      setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "uploading" } : x)));
      const fd = new FormData();
      fd.append("file", compressed);
      if (item.asCover) fd.append("asCover", "true");
      const result = await uploadPropertyPhoto(propertyId, fd);
      setQueue((q) => q.map((x) => (x.id === item.id ? (result.ok ? { ...x, status: "done" } : { ...x, status: "error", error: result.error }) : x)));
    }).then(() => router.refresh());
  }

  function retry(item: FileState) {
    setQueue((q) => q.map((x) => (x.id === item.id ? { ...x, status: "queued", error: undefined } : x)));
    runBatch([item]);
  }

  function dismiss(id: string) {
    setQueue((q) => q.filter((x) => x.id !== id));
  }

  const busy = queue.some((x) => x.status === "queued" || x.status === "compressing" || x.status === "uploading");

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
          onChange={(e) => {
            if (e.target.files) upload(e.target.files);
            e.target.value = "";
          }}
        />
        {busy ? <Loader2 size={20} className="animate-spin text-ir-gold-dark" /> : <UploadCloud size={20} className="text-black/30" />}
        <div className="text-sm font-medium text-ir-navy">Drop photos here, or click to choose</div>
        <div className="text-xs text-black/40">JPG, PNG or WEBP · resized automatically · saved to the company Google Drive</div>
      </label>

      {queue.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {queue.map((item) => (
            <div key={item.id} className="relative overflow-hidden rounded border border-black/10">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview, not a static import */}
              <img src={item.previewUrl} alt="" className="aspect-square w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/60 px-1.5 py-1 text-[0.6rem] text-white">
                <span className="truncate">{item.name}</span>
                {item.status === "done" && <Check size={11} className="shrink-0 text-emerald-400" />}
                {(item.status === "queued" || item.status === "compressing" || item.status === "uploading") && (
                  <Loader2 size={11} className="shrink-0 animate-spin" />
                )}
              </div>
              {item.status === "error" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/75 p-1.5 text-center">
                  <TriangleAlert size={13} className="text-[color:var(--color-bronze)]" />
                  <span className="line-clamp-2 text-[0.6rem] text-white/90">{item.error ?? "Upload failed"}</span>
                  <button type="button" onClick={() => retry(item)} className="flex items-center gap-0.5 rounded bg-white/15 px-1.5 py-0.5 text-[0.6rem] text-white hover:bg-white/25">
                    <RotateCcw size={10} /> Retry
                  </button>
                </div>
              )}
              {item.status === "done" && (
                <button type="button" onClick={() => dismiss(item.id)} title="Dismiss" className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70">
                  <X size={10} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
