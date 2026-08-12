import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { SOURCING_ROLES } from "@/lib/roles";
import { PageHeader, Tabs } from "@/components/ui";
import { SourcingClient } from "./SourcingClient";
import { RegisteredListings } from "./RegisteredListings";

export default async function SourcingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole(SOURCING_ROLES);
  const sp = await searchParams;
  const tab = sp.tab === "registered" ? "registered" : "search";
  // The tab badge always shows the true total, not the filtered count —
  // filtering the registered list shouldn't make the tab itself look like
  // there's less to review than there really is.
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
      {tab === "search" ? <SourcingClient /> : <RegisteredListings searchParams={sp} />}
    </div>
  );
}
