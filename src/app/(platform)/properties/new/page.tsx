import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { SALES_TEAM_ROLES } from "@/lib/roles";
import { PageHeader } from "@/components/ui";
import { PropertyForm } from "../PropertyForm";
import { createProperty } from "../actions";

export default async function NewPropertyPage() {
  // Had no auth check at all — same gap as the Properties list page itself.
  // Creating a listing is sales-team work, not everyone who can view the
  // property list (Marketing/Legal/Finance/brokers), hence the narrower group.
  await requireRole(SALES_TEAM_ROLES);
  const [owners, agents] = await Promise.all([
    prisma.contact.findMany({ where: { contactType: "OWNER" }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { role: { in: ["AGENT", "SALES_MANAGER", "DIRECTOR", "SUPER_ADMIN"] }, active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Properties · New" title="Add a property" description="Structured once, matchable forever. Fields adapt to the category and transaction type you choose." />
      <PropertyForm action={createProperty} owners={owners} agents={agents} />
    </div>
  );
}
