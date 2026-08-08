import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { createDeal } from "../actions";

export default async function NewDealPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [properties, contacts, requirements, agents] = await Promise.all([
    prisma.property.findMany({ orderBy: { title: "asc" } }),
    prisma.contact.findMany({ where: { contactType: { in: ["BUYER", "TENANT", "CORPORATE", "INVESTOR"] } }, orderBy: { name: "asc" } }),
    prisma.requirement.findMany({ orderBy: { title: "asc" } }),
    prisma.user.findMany({ where: { role: { in: ["AGENT", "SALES_MANAGER", "DIRECTOR", "SUPER_ADMIN"] }, active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Deals · New" title="Open a new deal" />
      <form action={createDeal} className="ir-card space-y-3 p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="ir-label mb-1 block">Property</label>
            <select name="propertyId" required defaultValue={sp.propertyId} className="ir-select">
              <option value="">Select…</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div>
            <label className="ir-label mb-1 block">Client</label>
            <select name="clientId" required defaultValue={sp.clientId} className="ir-select">
              <option value="">Select…</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="ir-label mb-1 block">Linked requirement (optional)</label>
            <select name="requirementId" defaultValue={sp.requirementId} className="ir-select">
              <option value="">None</option>
              {requirements.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
          </div>
          <div>
            <label className="ir-label mb-1 block">Assigned agent</label>
            <select name="assignedAgentId" className="ir-select">
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="ir-label mb-1 block">Expected value (LKR)</label>
            <input name="expectedValue" type="number" className="ir-input" />
          </div>
          <div>
            <label className="ir-label mb-1 block">Expected commission (%)</label>
            <input name="expectedCommissionPct" type="number" step="0.1" placeholder="Defaults by property type" className="ir-input" />
            <p className="mt-1 text-[0.7rem] text-black/40">Leave blank to use the rate configured for this property&apos;s category (Admin → Categories).</p>
          </div>
          <div>
            <label className="ir-label mb-1 block">Probability (%)</label>
            <input name="probability" type="number" defaultValue="20" className="ir-input" />
          </div>
          <div>
            <label className="ir-label mb-1 block">Stage</label>
            <select name="stage" className="ir-select">
              <option value="NEW_INQUIRY">New inquiry</option>
              <option value="QUALIFIED">Qualified</option>
              <option value="SHORTLISTED">Shortlisted</option>
            </select>
          </div>
        </div>
        <div>
          <label className="ir-label mb-1 block">Next action</label>
          <input name="nextAction" defaultValue="Contact client" className="ir-input" />
        </div>
        <div>
          <label className="ir-label mb-1.5 block">Collaborating agents</label>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {agents.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-sm text-ir-navy">
                <input type="checkbox" name="collaboratorIds" value={a.id} className="h-4 w-4 accent-ir-gold-dark" />
                {a.name}
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <button type="submit" className="ir-btn ir-btn-primary px-6 py-2.5">Create deal</button>
        </div>
      </form>
    </div>
  );
}
