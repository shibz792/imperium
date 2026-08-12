"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star, Trash2, GripVertical, X, ChevronLeft, ChevronRight, Check, Loader2 } from "lucide-react";
import { setCoverPhoto, deletePropertyMedia, reorderPropertyMedia } from "./actions";
import { thumbUrl } from "@/lib/property";

export type MediaItem = { id: string; url: string; caption: string | null; isCover: boolean };

export function PropertyMediaGrid({ propertyId, media: initialMedia, canDelete }: { propertyId: string; media: MediaItem[]; canDelete: boolean }) {
  const router = useRouter();
  const [media, setMedia] = useState(initialMedia);
  // Reset local state when the server sends fresh props (e.g. after a
  // router.refresh()) rather than in a useEffect — see DealsKanban.tsx for
  // the same pattern and why.
  const [prevInitial, setPrevInitial] = useState(initialMedia);
  if (initialMedia !== prevInitial) {
    setPrevInitial(initialMedia);
    setMedia(initialMedia);
  }

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [settingCoverId, setSettingCoverId] = useState<string | null>(null);
  const [justSetCoverId, setJustSetCoverId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const cover = media.find((m) => m.isCover);
  const rest = media.filter((m) => !m.isCover);

  function handleDrop(targetId: string) {
    setDragOverId(null);
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null);
      return;
    }
    const fromIndex = rest.findIndex((m) => m.id === draggingId);
    const toIndex = rest.findIndex((m) => m.id === targetId);
    setDraggingId(null);
    if (fromIndex === -1 || toIndex === -1) return;
    const reordered = [...rest];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setMedia(cover ? [cover, ...reordered] : reordered);
    startTransition(() => {
      reorderPropertyMedia(propertyId, reordered.map((m) => m.id));
    });
  }

  async function makeCover(id: string) {
    setSettingCoverId(id);
    const target = media.find((m) => m.id === id);
    if (target) {
      // Optimistic — the whole point is instant, obvious feedback instead
      // of a silent re-sort with no confirmation at all.
      setMedia([{ ...target, isCover: true }, ...media.filter((m) => m.id !== id).map((m) => ({ ...m, isCover: false }))]);
    }
    const result = await setCoverPhoto(propertyId, id);
    setSettingCoverId(null);
    if (result.ok) {
      setJustSetCoverId(id);
      setTimeout(() => setJustSetCoverId(null), 2000);
    } else {
      router.refresh(); // roll back to server truth
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this photo? It'll be moved to the Drive trash, but removed from here immediately.")) return;
    setDeletingId(id);
    setMedia((m) => m.filter((x) => x.id !== id));
    if (lightboxIndex !== null) setLightboxIndex(null);
    await deletePropertyMedia(propertyId, id);
    setDeletingId(null);
    router.refresh(); // photo count in the section header lives in the server parent
  }

  const orderedForLightbox = media; // cover-first order, same as the grid
  const lightboxItem = lightboxIndex !== null ? orderedForLightbox[lightboxIndex] : null;

  useEffect(() => {
    if (lightboxIndex === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowLeft") setLightboxIndex((i) => (i === null ? null : (i - 1 + orderedForLightbox.length) % orderedForLightbox.length));
      if (e.key === "ArrowRight") setLightboxIndex((i) => (i === null ? null : (i + 1) % orderedForLightbox.length));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, orderedForLightbox.length]);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {media.map((m) => {
          const isDragOver = dragOverId === m.id && draggingId && draggingId !== m.id;
          return (
            <div
              key={m.id}
              className={`group relative ${draggingId === m.id ? "opacity-40" : ""} ${isDragOver ? "ring-2 ring-ir-gold" : ""}`}
              onDragOver={(e) => {
                if (!m.isCover && draggingId) {
                  e.preventDefault();
                  if (dragOverId !== m.id) setDragOverId(m.id);
                }
              }}
              onDragLeave={() => setDragOverId((id) => (id === m.id ? null : id))}
              onDrop={(e) => {
                if (m.isCover) return;
                e.preventDefault();
                handleDrop(m.id);
              }}
            >
              <button
                type="button"
                onClick={() => setLightboxIndex(media.findIndex((x) => x.id === m.id))}
                className="block w-full"
                title="View full size"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- server-resized via /api/drive-media */}
                <img src={thumbUrl(m.url)} alt={m.caption ?? ""} className="aspect-video w-full rounded border border-black/8 bg-ir-ivory object-cover" />
              </button>

              {m.isCover && (
                <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-ir-gold px-2 py-0.5 text-[0.65rem] font-semibold text-ir-navy">
                  <Star size={10} className="fill-current" /> Cover
                </span>
              )}
              {justSetCoverId === m.id && (
                <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-[color:var(--color-forest)] px-2 py-0.5 text-[0.65rem] font-semibold text-white">
                  <Check size={10} /> Cover set
                </span>
              )}

              {!m.isCover && (
                <span
                  draggable
                  onDragStart={(e) => {
                    setDraggingId(m.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setDragOverId(null);
                  }}
                  title="Drag to reorder"
                  className="absolute right-2 top-2 z-10 flex h-6 w-6 cursor-grab items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity hover:bg-black/60 focus-visible:opacity-100 active:cursor-grabbing group-hover:opacity-100"
                >
                  <GripVertical size={13} />
                </span>
              )}

              {/* Always visible, not hover-only — hover reveals don't exist
                  on touch devices, which made these unreachable on phone/tablet. */}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1.5 rounded-b bg-gradient-to-t from-black/70 to-transparent p-2 pt-5">
                {!m.isCover && (
                  <button
                    type="button"
                    onClick={() => makeCover(m.id)}
                    disabled={settingCoverId === m.id}
                    title="Set as cover photo"
                    className="flex h-7 items-center gap-1 rounded-full bg-black/40 px-2 text-[0.65rem] font-medium text-white hover:bg-black/60 disabled:opacity-50"
                  >
                    {settingCoverId === m.id ? <Loader2 size={12} className="animate-spin" /> : <Star size={12} />} Set as cover
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => remove(m.id)}
                    disabled={deletingId === m.id}
                    title="Delete photo"
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white hover:bg-[color:var(--color-brick)] disabled:opacity-50"
                  >
                    {deletingId === m.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {lightboxItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 sm:p-10" onClick={() => setLightboxIndex(null)}>
          <button type="button" onClick={() => setLightboxIndex(null)} className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
            <X size={18} />
          </button>
          {orderedForLightbox.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex((i) => (i === null ? null : (i - 1 + orderedForLightbox.length) % orderedForLightbox.length));
                }}
                className="absolute left-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex((i) => (i === null ? null : (i + 1) % orderedForLightbox.length));
                }}
                className="absolute right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}
          <div className="flex max-h-full max-w-full flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element -- full-size via /api/drive-media, no size hint */}
            <img src={lightboxItem.url} alt={lightboxItem.caption ?? ""} className="max-h-[75vh] max-w-full rounded object-contain" />
            <div className="flex items-center gap-2">
              {!lightboxItem.isCover && (
                <button type="button" onClick={() => makeCover(lightboxItem.id)} disabled={settingCoverId === lightboxItem.id} className="ir-btn ir-btn-ghost !border-white/20 !bg-white/10 !text-white hover:!bg-white/20">
                  {settingCoverId === lightboxItem.id ? <Loader2 size={13} className="animate-spin" /> : <Star size={13} />} Set as cover
                </button>
              )}
              {canDelete && (
                <button type="button" onClick={() => remove(lightboxItem.id)} disabled={deletingId === lightboxItem.id} className="ir-btn ir-btn-ghost !border-white/20 !bg-white/10 !text-white hover:!bg-[color:var(--color-brick)]">
                  {deletingId === lightboxItem.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
