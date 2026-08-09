import { requireRole } from "@/lib/auth";
import { AI_INTAKE_ROLES } from "@/lib/roles";
import { groqConfigured } from "@/lib/groq";
import { PageHeader } from "@/components/ui";
import { AiIntakeClient } from "./AiIntakeClient";

export default async function AiIntakePage() {
  await requireRole(AI_INTAKE_ROLES);

  return (
    <div>
      <PageHeader
        eyebrow="Imperium AI Intake"
        title="Turn messages into structured records"
        description="Paste WhatsApp conversations, emails or notes. Extraction runs against your live database for duplicate detection, nothing is published until you approve it."
      />
      <AiIntakeClient groqEnabled={groqConfigured()} />
    </div>
  );
}
