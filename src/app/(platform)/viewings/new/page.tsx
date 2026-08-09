import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { VIEWING_MATCH_ROLES } from "@/lib/roles";
import { PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { scheduleViewing } from "../actions";

export default async function NewViewingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole(VIEWING_MATCH_ROLES);
  const sp = await searchParams;
  const [properties, contacts, agents] = await Promise.all([
    prisma.property.findMany({ orderBy: { title: "asc" } }),
    prisma.contact.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { role: { in: ["AGENT", "SALES_MANAGER", "DIRECTOR", "SUPER_ADMIN"] }, active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Viewings · New" title="Schedule a viewing" />
      <form action={scheduleViewing} className="ir-card space-y-3 p-5">
        {sp.dealId && <input type="hidden" name="dealId" value={sp.dealId} />}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="ir-label mb-1 block">Property</label>
            <select name="propertyId" required defaultValue={sp.propertyId} className="ir-select">
              <option value="">Select…</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div>
            <label className="ir-label mb-1 block">Attendee</label>
            <select name="contactId" required defaultValue={sp.contactId} className="ir-select">
              <option value="">Select…</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="ir-label mb-1 block">Agent</label>
            <select name="agentId" className="ir-select">
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="ir-label mb-1 block">Date & time</label>
            <input name="scheduledAt" type="datetime-local" required className="ir-input" />
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <SubmitButton className="ir-btn ir-btn-primary px-6 py-2.5" pendingText="Scheduling…">Schedule</SubmitButton>
        </div>
      </form>
    </div>
  );
}
