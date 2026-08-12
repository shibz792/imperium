import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { SALES_TEAM_ROLES } from "@/lib/roles";
import { PageHeader } from "@/components/ui";
import { ContactForm } from "../../ContactForm";
import { updateContact } from "../../actions";

export default async function EditContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  await requireRole(SALES_TEAM_ROLES);
  const { id } = await params;
  const sp = await searchParams;
  const [contact, agents] = await Promise.all([
    prisma.contact.findUnique({ where: { id } }),
    prisma.user.findMany({ where: { role: { in: ["AGENT", "SALES_MANAGER", "DIRECTOR", "SUPER_ADMIN"] }, active: true }, orderBy: { name: "asc" } }),
  ]);
  if (!contact) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow={contact.contactRef} title={`Edit: ${contact.name}`} />
      {sp.error === "excluded-agent" && (
        <div className="mb-5 rounded border border-[#8c4a3e4d] bg-[color:var(--color-brick-tint)] px-4 py-2.5 text-sm text-[color:var(--color-brick)]">
          Can&apos;t assign that agent — this contact has flagged they don&apos;t work with them. Remove the exclusion on the contact&apos;s page first if that&apos;s changed.
        </div>
      )}
      <ContactForm action={updateContact.bind(null, id)} agents={agents} initial={contact as never} submitLabel="Save changes" />
    </div>
  );
}
