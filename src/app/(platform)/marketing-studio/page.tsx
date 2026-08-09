import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { MARKETING_STUDIO_ROLES } from "@/lib/roles";
import { groqConfigured } from "@/lib/groq";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { CONTENT_TYPE_LABELS } from "@/lib/marketing";
import { MarketingStudioClient } from "./MarketingStudioClient";
import { approveAsset } from "./actions";

export default async function MarketingStudioPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole(MARKETING_STUDIO_ROLES);
  const sp = await searchParams;
  const properties = await prisma.property.findMany({ orderBy: { title: "asc" }, select: { id: true, title: true, propertyRef: true } });
  const orderedProperties = sp.propertyId ? [...properties].sort((a, b) => (a.id === sp.propertyId ? -1 : b.id === sp.propertyId ? 1 : 0)) : properties;

  const recentAssets = await prisma.marketingAsset.findMany({
    include: { property: true, approvedBy: true },
    orderBy: { createdAt: "desc" },
    take: 12,
  });

  return (
    <div>
      <PageHeader
        eyebrow="Marketing Studio"
        title="Generate branded content"
        description="One approved property record → premium descriptions, ad copy, brochures and captions. Only approved facts are used."
      />

      <MarketingStudioClient properties={orderedProperties} groqEnabled={groqConfigured()} />

      <h2 className="mb-3 mt-8 text-sm font-semibold text-ir-navy">Recent generations</h2>
      {recentAssets.length === 0 ? (
        <EmptyState title="Nothing generated yet" />
      ) : (
        <div className="space-y-3">
          {recentAssets.map((a) => (
            <div key={a.id} className="ir-card p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-ir-navy">{a.property.title}</span>
                <Badge tone="navy">{CONTENT_TYPE_LABELS[a.contentType as keyof typeof CONTENT_TYPE_LABELS]}</Badge>
                <Badge tone="gray">{a.language}</Badge>
                <Badge tone={a.approved ? "green" : "amber"}>{a.approved ? `Approved by ${a.approvedBy?.name ?? ""}` : "Pending approval"}</Badge>
                {!a.approved && (
                  <form action={approveAsset.bind(null, a.id)} className="ml-auto">
                    <button type="submit" className="ir-btn ir-btn-gold !py-1 !text-xs">Approve</button>
                  </form>
                )}
              </div>
              <p className="whitespace-pre-line text-xs text-black/60">{a.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
