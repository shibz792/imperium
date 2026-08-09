import { Building2, Landmark, Warehouse, TreePine } from "lucide-react";
import type { Property } from "@/generated/prisma/client";
import { Badge } from "@/components/ui";
import { LISTING_STATUS_TONE } from "@/lib/badges";
import { formatCurrency, titleCase } from "@/lib/format";
import { completenessScore, isStale, primarySize, priceUnit, relevantAskingPrice, whatsAppMessage } from "@/lib/property";
import { ClickableCard } from "@/components/ClickableCard";
import { CopyWhatsAppButton } from "@/components/CopyWhatsAppButton";

const CATEGORY_ICON = {
  RESIDENTIAL: Building2,
  COMMERCIAL: Landmark,
  INDUSTRIAL_LOGISTICS: Warehouse,
  LAND_AGRICULTURE: TreePine,
} as const;

// No real photography yet (spec's Document Vault / media pipeline covers
// that later) — a quiet brand-toned mark stands in rather than a stretched
// logo or a stock-photo placeholder. Deterministic per property so the
// grid doesn't look identical, but never a bright/gradient distraction.
function panelTone(seed: string) {
  const n = seed.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  const variants = [
    "bg-[#0d1b30]",
    "bg-[#152743]",
    "bg-[#1c2f4d]",
    "bg-[#11213a]",
  ];
  return variants[n % variants.length];
}

// A ClickableCard, not a plain <Link> — the WhatsApp copy button below is a
// real <button>, and nesting any interactive element inside an <a> is
// invalid HTML that breaks hydration (found and fixed the same bug once
// already this session, on the Agents page's broker cards).
export function PropertyCard({
  property,
  approvedWhatsApp,
}: {
  property: Property & { assignedAgent?: { name: string } | null; media?: { url: string }[] };
  approvedWhatsApp?: string | null;
}) {
  const completeness = completenessScore(property);
  const stale = isStale(property);
  const Icon = CATEGORY_ICON[property.category];
  const cover = property.media?.[0]?.url;

  return (
    <ClickableCard href={`/properties/${property.id}`} className="ir-card ir-card-hover group flex flex-col overflow-hidden">
      <div className={`relative flex h-36 items-center justify-center ${cover ? "bg-ir-navy" : panelTone(property.id)}`}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]" />
        ) : (
          <Icon size={34} strokeWidth={1} className="text-white/15 transition-transform duration-300 group-hover:scale-110" />
        )}
        <div className="absolute left-3 top-3 flex gap-1.5">
          <Badge tone={(LISTING_STATUS_TONE[property.listingStatus] as never) ?? "gray"}>{titleCase(property.listingStatus)}</Badge>
          {stale && <Badge tone="red">Stale</Badge>}
        </div>
        {property.exclusivity === "EXCLUSIVE" && (
          <div className="absolute right-3 top-3">
            <Badge tone="gold">Exclusive</Badge>
          </div>
        )}
        {cover && <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />}
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
          <span className="text-[0.65rem] uppercase tracking-wide text-white/50">{property.propertyRef}</span>
          <span className="text-[0.65rem] uppercase tracking-wide text-white/50">{primarySize(property) ?? ""}</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-ir-navy group-hover:text-ir-gold-dark">{property.title}</h3>
          <CopyWhatsAppButton message={whatsAppMessage(property, approvedWhatsApp)} className="-mt-1 -mr-1 shrink-0" />
        </div>
        <p className="mb-3 text-xs text-black/45">{[property.city, property.district].filter(Boolean).join(", ") || "Location tbc"}</p>

        <div className="ir-figure mb-3 text-xl text-ir-navy">
          {formatCurrency(relevantAskingPrice(property), property.currency)}
          <span className="ml-0.5 font-sans text-xs font-normal text-black/40">{priceUnit(property)}</span>
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-black/[0.06] pt-3">
          <span className="text-[0.7rem] text-black/45">{property.assignedAgent?.name ?? "Unassigned"}</span>
          <div className="flex items-center gap-1.5">
            <div className="h-1 w-10 overflow-hidden rounded-full bg-black/8">
              <div
                className={`h-full rounded-full ${completeness.score >= 85 ? "bg-[color:var(--color-forest)]" : completeness.score >= 60 ? "bg-ir-gold" : "bg-[color:var(--color-brick)]"}`}
                style={{ width: `${completeness.score}%` }}
              />
            </div>
            <span className="text-[0.65rem] text-black/40">{completeness.score}%</span>
          </div>
        </div>
      </div>
    </ClickableCard>
  );
}
