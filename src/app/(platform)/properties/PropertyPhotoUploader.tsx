"use client";

import { useState, useTransition } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import { uploadPropertyPhotos } from "./actions";

// A <label> wrapping a visually-hidden file input, not a div+onClick+ref —
// that keeps drag-and-drop AND plain click-to-choose AND keyboard (Tab,
// Enter/Space on the focused input) all working without extra JS wiring.
export function PropertyPhotoUploader({ propertyId }: { propertyId: string }) {
  const [pending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState(false);

  function upload(files: FileList) {
    if (files.length === 0) return;
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("files", f);
    startTransition(() => {
      uploadPropertyPhotos(propertyId, fd);
    });
  }

  return (
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
      className={`mb-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded border-2 border-dashed p-8 text-center transition-colors ${
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
      <div className="text-sm font-medium text-ir-navy">{pending ? "Uploading…" : "Drop photos here, or click to choose"}</div>
      <div className="text-xs text-black/40">JPG, PNG or WEBP · multiple at once</div>
    </label>
  );
}
