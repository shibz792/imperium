import { requireRole } from "@/lib/auth";
import { SOURCING_ROLES } from "@/lib/roles";
import { PageHeader } from "@/components/ui";
import { SourcingClient } from "./SourcingClient";

export default async function SourcingPage() {
  await requireRole(SOURCING_ROLES);

  return (
    <div>
      <PageHeader
        eyebrow="External Sourcing"
        title="Find properties on ikman.lk & LankaPropertyWeb"
        description="Search live listings, or drop in a link you already found. Import extracts the listing and the poster's contact details for your review, nothing is created until you approve it."
      />
      <SourcingClient />
    </div>
  );
}
