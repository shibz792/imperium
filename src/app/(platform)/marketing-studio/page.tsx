import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { MARKETING_STUDIO_ROLES } from "@/lib/roles";
import { groqConfigured } from "@/lib/groq";
import { whatsappCloudConfigured } from "@/lib/whatsapp";
import { emailConfigured } from "@/lib/email";
import { FileText } from "lucide-react";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { CONTENT_TYPE_LABELS } from "@/lib/marketing";
import { MarketingStudioClient } from "./MarketingStudioClient";
import { MarketingAssetActions } from "./MarketingAssetActions";
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
        title="Generate a full campaign"
        description="One property record → channel-tuned copy for every format, AI-composed social image tiles from the real listing photo, and exactly who to send it to. Only approved facts are used."
      />

      <MarketingStudioClient properties={orderedProperties} groqEnabled={groqConfigured()} cloudConfigured={whatsappCloudConfigured()} emailConfigured={emailConfigured()} />

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
                <div className="ml-auto flex items-start gap-2">
                  {!a.approved && (
                    <form action={approveAsset.bind(null, a.id)}>
                      <button type="submit" className="ir-btn ir-btn-gold !py-1 !text-xs">Approve</button>
                    </form>
                  )}
                  <MarketingAssetActions id={a.id} content={a.content} approved={a.approved} contentType={a.contentType as never} imageUrl={a.imageUrl} />
                </div>
              </div>
              <p className="whitespace-pre-line text-xs text-black/60">{a.content}</p>
              {a.imageUrl && a.contentType === "BROCHURE" && (
                <a href={a.imageUrl} download className="mt-3 inline-flex items-center gap-1.5 rounded border border-black/10 bg-ir-ivory px-3 py-1.5 text-xs font-medium text-ir-gold-dark hover:bg-ir-gold/10">
                  <FileText size={13} /> Download PDF brochure
                </a>
              )}
              {a.imageUrl && (a.contentType === "SOCIAL_1_1" || a.contentType === "STORY_9_16") && (
                // eslint-disable-next-line @next/next/no-img-element -- served from our own DB-backed route, not a static import
                <img
                  src={a.imageUrl}
                  alt={`Composed social tile for ${a.property.title}`}
                  className={`mt-3 rounded border border-black/10 ${a.contentType === "STORY_9_16" ? "h-64 w-36" : "h-48 w-48"} object-cover`}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
