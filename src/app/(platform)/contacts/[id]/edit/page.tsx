import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { SALES_TEAM_ROLES } from "@/lib/roles";
import { PageHeader } from "@/components/ui";
import { ContactForm } from "../../ContactForm";
import { updateContact } from "../../actions";

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(SALES_TEAM_ROLES);
  const { id } = await params;
  const [contact, agents] = await Promise.all([
    prisma.contact.findUnique({ where: { id } }),
    prisma.user.findMany({ where: { role: { in: ["AGENT", "SALES_MANAGER", "DIRECTOR", "SUPER_ADMIN"] }, active: true }, orderBy: { name: "asc" } }),
  ]);
  if (!contact) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow={contact.contactRef} title={`Edit: ${contact.name}`} />
      <ContactForm action={updateContact.bind(null, id)} agents={agents} initial={contact as never} submitLabel="Save changes" />
    </div>
  );
}
