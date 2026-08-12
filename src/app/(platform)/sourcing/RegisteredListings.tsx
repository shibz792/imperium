import { ImageOff, ExternalLink, Clock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { RegisteredListingActions } from "./RegisteredListingActions";

const SOURCE_LABEL: Record<string, string> = { ikman: "ikman.lk", lankapropertyweb: "LankaPropertyWeb" };
const DEAL_TYPE_LABEL: Record<string, string> = { BUY: "Buy", RENT: "Rent", LEASE: "Lease" };

// Every ad link an agent has deliberately registered from External Sourcing
// — never mixed with /properties. A row here only ever becomes a real
// Property through the explicit "Promote" action (see
// RegisteredListingActions), which is a human decision, not a side effect
// of having looked at the ad.
export async function RegisteredListings() {
  const listings = await prisma.sourcedListing.findMany({
    orderBy: { createdAt: "desc" },
    include: { registeredBy: { select: { name: true } }, promotedProperty: { select: { id: true, propertyRef: true } } },
  });

  if (listings.length === 0) {
    return (
      <EmptyState
        title="No listings registered yet"
        description="Search live listings, then click Import on anything worth holding onto — it'll show up here as a lead, separate from your owned properties, until you decide to promote it."
      />
    );
  }

  return (
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
  );
}
