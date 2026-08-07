import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { AgentForm } from "../../AgentForm";
import { updateAgentProfile } from "../../actions";

export default async function EditAgentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER"]);
  const { id } = await params;
  const agent = await prisma.user.findUnique({ where: { id } });
  if (!agent) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow={agent.name} title="Edit agent profile" />
      <AgentForm action={updateAgentProfile.bind(null, id)} initial={agent as never} submitLabel="Save changes" />
    </div>
  );
}
