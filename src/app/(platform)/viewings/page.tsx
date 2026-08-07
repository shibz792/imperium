import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { VIEWING_STATUS_TONE } from "@/lib/badges";
import { formatDateTime, titleCase } from "@/lib/format";
import { updateViewingStatus, submitFeedback } from "./actions";

export default async function ViewingsPage() {
  const viewings = await prisma.viewing.findMany({
    include: { property: true, contact: true, agent: true },
    orderBy: { scheduledAt: "desc" },
  });

  const upcoming = viewings.filter((v) => v.scheduledAt >= new Date() && v.status !== "CANCELLED" && v.status !== "COMPLETED");
  const past = viewings.filter((v) => !upcoming.includes(v));

  return (
    <div>
      <PageHeader
        eyebrow={`Viewings · ${viewings.length}`}
        title="Viewings"
        description="Schedule inspections, assign agents and capture feedback."
        actions={<Link href="/viewings/new" className="ir-btn ir-btn-primary"><Plus size={15} /> Schedule viewing</Link>}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-ir-navy">Upcoming ({upcoming.length})</h2>
          {upcoming.length === 0 ? (
            <EmptyState title="No upcoming viewings" />
          ) : (
            <div className="space-y-3">
              {upcoming.map((v) => (
                <div key={v.id} className="ir-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link href={`/properties/${v.propertyId}`} className="text-sm font-medium text-ir-navy hover:text-ir-gold-dark">{v.property.title}</Link>
                      <div className="mt-0.5 text-xs text-black/45">{v.contact.name} · {v.agent?.name ?? "unassigned"}</div>
                      <div className="mt-0.5 text-xs text-black/45">{formatDateTime(v.scheduledAt)}</div>
                    </div>
                    <Badge tone={(VIEWING_STATUS_TONE[v.status] as never) ?? "gray"}>{titleCase(v.status)}</Badge>
                  </div>
                  <div className="mt-2.5 flex gap-1.5">
                    {v.status === "SCHEDULED" && (
                      <form action={updateViewingStatus.bind(null, v.id, "CONFIRMED")}><button className="ir-btn ir-btn-ghost !py-1 !text-[0.7rem]">Confirm</button></form>
                    )}
                    <form action={updateViewingStatus.bind(null, v.id, "CANCELLED")}><button className="ir-btn ir-btn-ghost !py-1 !text-[0.7rem]">Cancel</button></form>
                    <form action={updateViewingStatus.bind(null, v.id, "NO_SHOW")}><button className="ir-btn ir-btn-ghost !py-1 !text-[0.7rem]">No-show</button></form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-ir-navy">Past & feedback ({past.length})</h2>
          {past.length === 0 ? (
            <EmptyState title="No past viewings" />
          ) : (
            <div className="space-y-3">
              {past.map((v) => (
                <div key={v.id} className="ir-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link href={`/properties/${v.propertyId}`} className="text-sm font-medium text-ir-navy hover:text-ir-gold-dark">{v.property.title}</Link>
                      <div className="mt-0.5 text-xs text-black/45">{v.contact.name} · {formatDateTime(v.scheduledAt)}</div>
                    </div>
                    <Badge tone={(VIEWING_STATUS_TONE[v.status] as never) ?? "gray"}>{titleCase(v.status)}</Badge>
                  </div>
                  {v.feedbackNotes ? (
                    <p className="mt-2 text-xs text-black/60">&ldquo;{v.feedbackNotes}&rdquo; {v.feedbackRating && `(${v.feedbackRating}/5)`}</p>
                  ) : v.status !== "CANCELLED" && v.status !== "NO_SHOW" ? (
                    <form action={submitFeedback.bind(null, v.id)} className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <select name="feedbackRating" className="ir-select !w-20 !py-1 !text-xs">
                        {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}/5</option>)}
                      </select>
                      <input name="feedbackNotes" placeholder="Feedback notes…" className="ir-input !flex-1 !py-1 !text-xs" />
                      <button type="submit" className="ir-btn ir-btn-gold !py-1 !text-[0.7rem]">Save feedback</button>
                    </form>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
