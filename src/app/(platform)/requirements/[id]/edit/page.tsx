import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { SALES_TEAM_ROLES } from "@/lib/roles";
import { PageHeader } from "@/components/ui";
import { RequirementForm } from "../../RequirementForm";
import { updateRequirement } from "../../actions";

export default async function EditRequirementPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(SALES_TEAM_ROLES);
  const { id } = await params;
  const [requirement, clients, agents] = await Promise.all([
    prisma.requirement.findUnique({ where: { id }, include: { collaborators: true } }),
    prisma.contact.findMany({ where: { contactType: { in: ["BUYER", "TENANT", "CORPORATE", "INVESTOR"] } }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { role: { in: ["AGENT", "SALES_MANAGER", "DIRECTOR", "SUPER_ADMIN"] }, active: true }, orderBy: { name: "asc" } }),
  ]);
  if (!requirement) notFound();

  const initial = {
    ...requirement,
    deadline: requirement.deadline ? requirement.deadline.toISOString().slice(0, 10) : undefined,
    nextActionDate: requirement.nextActionDate ? requirement.nextActionDate.toISOString().slice(0, 10) : undefined,
    expiryDate: requirement.expiryDate ? requirement.expiryDate.toISOString().slice(0, 10) : undefined,
    collaboratorIds: requirement.collaborators.map((c) => c.id),
  };

  const action = updateRequirement.bind(null, id);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow={requirement.requirementRef} title={`Edit: ${requirement.title}`} />
      <RequirementForm action={action} clients={clients} agents={agents} initial={initial as never} submitLabel="Save changes" />
    </div>
  );
}
