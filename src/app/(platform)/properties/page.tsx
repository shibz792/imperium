import Link from "next/link";
import { Plus, LayoutGrid, TableProperties } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { LISTING_STATUS_TONE } from "@/lib/badges";
import { formatCurrency, formatDate, titleCase, daysAgoDate } from "@/lib/format";
import { completenessScore, isStale, primarySize, relevantAskingPrice, priceUnit } from "@/lib/property";
import { ALL_DISTRICTS, PROPERTY_SUBTYPES } from "@/lib/locations";
import { PropertyCard } from "@/components/PropertyCard";
import { ClickableRow } from "@/components/ClickableRow";
import { Pagination } from "@/components/Pagination";
import { paginationParams, totalPages as computeTotalPages } from "@/lib/pagination";
import type { Prisma } from "@/generated/prisma/client";

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const where: Prisma.PropertyWhereInput = {};
  if (sp.category) where.category = sp.category as never;
  if (sp.transactionType) where.transactionType = sp.transactionType as never;
  if (sp.status) where.listingStatus = sp.status as never;
  if (sp.district) where.district = sp.district;
  if (sp.q) {
    where.OR = [
      { title: { contains: sp.q } },
      { propertyRef: { contains: sp.q } },
      { city: { contains: sp.q } },
      { subtype: { contains: sp.q } },
    ];
  }
  if (sp.stale === "1") {
    where.listingStatus = "ACTIVE";
    where.OR = [{ lastVerifiedDate: null }, { lastVerifiedDate: { lt: daysAgoDate(30) } }];
  }

  const { page, skip, take } = paginationParams(sp);
  const [properties, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: { assignedAgent: true, owner: true },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.property.count({ where }),
  ]);
  const pages = computeTotalPages(total);

  const view = sp.view === "cards" ? "cards" : "table";
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== "view" && v) as [string, string][]).toString();
  const withQs = (v: string) => `/properties?${qs ? qs + "&" : ""}view=${v}`;

  return (
    <div>
      <PageHeader
        eyebrow={`Properties · ${total}`}
        title="Property database"
        description="Every property for sale, rent, lease or investment: structured, verified and ready to match."
        actions={
          <>
            <div className="flex overflow-hidden rounded-[3px] border border-black/15">
              <Link href={withQs("table")} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium ${view === "table" ? "bg-ir-navy text-white" : "bg-white text-black/50 hover:text-ir-navy"}`}>
                <TableProperties size={13} /> Table
              </Link>
              <Link href={withQs("cards")} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium ${view === "cards" ? "bg-ir-navy text-white" : "bg-white text-black/50 hover:text-ir-navy"}`}>
                <LayoutGrid size={13} /> Cards
              </Link>
            </div>
            <Link href="/properties/new" className="ir-btn ir-btn-primary">
              <Plus size={15} /> New property
            </Link>
          </>
        }
      />

      <form className="ir-card mb-5 flex flex-wrap items-end gap-3 p-4" method="GET">
        <div className="min-w-[180px] flex-1">
          <label className="ir-label mb-1 block">Search</label>
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Title, reference, city…" className="ir-input" />
        </div>
        <div>
          <label className="ir-label mb-1 block">Category</label>
          <select name="category" defaultValue={sp.category ?? ""} className="ir-select">
            <option value="">All</option>
            {Object.keys(PROPERTY_SUBTYPES).map((c) => (
              <option key={c} value={c}>
                {titleCase(c)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="ir-label mb-1 block">Transaction</label>
          <select name="transactionType" defaultValue={sp.transactionType ?? ""} className="ir-select">
            <option value="">All</option>
            {["SALE", "RENT", "LEASE", "SHORT_TERM_RENTAL", "INVESTMENT", "JOINT_VENTURE", "DEVELOPMENT", "OFF_MARKET"].map((t) => (
              <option key={t} value={t}>
                {titleCase(t)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="ir-label mb-1 block">Status</label>
          <select name="status" defaultValue={sp.status ?? ""} className="ir-select">
            <option value="">All</option>
            {["DRAFT", "ACTIVE", "UNDER_OFFER", "RESERVED", "SOLD", "RENTED", "WITHDRAWN", "EXPIRED"].map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="ir-label mb-1 block">District</label>
          <select name="district" defaultValue={sp.district ?? ""} className="ir-select">
            <option value="">All</option>
            {ALL_DISTRICTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="ir-btn ir-btn-ghost">
          Filter
        </button>
        {(sp.q || sp.category || sp.transactionType || sp.status || sp.district || sp.stale) && (
          <Link href="/properties" className="text-xs text-black/40 hover:text-ir-navy">
            Clear
          </Link>
        )}
      </form>

      {properties.length === 0 ? (
        <EmptyState title="No properties match these filters" description="Try clearing filters, or add a new property record." />
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {properties.map((p) => (
            <PropertyCard key={p.id} property={p} />
          ))}
        </div>
      ) : (
        <div className="ir-card overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/8 text-[0.7rem] uppercase tracking-wide text-black/40">
                <th className="px-4 py-3 font-medium">Property</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Completeness</th>
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 font-medium">Verified</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => {
                const completeness = completenessScore(p);
                const stale = isStale(p);
                return (
                  <ClickableRow key={p.id} href={`/properties/${p.id}`} className="border-b border-black/6 last:border-0 hover:bg-black/[0.015]">
                    <td className="px-4 py-3">
                      <Link href={`/properties/${p.id}`} className="font-medium text-ir-navy hover:text-ir-gold-dark">
                        {p.title}
                      </Link>
                      <div className="mt-0.5 text-[0.7rem] text-black/40">
                        {p.propertyRef} · {primarySize(p) ?? "size tbc"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-black/70">
                      {p.subtype}
                      <div className="text-[0.7rem] text-black/40">{titleCase(p.transactionType)}</div>
                    </td>
                    <td className="px-4 py-3 text-black/70">{p.city ?? p.district ?? "-"}</td>
                    <td className="px-4 py-3 text-black/70">
                      {formatCurrency(relevantAskingPrice(p), p.currency)}
                      <span className="text-[0.7rem] text-black/40">{priceUnit(p)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <Badge tone={(LISTING_STATUS_TONE[p.listingStatus] as never) ?? "gray"}>{titleCase(p.listingStatus)}</Badge>
                        {stale && <Badge tone="red">Stale</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-black/8">
                          <div
                            className={`h-full rounded-full ${completeness.score >= 85 ? "bg-[color:var(--color-forest)]" : completeness.score >= 60 ? "bg-ir-gold" : "bg-[color:var(--color-brick)]"}`}
                            style={{ width: `${completeness.score}%` }}
                          />
                        </div>
                        <span className="text-[0.7rem] text-black/50">{completeness.score}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-black/60">{p.assignedAgent?.name ?? "-"}</td>
                    <td className="px-4 py-3 text-black/50">{formatDate(p.lastVerifiedDate)}</td>
                  </ClickableRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={pages} total={total} basePath="/properties" searchParams={sp} />
    </div>
  );
}
