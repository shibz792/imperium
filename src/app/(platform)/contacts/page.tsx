import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser, canSeeConfidential } from "@/lib/auth";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { ClickableRow } from "@/components/ClickableRow";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { titleCase } from "@/lib/format";
import type { Prisma } from "@/generated/prisma/client";

const TYPE_TONE: Record<string, string> = { OWNER: "gold", BUYER: "blue", TENANT: "green", BROKER: "navy", DEVELOPER: "amber", INVESTOR: "gray", CORPORATE: "navy" };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const showConfidential = canSeeConfidential(user);

  const where: Prisma.ContactWhereInput = {};
  if (sp.type) where.contactType = sp.type as never;
  if (sp.q) {
    where.OR = [{ name: { contains: sp.q } }, { companyName: { contains: sp.q } }, { phone: { contains: sp.q } }, { contactRef: { contains: sp.q } }];
  }

  const contacts = await prisma.contact.findMany({
    where,
    include: { assignedAgent: true, _count: { select: { ownedProperties: true, requirements: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        eyebrow={`Contacts · ${contacts.length}`}
        title="Contacts & CRM"
        description="Owners, buyers, tenants, brokers, developers and investors: one record per relationship."
        actions={<Link href="/contacts/new" className="ir-btn ir-btn-primary"><Plus size={15} /> New contact</Link>}
      />

      <form className="ir-card mb-5 flex flex-wrap items-end gap-3 p-4" method="GET">
        <div className="min-w-[200px] flex-1">
          <label className="ir-label mb-1 block">Search</label>
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Name, company, phone, reference…" className="ir-input" />
        </div>
        <div>
          <label className="ir-label mb-1 block">Type</label>
          <select name="type" defaultValue={sp.type ?? ""} className="ir-select">
            <option value="">All</option>
            {["OWNER", "BUYER", "TENANT", "BROKER", "DEVELOPER", "INVESTOR", "CORPORATE"].map((t) => (
              <option key={t} value={t}>{titleCase(t)}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="ir-btn ir-btn-ghost">Filter</button>
      </form>

      {contacts.length === 0 ? (
        <EmptyState title="No contacts match these filters" />
      ) : (
        <div className="ir-card overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/8 text-[0.7rem] uppercase tracking-wide text-black/40">
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Properties</th>
                <th className="px-4 py-3 font-medium">Requirements</th>
                <th className="px-4 py-3 font-medium">Agent</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <ClickableRow key={c.id} href={`/contacts/${c.id}`} className="border-b border-black/6 last:border-0 hover:bg-black/[0.015]">
                  <td className="px-4 py-3">
                    <Link href={`/contacts/${c.id}`} className="font-medium text-ir-navy hover:text-ir-gold-dark">{c.name}</Link>
                    <div className="mt-0.5 text-[0.7rem] text-black/40">{c.contactRef}{c.companyName ? ` · ${c.companyName}` : ""}</div>
                  </td>
                  <td className="px-4 py-3"><Badge tone={(TYPE_TONE[c.contactType] as never) ?? "gray"}>{titleCase(c.contactType)}</Badge></td>
                  <td className="px-4 py-3 text-black/70">
                    <div className="flex items-center gap-1.5">
                      {showConfidential ? c.phone : "Restricted"}
                      {showConfidential && <WhatsAppButton phone={c.phone} variant="icon" />}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-black/60">{c.city ?? c.district ?? "-"}</td>
                  <td className="px-4 py-3 text-black/60">{c._count.ownedProperties}</td>
                  <td className="px-4 py-3 text-black/60">{c._count.requirements}</td>
                  <td className="px-4 py-3 text-black/60">{c.assignedAgent?.name ?? "-"}</td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
