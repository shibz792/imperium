import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { REQUIREMENT_STATUS_TONE, URGENCY_TONE } from "@/lib/badges";
import { formatCurrency, formatDate, titleCase, daysAgoDate } from "@/lib/format";
import { PROPERTY_SUBTYPES } from "@/lib/locations";
import { ClickableRow } from "@/components/ClickableRow";
import { Pagination } from "@/components/Pagination";
import { paginationParams, totalPages as computeTotalPages } from "@/lib/pagination";
import { CopyWhatsAppButton } from "@/components/CopyWhatsAppButton";
import { whatsAppMessageForRequirement } from "@/lib/property";
import type { Prisma } from "@/generated/prisma/client";

export default async function RequirementsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const where: Prisma.RequirementWhereInput = {};
  if (sp.category) where.category = sp.category as never;
  if (sp.dealType) where.dealType = sp.dealType as never;
  if (sp.status) where.status = sp.status as never;
  if (sp.urgency) where.urgency = sp.urgency as never;
  if (sp.q) {
    where.OR = [{ title: { contains: sp.q } }, { requirementRef: { contains: sp.q } }, { client: { name: { contains: sp.q } } }];
  }
  if (sp.needsReconfirm === "1") {
    where.status = { in: ["NEW", "UNVERIFIED", "QUALIFIED", "ACTIVELY_SEARCHING", "OPTIONS_SHARED", "VIEWING_ARRANGED", "NEGOTIATING"] };
    where.lastContacted = { lt: daysAgoDate(14) };
  }
  // From a Command Centre demand-hotspot click — jumps straight to every
  // requirement that named this exact location as a preference.
  if (sp.location) {
    where.preferredLocationsJson = { array_contains: [sp.location] };
  }

  const { page, skip, take } = paginationParams(sp);
  const [requirements, total] = await Promise.all([
    prisma.requirement.findMany({
      where,
      include: { client: true, assignedAgent: true },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.requirement.count({ where }),
  ]);
  const pages = computeTotalPages(total);

  return (
    <div>
      <PageHeader
        eyebrow={`Requirements · ${total}`}
        title="Requirement database"
        description={sp.location ? `Filtered to requirements preferring ${sp.location}.` : "Buyer, tenant, investor and corporate mandates: first-class records, not notes under a contact."}
        actions={
          <Link href="/requirements/new" className="ir-btn ir-btn-primary">
            <Plus size={15} /> New requirement
          </Link>
        }
      />

      <form className="ir-card mb-5 flex flex-wrap items-end gap-3 p-4" method="GET">
        <div className="min-w-[180px] flex-1">
          <label className="ir-label mb-1 block">Search</label>
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Title, reference, client…" className="ir-input" />
        </div>
        <div>
          <label className="ir-label mb-1 block">Category</label>
          <select name="category" defaultValue={sp.category ?? ""} className="ir-select">
            <option value="">All</option>
            {Object.keys(PROPERTY_SUBTYPES).map((c) => (
              <option key={c} value={c}>{titleCase(c)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="ir-label mb-1 block">Deal type</label>
          <select name="dealType" defaultValue={sp.dealType ?? ""} className="ir-select">
            <option value="">All</option>
            {["BUY", "RENT", "LEASE"].map((t) => (
              <option key={t} value={t}>{titleCase(t)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="ir-label mb-1 block">Status</label>
          <select name="status" defaultValue={sp.status ?? ""} className="ir-select">
            <option value="">All</option>
            {["NEW", "UNVERIFIED", "QUALIFIED", "ACTIVELY_SEARCHING", "OPTIONS_SHARED", "VIEWING_ARRANGED", "NEGOTIATING", "ON_HOLD", "COMPLETED", "LOST_EXPIRED"].map((s) => (
              <option key={s} value={s}>{titleCase(s)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="ir-label mb-1 block">Urgency</label>
          <select name="urgency" defaultValue={sp.urgency ?? ""} className="ir-select">
            <option value="">All</option>
            {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((u) => (
              <option key={u} value={u}>{titleCase(u)}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="ir-btn ir-btn-ghost">Filter</button>
        {(sp.q || sp.category || sp.dealType || sp.status || sp.urgency || sp.needsReconfirm || sp.location) && (
          <Link href="/requirements" className="text-xs text-black/40 hover:text-ir-navy">Clear</Link>
        )}
      </form>

      {requirements.length === 0 ? (
        <EmptyState title="No requirements match these filters" />
      ) : (
        <div className="ir-card overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/8 text-[0.7rem] uppercase tracking-wide text-black/40">
                <th className="px-4 py-3 font-medium">Requirement</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Budget</th>
                <th className="px-4 py-3 font-medium">Locations</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Urgency</th>
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 font-medium">Next action</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {requirements.map((r) => {
                const locations = Array.isArray(r.preferredLocationsJson) ? (r.preferredLocationsJson as string[]) : [];
                return (
                  <ClickableRow key={r.id} href={`/requirements/${r.id}`} className="border-b border-black/6 last:border-0 hover:bg-black/[0.015]">
                    <td className="px-4 py-3">
                      <Link href={`/requirements/${r.id}`} className="font-medium text-ir-navy hover:text-ir-gold-dark">{r.title}</Link>
                      <div className="mt-0.5 text-[0.7rem] text-black/40">{r.requirementRef} · {titleCase(r.type)}</div>
                    </td>
                    <td className="px-4 py-3 text-black/70">{r.client.name}</td>
                    <td className="px-4 py-3 text-black/70">
                      {r.budgetMax ? `up to ${formatCurrency(r.budgetMax)}` : r.budgetMin ? `from ${formatCurrency(r.budgetMin)}` : "-"}
                    </td>
                    <td className="px-4 py-3 text-black/60">{locations.slice(0, 2).join(", ") || "Any"}</td>
                    <td className="px-4 py-3"><Badge tone={(REQUIREMENT_STATUS_TONE[r.status] as never) ?? "gray"}>{titleCase(r.status)}</Badge></td>
                    <td className="px-4 py-3"><Badge tone={(URGENCY_TONE[r.urgency] as never) ?? "gray"}>{titleCase(r.urgency)}</Badge></td>
                    <td className="px-4 py-3 text-black/60">{r.assignedAgent?.name ?? "-"}</td>
                    <td className="px-4 py-3 text-black/50">{r.nextAction ? `${r.nextAction} (${formatDate(r.nextActionDate)})` : "-"}</td>
                    <td className="px-4 py-3 text-right">
                      <CopyWhatsAppButton message={whatsAppMessageForRequirement(r)} />
                    </td>
                  </ClickableRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={pages} total={total} basePath="/requirements" searchParams={sp} />
    </div>
  );
}
