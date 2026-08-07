import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { ContactForm } from "../ContactForm";
import { createContact } from "../actions";

const VALID_TYPES = ["OWNER", "BUYER", "TENANT", "BROKER", "DEVELOPER", "INVESTOR", "CORPORATE"];

export default async function NewContactPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const agents = await prisma.user.findMany({ where: { role: { in: ["AGENT", "SALES_MANAGER", "DIRECTOR", "SUPER_ADMIN"] }, active: true }, orderBy: { name: "asc" } });
  const prefillType = sp.type && VALID_TYPES.includes(sp.type) ? sp.type : undefined;
  const isBroker = prefillType === "BROKER";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Contacts · New"
        title={isBroker ? "Add an external broker or agency" : "Add a contact"}
        description={isBroker ? "For a co-broking partner outside Imperium. They show up on the Agents roster, but don't get a staff login." : undefined}
      />
      <ContactForm action={createContact} agents={agents} initial={prefillType ? { contactType: prefillType } : undefined} />
    </div>
  );
}
