import { requireRole, ROLE_LABELS } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, SectionCard, Tabs } from "@/components/ui";
import { formatDateTime, titleCase } from "@/lib/format";
import { SRI_LANKA_GEOGRAPHY, PROPERTY_SUBTYPES } from "@/lib/locations";
import { DEFAULT_AGENCY_FEE_PCT } from "@/lib/commission";
import { createUser, toggleUserActive, setCommissionRateRule } from "./actions";

const ROLES = ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER", "AGENT", "MARKETING", "LEGAL", "FINANCE", "EXTERNAL_BROKER", "OWNER_PORTAL", "CLIENT_PORTAL"];
const TABS = [
  { key: "users", label: "Users" },
  { key: "locations", label: "Locations" },
  { key: "categories", label: "Categories" },
  { key: "audit", label: "Audit log" },
];

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireRole(["SUPER_ADMIN"]);
  const { tab = "users" } = await searchParams;

  return (
    <div>
      <PageHeader eyebrow="Administration" title="Platform administration" description="Users, permissions, locations, categories and the audit trail." />
      <Tabs tabs={TABS} active={tab} basePath="/admin" />

      {tab === "users" && <UsersTab />}
      {tab === "locations" && <LocationsTab />}
      {tab === "categories" && <CategoriesTab />}
      {tab === "audit" && <AuditTab />}
    </div>
  );
}

async function UsersTab() {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <SectionCard title="Add user">
        <form action={createUser} className="space-y-3">
          <div>
            <label className="ir-label mb-1 block">Name</label>
            <input name="name" required className="ir-input" />
          </div>
          <div>
            <label className="ir-label mb-1 block">Email</label>
            <input name="email" type="email" required className="ir-input" />
          </div>
          <div>
            <label className="ir-label mb-1 block">Role</label>
            <select name="role" className="ir-select">
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r as keyof typeof ROLE_LABELS]}</option>)}
            </select>
          </div>
          <div>
            <label className="ir-label mb-1 block">Password</label>
            <input name="password" type="text" placeholder="Imperium@123" className="ir-input" />
          </div>
          <button type="submit" className="ir-btn ir-btn-primary w-full justify-center">Create user</button>
        </form>
      </SectionCard>

      <div className="lg:col-span-2">
        <SectionCard title={`Users (${users.length})`}>
          <ul className="divide-y divide-black/6">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <div className="text-sm font-medium text-ir-navy">{u.name}</div>
                  <div className="text-xs text-black/45">{u.email} · {ROLE_LABELS[u.role]}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={u.active ? "green" : "gray"}>{u.active ? "Active" : "Deactivated"}</Badge>
                  <form action={toggleUserActive.bind(null, u.id, !u.active)}>
                    <button type="submit" className="ir-btn ir-btn-ghost !py-1 !text-[0.7rem]">{u.active ? "Deactivate" : "Reactivate"}</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}

function LocationsTab() {
  return (
    <SectionCard title="Sri Lanka reference geography">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SRI_LANKA_GEOGRAPHY.map((d) => (
          <div key={d.district} className="rounded border border-black/8 p-3">
            <div className="text-sm font-medium text-ir-navy">{d.district}</div>
            <div className="text-[0.7rem] text-black/40">{d.province} Province</div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {d.cities.slice(0, 6).map((c) => <Badge key={c} tone="gray">{c}</Badge>)}
              {d.cities.length > 6 && <Badge tone="gray">+{d.cities.length - 6}</Badge>}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-black/40">
        Static reference data used for address autocomplete and location matching. Production would sync this with the Google Places API (see roadmap).
      </p>
    </SectionCard>
  );
}

async function CategoriesTab() {
  const rules = await prisma.commissionRateRule.findMany();
  const rateFor = (category: string) => rules.find((r) => r.category === category)?.agencyFeePct ?? DEFAULT_AGENCY_FEE_PCT;

  return (
    <div className="space-y-5">
      <SectionCard title="Property categories & subtypes">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Object.entries(PROPERTY_SUBTYPES).map(([category, subtypes]) => (
            <div key={category} className="rounded border border-black/8 p-3">
              <div className="mb-1.5 text-sm font-medium text-ir-navy">{titleCase(category)}</div>
              <div className="flex flex-wrap gap-1">
                {subtypes.map((s) => <Badge key={s} tone="navy">{s}</Badge>)}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Default agency fee by property type">
        <p className="mb-4 text-xs text-black/45">
          What a deal&apos;s agency fee % defaults to on Closed Won when no one&apos;s typed a specific one on the deal itself. A warehouse and a house don&apos;t have to earn the same rate.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.keys(PROPERTY_SUBTYPES).map((category) => (
            <form key={category} action={setCommissionRateRule.bind(null, category)} className="rounded border border-black/8 p-3">
              <label className="ir-label mb-1.5 block">{titleCase(category)}</label>
              <div className="flex items-center gap-1.5">
                <input name="agencyFeePct" type="number" min={0} step="0.1" defaultValue={rateFor(category)} className="ir-input !py-1.5 !text-sm" />
                <span className="text-xs text-black/40">%</span>
              </div>
              <button type="submit" className="ir-btn ir-btn-ghost mt-2 w-full !py-1 !text-[0.7rem]">Save</button>
            </form>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

async function AuditTab() {
  const logs = await prisma.auditLog.findMany({ include: { user: true }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <SectionCard title={`Audit log (latest ${logs.length})`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-xs">
          <thead>
            <tr className="border-b border-black/8 uppercase tracking-wide text-black/40">
              <th className="py-2 pr-3 font-medium">When</th>
              <th className="px-3 py-2 font-medium">User</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Entity</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-black/6 last:border-0">
                <td className="py-2 pr-3 text-black/50">{formatDateTime(l.createdAt)}</td>
                <td className="px-3 py-2 text-black/70">{l.user?.name ?? "System"}</td>
                <td className="px-3 py-2"><Badge tone="navy">{l.action}</Badge></td>
                <td className="px-3 py-2 text-black/50">{l.entityType} · {l.entityId.slice(0, 10)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
