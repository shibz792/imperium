import Link from "next/link";
import { Trash2, Building2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { PageHeader, EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { createNote, deleteNote } from "./actions";

const CAN_DELETE_ANY = ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER"];

export default async function NotesPage() {
  const user = await requireUser();
  const [notes, properties] = await Promise.all([
    prisma.note.findMany({ include: { author: true, property: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.property.findMany({ orderBy: { title: "asc" }, select: { id: true, title: true, propertyRef: true } }),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow={`Notes · ${notes.length}`}
        title="Notes"
        description="A plain scratchpad. Jot something down, optionally attach it to a property so it turns up there too."
      />

      <form action={createNote} className="ir-card mb-6 p-5">
        <label className="ir-label mb-1.5 block">New note</label>
        <textarea name="content" required rows={3} placeholder="Type a note…" className="ir-input" />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="min-w-[240px]">
            <label className="ir-label mb-1 block">Attach to a property (optional)</label>
            <select name="propertyId" defaultValue="" className="ir-select">
              <option value="">Not linked to a property</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.propertyRef} · {p.title}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="ir-btn ir-btn-primary ml-auto self-end">
            Add note
          </button>
        </div>
      </form>

      {notes.length === 0 ? (
        <EmptyState title="No notes yet" description="Whatever you don't want to forget goes here." />
      ) : (
        <div className="space-y-3">
          {notes.map((n) => (
            <div key={n.id} className="ir-card p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ir-navy">{n.content}</p>
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-black/6 pt-2.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-black/40">
                  <span>
                    {n.author?.name ?? "Unknown"} · {formatDateTime(n.createdAt)}
                  </span>
                  {n.property && (
                    <Link href={`/properties/${n.property.id}`} className="ir-badge inline-flex items-center gap-1 border-ir-gold/40 bg-ir-gold/10 text-ir-gold-dark hover:bg-ir-gold/20">
                      <Building2 size={11} /> {n.property.title}
                    </Link>
                  )}
                </div>
                {(n.authorId === user.id || CAN_DELETE_ANY.includes(user.role)) && (
                  <form action={deleteNote.bind(null, n.id)}>
                    <button type="submit" title="Delete note" className="flex h-6 w-6 items-center justify-center rounded text-black/25 hover:bg-black/[0.05] hover:text-[color:var(--color-brick)]">
                      <Trash2 size={13} />
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
