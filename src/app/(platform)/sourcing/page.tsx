import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { SOURCING_ROLES } from "@/lib/roles";
import { PageHeader, Tabs } from "@/components/ui";
import { SourcingClient } from "./SourcingClient";
import { RegisteredListings } from "./RegisteredListings";

export default async function SourcingPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireRole(SOURCING_ROLES);
  const sp = await searchParams;
  const tab = sp.tab === "registered" ? "registered" : "search";
  const registeredCount = await prisma.sourcedListing.count();

  return (
    <div>
      <PageHeader
        eyebrow="External Sourcing"
        title="Find properties on ikman.lk & LankaPropertyWeb"
        description="Search live listings, or drop in a link you already found. Registering extracts the listing and the poster's contact details for your review — nothing joins your Properties list until you separately promote it."
      />
      <Tabs
        tabs={[
          { key: "search", label: "Search live listings" },
          { key: "registered", label: `Registered listings (${registeredCount})` },
        ]}
        active={tab}
        basePath="/sourcing"
      />
      {tab === "search" ? <SourcingClient /> : <RegisteredListings />}
    </div>
  );
}
