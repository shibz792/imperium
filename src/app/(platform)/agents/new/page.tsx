import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { AgentForm } from "../AgentForm";
import { createAgent } from "../actions";

export default async function NewAgentPage() {
  await requireRole(["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER"]);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Agents · New" title="Add an agent" description="Creates a staff login and a public roster profile." />
      <AgentForm action={createAgent} isNew />
    </div>
  );
}
