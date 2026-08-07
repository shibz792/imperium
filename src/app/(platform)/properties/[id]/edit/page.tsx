import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { PropertyForm } from "../../PropertyForm";
import { updateProperty } from "../../actions";

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [property, owners, agents] = await Promise.all([
    prisma.property.findUnique({ where: { id }, include: { collaborators: true } }),
    prisma.contact.findMany({ where: { contactType: "OWNER" }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { role: { in: ["AGENT", "SALES_MANAGER", "DIRECTOR", "SUPER_ADMIN"] }, active: true }, orderBy: { name: "asc" } }),
  ]);
  if (!property) notFound();

  const initial = {
    ...property,
    expiryDate: property.expiryDate ? property.expiryDate.toISOString().slice(0, 10) : undefined,
    collaboratorIds: property.collaborators.map((c) => c.id),
  };

  const action = updateProperty.bind(null, id);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow={property.propertyRef} title={`Edit: ${property.title}`} />
      <PropertyForm action={action} owners={owners} agents={agents} initial={initial as never} submitLabel="Save changes" />
    </div>
  );
}
