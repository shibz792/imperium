import Link from "next/link";
import { CalendarClock, CheckCircle2, ClipboardList, FileWarning, Radar, TrendingUp } from "lucide-react";
import { Badge, EmptyState } from "@/components/ui";
import { GridPattern } from "@/components/GridPattern";
import { getDashboardData } from "@/lib/queries/dashboard";
import { requireUser, canSeeFinance } from "@/lib/auth";
import { formatCurrency, formatDate, formatDateTime, daysAgo as daysAgoFn } from "@/lib/format";
import { VIEWING_STATUS_TONE } from "@/lib/badges";

export default async function CommandCentrePage() {
  const user = await requireUser();
  const data = await getDashboardData();
  const showFinance = canSeeFinance(user);

  const ledgerStats = showFinance
    ? [
        { label: "New properties (7d)", value: data.newProperties, href: "/properties" },
        { label: "New requirements (7d)", value: data.newRequirements, href: "/requirements" },
        { label: "Matches awaiting review", value: data.matchesAwaitingReview, accent: true, href: "/matchmaker" },
        { label: "Open deals", value: data.openDealsCount, href: "/deals" },
      ]
    : [
        { label: "New properties (7d)", value: data.newProperties, href: "/properties" },
        { label: "New requirements (7d)", value: data.newRequirements, href: "/requirements" },
        { label: "Stale listings", value: data.staleListings.length, href: "/properties?stale=1" },
        { label: "Offers awaiting action", value: data.pendingOffers.length, href: "/deals" },
      ];

  return (
    <div>
      {/* Hero — the one dark, high-drama moment on this page. Everything
          below is quiet by comparison; see README §6. */}
      <div className="relative mb-5 overflow-hidden rounded-[3px] bg-ir-navy px-7 py-9 sm:px-10">
        <GridPattern opacity={0.05} />
        <div className="relative flex flex-wrap items-end justify-between gap-8">
          <div>
            <div className="ir-label mb-2.5 !text-ir-gold/80">
              Command Centre · {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long" })}
            </div>
            <h1 className="ir-editorial text-[2.5rem] leading-[1.05] text-white sm:text-[2.9rem]">
              Good {greeting()}, {user.name.split(" ")[0]}
            </h1>
            <p className="mt-2.5 max-w-md text-sm text-white/45">Every property, requirement, match and deal in one operating view.</p>
          </div>
          <div className="flex flex-wrap gap-x-10 gap-y-4">
            {showFinance ? (
              <>
                <HeroFigure label="Pipeline value" value={formatCurrency(data.pipelineValue)} href="/deals" />
                <HeroFigure label="Expected commission" value={formatCurrency(data.expectedCommission)} accent href="/commissions" />
              </>
            ) : (
              <>
                <HeroFigure label="Open deals" value={String(data.openDealsCount)} href="/deals" />
                <HeroFigure label="Matches awaiting review" value={String(data.matchesAwaitingReview)} accent href="/matchmaker" />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Ledger strip — one continuous row, not four separate boxed cards. */}
      <div className="ir-card mb-6 flex flex-wrap overflow-hidden">
        {ledgerStats.map((s, i) => (
          <Link key={s.label} href={s.href} className={`min-w-[150px] flex-1 px-6 py-4 hover:bg-black/[0.015] ${i > 0 ? "border-l border-black/[0.07]" : ""}`}>
            <div className="ir-label mb-1.5">{s.label}</div>
            <div className={`ir-figure text-2xl ${s.accent ? "text-ir-gold-dark" : "text-ir-navy"}`}>{s.value}</div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Today's tasks */}
        <section className="ir-card p-5 lg:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 ir-label !text-ir-navy/70">
              <CheckCircle2 size={14} className="text-ir-gold-dark" /> Today&apos;s tasks
            </h2>
            <Badge tone="gray">{data.openTasks.length}</Badge>
          </div>
          {data.openTasks.length === 0 ? (
            <p className="py-6 text-center text-xs text-black/40">Nothing due today. Well done.</p>
          ) : (
            <ul className="space-y-2.5">
              {data.openTasks.map((t) => {
                const overdue = t.dueAt < new Date();
                const href = entityHref(t.relatedEntityType, t.relatedEntityId);
                const row = (
                  <>
                    <div>
                      <div className={`text-[0.8125rem] leading-snug ${href ? "text-ir-navy hover:text-ir-gold-dark" : "text-ir-navy"}`}>{t.title}</div>
                      <div className="mt-0.5 text-[0.7rem] text-black/40">{t.assignedTo?.name ?? "Unassigned"}</div>
                    </div>
                    <Badge tone={overdue ? "red" : "amber"}>{overdue ? "Overdue" : formatDate(t.dueAt)}</Badge>
                  </>
                );
                return (
                  <li key={t.id} className="border-b border-black/6 pb-2.5 last:border-0 last:pb-0">
                    {href ? (
                      <Link href={href} className="flex items-start justify-between gap-3">
                        {row}
                      </Link>
                    ) : (
                      <div className="flex items-start justify-between gap-3">{row}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <Link href="/deals" className="mt-4 inline-block text-xs font-medium text-ir-gold-dark hover:underline">
            View full task list →
          </Link>
        </section>

        {/* Upcoming viewings */}
        <section className="ir-card p-5 lg:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 ir-label !text-ir-navy/70">
              <CalendarClock size={14} className="text-ir-gold-dark" /> Upcoming viewings
            </h2>
            <Badge tone="gray">{data.upcomingViewings.length}</Badge>
          </div>
          {data.upcomingViewings.length === 0 ? (
            <p className="py-6 text-center text-xs text-black/40">No viewings scheduled.</p>
          ) : (
            <ul className="space-y-2.5">
              {data.upcomingViewings.map((v) => (
                <li key={v.id} className="border-b border-black/6 pb-2.5 last:border-0 last:pb-0">
                  <Link href={`/properties/${v.propertyId}`} className="block">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-[0.8125rem] leading-snug text-ir-navy hover:text-ir-gold-dark">{v.property.title}</div>
                      <Badge tone={(VIEWING_STATUS_TONE[v.status] as never) ?? "gray"}>{v.status}</Badge>
                    </div>
                    <div className="mt-0.5 text-[0.7rem] text-black/40">
                      {formatDateTime(v.scheduledAt)} · {v.contact.name} · {v.agent?.name ?? "unassigned"}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/viewings" className="mt-4 inline-block text-xs font-medium text-ir-gold-dark hover:underline">
            View all viewings →
          </Link>
        </section>

        {/* Offers awaiting action */}
        <section className="ir-card p-5 lg:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 ir-label !text-ir-navy/70">
              <FileWarning size={14} className="text-ir-gold-dark" /> Offers awaiting action
            </h2>
            <Badge tone="gray">{data.pendingOffers.length}</Badge>
          </div>
          {data.pendingOffers.length === 0 ? (
            <p className="py-6 text-center text-xs text-black/40">No open offers.</p>
          ) : (
            <ul className="space-y-2.5">
              {data.pendingOffers.map((o) => (
                <li key={o.id} className="border-b border-black/6 pb-2.5 last:border-0 last:pb-0">
                  <Link href={`/deals/${o.dealId}`} className="block">
                    <div className="text-[0.8125rem] leading-snug text-ir-navy hover:text-ir-gold-dark">{o.deal.property.title}</div>
                    <div className="mt-0.5 flex items-center justify-between text-[0.7rem] text-black/40">
                      <span>
                        {o.deal.client.name} · {formatCurrency(o.amount)}
                      </span>
                      <span>{daysAgoFn(o.createdAt)}d ago</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/deals" className="mt-4 inline-block text-xs font-medium text-ir-gold-dark hover:underline">
            Go to pipeline →
          </Link>
        </section>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Demand hotspots */}
        <section className="ir-card p-5 lg:col-span-1">
          <h2 className="mb-3 flex items-center gap-2 ir-label !text-ir-navy/70">
            <TrendingUp size={14} className="text-ir-gold-dark" /> Demand hotspots
          </h2>
          {data.hotspots.length === 0 ? (
            <EmptyState title="No active demand signal yet" />
          ) : (
            <ul className="space-y-2">
              {data.hotspots.map((h) => (
                <li key={h.location}>
                  <Link href={`/requirements?location=${encodeURIComponent(h.location)}`} className="flex items-center gap-3">
                    <div className="w-28 shrink-0 truncate text-[0.8125rem] text-ir-navy hover:text-ir-gold-dark">{h.location}</div>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/6">
                      <div
                        className="h-full rounded-full bg-ir-gold"
                        style={{ width: `${Math.min(100, (h.count / data.hotspots[0].count) * 100)}%` }}
                      />
                    </div>
                    <div className="w-6 shrink-0 text-right text-[0.75rem] tabular-nums text-black/50">{h.count}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/analytics" className="mt-4 inline-block text-xs font-medium text-ir-gold-dark hover:underline">
            Full demand heatmap →
          </Link>
        </section>

        {/* Stale listings */}
        <section className="ir-card p-5 lg:col-span-1">
          <h2 className="mb-3 flex items-center gap-2 ir-label !text-ir-navy/70">
            <ClipboardList size={14} className="text-ir-gold-dark" /> Stale listings
          </h2>
          {data.staleListings.length === 0 ? (
            <p className="py-6 text-center text-xs text-black/40">All active listings recently verified.</p>
          ) : (
            <ul className="space-y-2.5">
              {data.staleListings.slice(0, 6).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 border-b border-black/6 pb-2 last:border-0">
                  <Link href={`/properties/${p.id}`} className="truncate text-[0.8125rem] text-ir-navy hover:text-ir-gold-dark">
                    {p.title}
                  </Link>
                  <span className="shrink-0 text-[0.7rem] text-black/40">
                    {p.lastVerifiedDate ? `${daysAgoFn(p.lastVerifiedDate)}d ago` : "never verified"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/properties?stale=1" className="mt-4 inline-block text-xs font-medium text-ir-gold-dark hover:underline">
            Review all stale listings →
          </Link>
        </section>

        {/* Recent activity */}
        <section className="ir-card p-5 lg:col-span-1">
          <h2 className="mb-3 flex items-center gap-2 ir-label !text-ir-navy/70">
            <Radar size={14} className="text-ir-gold-dark" /> Recent activity
          </h2>
          {data.recentActivity.length === 0 ? (
            <EmptyState title="No activity yet" />
          ) : (
            <ul className="space-y-2.5">
              {data.recentActivity.map((a) => {
                const href = a.propertyId ? `/properties/${a.propertyId}` : a.requirementId ? `/requirements/${a.requirementId}` : a.dealId ? `/deals/${a.dealId}` : null;
                const body = (
                  <>
                    <span className={href ? "text-ir-navy hover:text-ir-gold-dark" : "text-ir-navy"}>{a.message}</span>
                    <div className="mt-0.5 text-[0.7rem] text-black/40">
                      {a.user?.name ?? "System"} · {formatDateTime(a.createdAt)}
                    </div>
                  </>
                );
                return (
                  <li key={a.id} className="border-b border-black/6 pb-2.5 text-[0.8125rem] leading-snug last:border-0">
                    {href ? <Link href={href}>{body}</Link> : body}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function HeroFigure({ label, value, accent = false, href }: { label: string; value: string; accent?: boolean; href: string }) {
  return (
    <Link href={href} className="block">
      <div className="ir-label mb-1.5 !text-white/35">{label}</div>
      <div className={`ir-figure text-3xl sm:text-4xl ${accent ? "text-ir-gold" : "text-white"}`}>{value}</div>
    </Link>
  );
}

// Task.relatedEntityType/relatedEntityId are loose, unenforced string
// references (no FK) — resolve to a real link only for the entity types
// this app actually has detail pages for, and only when both are set.
function entityHref(type: string | null, id: string | null): string | null {
  if (!type || !id) return null;
  const prefix: Record<string, string> = { property: "/properties", requirement: "/requirements", deal: "/deals", contact: "/contacts" };
  const base = prefix[type.toLowerCase()];
  return base ? `${base}/${id}` : null;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}
