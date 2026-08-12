import Link from "next/link";
import { ImageOff, ExternalLink, Clock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { ALL_DISTRICTS } from "@/lib/locations";
import type { Prisma } from "@/generated/prisma/client";
import { RegisteredListingActions } from "./RegisteredListingActions";

const SOURCE_LABEL: Record<string, string> = { ikman: "ikman.lk", lankapropertyweb: "LankaPropertyWeb" };
const DEAL_TYPE_LABEL: Record<string, string> = { BUY: "Buy", RENT: "Rent", LEASE: "Lease" };

// Every ad link an agent has deliberately registered from External Sourcing
// — never mixed with /properties. A row here only ever becomes a real
// Property through the explicit "Promote" action (see
// RegisteredListingActions), which is a human decision, not a side effect
// of having looked at the ad.
export async function RegisteredListings({ searchParams: sp }: { searchParams: Record<string, string | undefined> }) {
  const where: Prisma.SourcedListingWhereInput = {};
  if (sp.source) where.source = sp.source;
  if (sp.district) where.district = sp.district;
  if (sp.dealType) where.dealType = sp.dealType;
  if (sp.status === "promoted") where.promotedPropertyId = { not: null };
  else if (sp.status === "unpromoted") where.promotedPropertyId = null;
  if (sp.q) where.title = { contains: sp.q, mode: "insensitive" };

  const orderBy: Prisma.SourcedListingOrderByWithRelationInput =
    sp.sort === "oldest" ? { createdAt: "asc" } :
    sp.sort === "price-asc" ? { priceValue: "asc" } :
    sp.sort === "price-desc" ? { priceValue: "desc" } :
    { createdAt: "desc" };

  const listings = await prisma.sourcedListing.findMany({
    where,
    orderBy,
    include: { registeredBy: { select: { name: true } }, promotedProperty: { select: { id: true, propertyRef: true } } },
  });

  const hasFilters = !!(sp.source || sp.district || sp.dealType || sp.status || sp.q || sp.sort);

  return (
    <div>
      <form className="ir-card mb-5 flex flex-wrap items-end gap-3 p-4" method="GET">
        <input type="hidden" name="tab" value="registered" />
        <div className="min-w-[180px] flex-1">
          <label className="ir-label mb-1 block">Search</label>
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Title…" className="ir-input" />
        </div>
        <div>
          <label className="ir-label mb-1 block">Source</label>
          <select name="source" defaultValue={sp.source ?? ""} className="ir-select">
            <option value="">Any</option>
            <option value="ikman">ikman.lk</option>
            <option value="lankapropertyweb">LankaPropertyWeb</option>
          </select>
        </div>
        <div>
          <label className="ir-label mb-1 block">District</label>
          <select name="district" defaultValue={sp.district ?? ""} className="ir-select">
            <option value="">Any</option>
            {ALL_DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="ir-label mb-1 block">Deal type</label>
          <select name="dealType" defaultValue={sp.dealType ?? ""} className="ir-select">
            <option value="">Any</option>
            <option value="BUY">Buy</option>
            <option value="RENT">Rent</option>
            <option value="LEASE">Lease</option>
          </select>
        </div>
        <div>
          <label className="ir-label mb-1 block">Status</label>
          <select name="status" defaultValue={sp.status ?? ""} className="ir-select">
            <option value="">Any</option>
            <option value="unpromoted">Not yet promoted</option>
            <option value="promoted">Promoted</option>
          </select>
        </div>
        <div>
          <label className="ir-label mb-1 block">Sort</label>
          <select name="sort" defaultValue={sp.sort ?? ""} className="ir-select">
            <option value="">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="price-asc">Price, low to high</option>
            <option value="price-desc">Price, high to low</option>
          </select>
        </div>
        <button type="submit" className="ir-btn ir-btn-ghost">Filter</button>
        {hasFilters && <Link href="/sourcing?tab=registered" className="text-xs text-black/40 hover:text-ir-navy">Clear</Link>}
      </form>

      {listings.length === 0 ? (
        hasFilters ? (
          <EmptyState title="No registered listings match these filters" description="Try clearing a filter — or head to Search live listings to register something new." />
        ) : (
          <EmptyState
            title="No listings registered yet"
            description="Search live listings, then click Import on anything worth holding onto — it'll show up here as a lead, separate from your owned properties, until you decide to promote it."
          />
        )
      ) : (
        <>
          <p className="mb-3 text-xs text-black/45"><span className="font-semibold text-ir-navy">{listings.length}</span> registered listing{listings.length === 1 ? "" : "s"}</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((l) => (
              <div key={l.id} className="ir-card flex flex-col overflow-hidden">
                <div className="relative aspect-[4/3] w-full bg-ir-ivory">
                  {l.imgUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a third-party listing photo, never our own origin
                    <img src={l.imgUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-ir-navy/[0.04]">
                      <ImageOff size={20} className="text-black/15" />
                    </div>
                  )}
                  <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-black/55 to-transparent p-2">
                    <span className="rounded-sm bg-white/90 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-ir-navy">{SOURCE_LABEL[l.source] ?? l.source}</span>
                    <span className="flex items-center gap-1 rounded-sm bg-black/40 px-1.5 py-0.5 text-[0.6rem] text-white">
                      <Clock size={9} /> {formatDateTime(l.createdAt)}
                    </span>
                  </div>
                  {l.price && <span className="ir-figure absolute bottom-2 left-2 rounded-sm bg-black/65 px-2 py-1 text-sm text-white">{l.price}</span>}
                </div>

                <div className="flex flex-1 flex-col p-4">
                  <h3 className="mb-1 line-clamp-2 text-sm font-semibold text-ir-navy">{l.title}</h3>
                  <p className="mb-1 text-xs text-black/45">
                    {l.location}{l.size ? ` · ${l.size}` : ""}{l.bedrooms ? ` · ${l.bedrooms} bed` : ""}
                  </p>
                  <p className="mb-3 text-[0.7rem] text-black/35">
                    {l.dealType && `${DEAL_TYPE_LABEL[l.dealType] ?? l.dealType} · `}
                    Registered by {l.registeredBy?.name ?? "someone no longer on the team"}
                  </p>

                  <div className="mt-auto space-y-2">
                    <RegisteredListingActions id={l.id} promotedPropertyId={l.promotedProperty?.id ?? null} />
                    <a href={l.sourceUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 text-[0.7rem] text-black/40 hover:text-ir-navy">
                      View original ad <ExternalLink size={10} />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
