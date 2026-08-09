import Link from "next/link";
import { MessageCircle, Globe } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { VIEWING_MATCH_ROLES } from "@/lib/roles";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { scoreMatch } from "@/lib/match";
import { formatCurrency, titleCase } from "@/lib/format";
import { primarySize, relevantAskingPrice, priceUnit, whatsAppMessage } from "@/lib/property";
import { districtForCity, ALL_DISTRICTS } from "@/lib/locations";
import { SourcingClient } from "../sourcing/SourcingClient";
import { shareMatch } from "./actions";

export default async function MatchmakerPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole(VIEWING_MATCH_ROLES);
  const sp = await searchParams;
  const mode = sp.mode === "requirement" ? "requirement" : "property";

  const [properties, requirements] = await Promise.all([
    prisma.property.findMany({ where: { listingStatus: "ACTIVE" }, orderBy: { title: "asc" } }),
    prisma.requirement.findMany({
      where: { status: { in: ["NEW", "UNVERIFIED", "QUALIFIED", "ACTIVELY_SEARCHING", "OPTIONS_SHARED", "VIEWING_ARRANGED", "NEGOTIATING"] } },
      include: { client: true },
      orderBy: { title: "asc" },
    }),
  ]);

  const anchorId = mode === "property" ? (sp.propertyId ?? properties[0]?.id) : (sp.requirementId ?? requirements[0]?.id);
  const anchorProperty = mode === "property" ? properties.find((p) => p.id === anchorId) : undefined;
  const anchorRequirement = mode === "requirement" ? requirements.find((r) => r.id === anchorId) : undefined;

  // Derive a sensible starting search from the requirement itself, so
  // "find it on ikman/LankaPropertyWeb" starts pre-aimed instead of blank.
  let sourcingPrefill: { keyword: string; dealType: "BUY" | "RENT" | "LEASE"; district: string; propertyType: string } | null = null;
  if (anchorRequirement) {
    const locations = (anchorRequirement.preferredLocationsJson as string[] | null) ?? [];
    const firstLocation = locations[0];
    const district = firstLocation ? (ALL_DISTRICTS.includes(firstLocation) ? firstLocation : districtForCity(firstLocation)) : undefined;
    sourcingPrefill = {
      keyword: [anchorRequirement.subtype, firstLocation].filter(Boolean).join(" "),
      dealType: anchorRequirement.dealType,
      district: district ?? "",
      propertyType: anchorRequirement.subtype ?? "",
    };
  }

  let matches: { id: string; label: string; sub: string; score: number; reasons: string[]; gaps: string[]; breakdown: { label: string; weight: number; earned: number }[]; requirementId?: string; propertyId?: string }[] = [];

  if (mode === "property" && anchorProperty) {
    matches = requirements
      .map((r) => {
        const result = scoreMatch(anchorProperty, r);
        if (!result) return null;
        return { id: r.id, label: r.title, sub: `${r.client.name}`, requirementId: r.id, ...result };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .sort((a, b) => b.score - a.score);
  } else if (mode === "requirement" && anchorRequirement) {
    matches = properties
      .map((p) => {
        const result = scoreMatch(p, anchorRequirement);
        if (!result) return null;
        return { id: p.id, label: p.title, sub: `${formatCurrency(relevantAskingPrice(p), p.currency)}${priceUnit(p)}`, propertyId: p.id, ...result };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .sort((a, b) => b.score - a.score);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Matchmaker"
        title="Side-by-side matching"
        description="Hard filters exclude clear conflicts; the weighted score explains everything that survives."
      />

      <div className="mb-5 flex gap-1.5">
        <Link href="/matchmaker?mode=property" className={`rounded-full px-4 py-1.5 text-xs font-medium ${mode === "property" ? "bg-ir-navy text-white" : "bg-black/5 text-black/60"}`}>
          Property → Requirements
        </Link>
        <Link href="/matchmaker?mode=requirement" className={`rounded-full px-4 py-1.5 text-xs font-medium ${mode === "requirement" ? "bg-ir-navy text-white" : "bg-black/5 text-black/60"}`}>
          Requirement → Properties
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[340px_1fr]">
        <div className="ir-card p-5">
          <form method="GET" className="mb-4">
            <input type="hidden" name="mode" value={mode} />
            <label className="ir-label mb-1.5 block">{mode === "property" ? "Select a property" : "Select a requirement"}</label>
            <select name={mode === "property" ? "propertyId" : "requirementId"} defaultValue={anchorId} className="ir-select mb-2" onChange={undefined}>
              {(mode === "property" ? properties : requirements).map((item) => (
                <option key={item.id} value={item.id}>
                  {"title" in item ? item.title : ""}
                </option>
              ))}
            </select>
            <button type="submit" className="ir-btn ir-btn-ghost w-full justify-center">
              Load matches
            </button>
          </form>

          {anchorProperty && (
            <div className="border-t border-black/8 pt-4 text-sm">
              <div className="mb-1 font-medium text-ir-navy">{anchorProperty.title}</div>
              <div className="text-xs text-black/50">{anchorProperty.propertyRef} · {titleCase(anchorProperty.subtype)}</div>
              <div className="mt-2 text-xs text-black/60">{formatCurrency(relevantAskingPrice(anchorProperty), anchorProperty.currency)}{priceUnit(anchorProperty)} · {primarySize(anchorProperty) ?? "size tbc"}</div>
              <div className="text-xs text-black/60">{anchorProperty.city}, {anchorProperty.district}</div>
              <Link href={`/properties/${anchorProperty.id}`} className="mt-2 inline-block text-xs font-medium text-ir-gold-dark hover:underline">Open full record →</Link>
            </div>
          )}
          {anchorRequirement && (
            <div className="border-t border-black/8 pt-4 text-sm">
              <div className="mb-1 font-medium text-ir-navy">{anchorRequirement.title}</div>
              <div className="text-xs text-black/50">{anchorRequirement.requirementRef} · {anchorRequirement.client.name}</div>
              <div className="mt-2 text-xs text-black/60">
                {anchorRequirement.budgetMax ? `up to ${formatCurrency(anchorRequirement.budgetMax)}` : "budget tbc"} · {anchorRequirement.sizeMin ?? "?"}–{anchorRequirement.sizeMax ?? "?"} sqft
              </div>
              <Link href={`/requirements/${anchorRequirement.id}`} className="mt-2 inline-block text-xs font-medium text-ir-gold-dark hover:underline">Open full record →</Link>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {matches.length === 0 ? (
            <EmptyState title="No qualifying matches" description="Hard filters (category, budget, size, location) excluded everything currently in the database." />
          ) : (
            matches.map((m) => (
              <div key={m.id} className="ir-card p-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-current text-sm font-semibold text-ir-gold-dark tabular-nums">{m.score}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/${mode === "property" ? "requirements" : "properties"}/${m.id}`} className="text-sm font-semibold text-ir-navy hover:text-ir-gold-dark">
                        {m.label}
                      </Link>
                      <form action={shareMatch.bind(null, mode === "property" ? anchorProperty!.id : m.propertyId!, mode === "requirement" ? anchorRequirement!.id : m.requirementId!, m.score)}>
                        <button type="submit" className="ir-btn ir-btn-gold !py-1 !text-xs">
                          <MessageCircle size={12} /> Share via WhatsApp
                        </button>
                      </form>
                    </div>
                    <div className="text-xs text-black/45">{m.sub}</div>

                    <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                      {m.breakdown.map((b) => (
                        <div key={b.label} className="text-[0.7rem]">
                          <div className="flex justify-between text-black/45">
                            <span>{b.label}</span>
                            <span className="tabular-nums">{b.earned}/{b.weight}</span>
                          </div>
                          <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-black/8">
                            <div className="h-full rounded-full bg-ir-gold" style={{ width: `${(b.earned / b.weight) * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {m.reasons.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {m.reasons.slice(0, 3).map((r, i) => (
                          <Badge key={i} tone="green">{r}</Badge>
                        ))}
                      </div>
                    )}
                    {m.gaps.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {m.gaps.slice(0, 2).map((g, i) => (
                          <Badge key={i} tone="amber">{g}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {anchorProperty && (
        <details className="ir-card mt-5 p-4">
          <summary className="cursor-pointer text-xs font-medium text-black/50">Preview WhatsApp-ready message for this property</summary>
          <pre className="mt-3 whitespace-pre-wrap rounded bg-ir-ivory p-3 text-xs text-ir-navy">{whatsAppMessage(anchorProperty)}</pre>
        </details>
      )}

      {anchorRequirement && sourcingPrefill && (
        <details className="ir-card mt-5 p-5">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ir-navy">
            <Globe size={15} className="text-ir-gold-dark" /> Nothing in the database fits? Search ikman.lk &amp; LankaPropertyWeb
          </summary>
          <div className="mt-4 border-t border-black/8 pt-4">
            <SourcingClient
              initialKeyword={sourcingPrefill.keyword}
              initialDealType={sourcingPrefill.dealType}
              initialDistrict={sourcingPrefill.district}
              initialPropertyType={sourcingPrefill.propertyType}
              requirementContext={{ requirementId: anchorRequirement.id, requirementRef: anchorRequirement.requirementRef, requirementTitle: anchorRequirement.title }}
            />
          </div>
        </details>
      )}
    </div>
  );
}
