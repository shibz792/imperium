import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { RequirementForm } from "../RequirementForm";
import { createRequirement } from "../actions";

export default async function NewRequirementPage() {
  const [clients, agents] = await Promise.all([
    prisma.contact.findMany({ where: { contactType: { in: ["BUYER", "TENANT", "CORPORATE", "INVESTOR"] } }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { role: { in: ["AGENT", "SALES_MANAGER", "DIRECTOR", "SUPER_ADMIN"] }, active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Requirements · New" title="Add a requirement" description="A first-class business record, not a note under a contact." />
      <RequirementForm action={createRequirement} clients={clients} agents={agents} />
    </div>
  );
}
