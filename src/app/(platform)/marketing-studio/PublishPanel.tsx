"use client";

import { useEffect, useState, useTransition } from "react";
import { Share2, Camera, Loader2, ExternalLink, RefreshCcw } from "lucide-react";
import { publishableAssetsForProperty, publishAssetToFacebook, publishAssetToInstagram } from "./publishActions";
import { CONTENT_TYPE_LABELS, type ContentType } from "@/lib/marketing";

type PropertyOption = { id: string; title: string; propertyRef: string };
type MetaConnection = { page: { id: string; name: string; igUsername: string | null } | null; adAccount: { id: string; name: string; currency: string } | null };

type PublishedPost = { id: string; target: "FACEBOOK_PAGE" | "INSTAGRAM"; status: "PUBLISHED" | "FAILED"; permalinkUrl: string | null; errorMessage: string | null; createdAt: string };
type Asset = { id: string; contentType: string; content: string; imageUrl: string | null; publishedPosts: PublishedPost[] };

export function PublishPanel({ properties, connection }: { properties: PropertyOption[]; connection: MetaConnection }) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");

  return (
    <div>
      <div className="ir-card p-5">
        <label className="ir-label mb-1 block">Property</label>
        <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="ir-select">
          {properties.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
        {!connection.page && (
          <p className="mt-2.5 text-xs text-black/40">No active Facebook Page connected — set one up in Settings first.</p>
        )}
      </div>

      {propertyId && <PublishableAssets key={propertyId} propertyId={propertyId} connection={connection} />}
    </div>
  );
}

// Keyed by propertyId in the parent so a property switch remounts this
// fresh instead of needing a manual state reset in an effect — same
// pattern as MatchedAudiencePanel.
function PublishableAssets({ propertyId, connection }: { propertyId: string; connection: MetaConnection }) {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    publishableAssetsForProperty(propertyId).then((rows) => {
      if (!cancelled) setAssets(rows as unknown as Asset[]);
    });
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  function refresh() {
    startTransition(async () => {
      const rows = await publishableAssetsForProperty(propertyId);
      setAssets(rows as unknown as Asset[]);
    });
  }

  async function doPublish(assetId: string, target: "FACEBOOK_PAGE" | "INSTAGRAM") {
    setBusyId(`${assetId}-${target}`);
    setError((e) => ({ ...e, [assetId]: "" }));
    const result = target === "FACEBOOK_PAGE" ? await publishAssetToFacebook(assetId) : await publishAssetToInstagram(assetId);
    setBusyId(null);
    if (!result.ok) setError((e) => ({ ...e, [assetId]: result.error ?? "Publish failed." }));
    refresh();
  }

  const canFacebook = Boolean(connection.page);
  const canInstagram = Boolean(connection.page?.igUsername);

  if (assets === null) {
    return (
      <div className="ir-card mt-5 flex items-center gap-2 p-5 text-xs text-black/40">
        <Loader2 size={13} className="animate-spin" /> Loading approved content…
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="ir-card mt-5 p-5 text-xs text-black/40">
        No approved content with an image yet for this listing — approve a SOCIAL_1_1, STORY_9_16, INSTAGRAM_CAPTION or FB_PAGE_POST asset with a generated image in the Create tab first.
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-3">
      {assets.map((a) => {
        const fbBusy = busyId === `${a.id}-FACEBOOK_PAGE`;
        const igBusy = busyId === `${a.id}-INSTAGRAM`;
        const lastFb = a.publishedPosts.find((p) => p.target === "FACEBOOK_PAGE");
        const lastIg = a.publishedPosts.find((p) => p.target === "INSTAGRAM");
        return (
          <div key={a.id} className="ir-card p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="ir-badge border-[#09152640] bg-[#0915260d] text-ir-navy">{CONTENT_TYPE_LABELS[a.contentType as ContentType]}</span>
            </div>
            <div className="flex gap-3">
              {a.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- served from our own DB-backed route
                <img src={a.imageUrl} alt="" className="h-20 w-20 shrink-0 rounded border border-black/10 object-cover" />
              )}
              <p className="min-w-0 flex-1 whitespace-pre-line text-xs text-black/60">{a.content}</p>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/6 pt-3">
              <button
                onClick={() => doPublish(a.id, "FACEBOOK_PAGE")}
                disabled={!canFacebook || fbBusy}
                className="ir-btn ir-btn-ghost !py-1 !text-xs disabled:opacity-40"
              >
                {fbBusy ? <Loader2 size={13} className="animate-spin" /> : <Share2 size={13} />}
                {lastFb?.status === "PUBLISHED" ? "Re-publish to Facebook" : "Publish to Facebook"}
              </button>
              {lastFb?.status === "PUBLISHED" && lastFb.permalinkUrl && (
                <a href={lastFb.permalinkUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-ir-gold-dark hover:underline">
                  View on Facebook <ExternalLink size={11} />
                </a>
              )}

              <button
                onClick={() => doPublish(a.id, "INSTAGRAM")}
                disabled={!canInstagram || igBusy}
                className="ir-btn ir-btn-ghost !py-1 !text-xs disabled:opacity-40"
                title={!canInstagram ? "The active Page has no linked Instagram Business Account" : undefined}
              >
                {igBusy ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                {lastIg?.status === "PUBLISHED" ? "Re-publish to Instagram" : "Publish to Instagram"}
              </button>
              {lastIg?.status === "PUBLISHED" && lastIg.permalinkUrl && (
                <a href={lastIg.permalinkUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-ir-gold-dark hover:underline">
                  View on Instagram <ExternalLink size={11} />
                </a>
              )}

              <button onClick={refresh} disabled={pending} title="Refresh" className="ml-auto flex h-6 w-6 items-center justify-center rounded text-black/30 hover:bg-black/[0.05] hover:text-ir-navy">
                <RefreshCcw size={12} className={pending ? "animate-spin" : ""} />
              </button>
            </div>
            {error[a.id] && <p className="mt-2 text-xs text-[color:var(--color-brick)]">{error[a.id]}</p>}
            {(lastFb?.status === "FAILED" || lastIg?.status === "FAILED") && !error[a.id] && (
              <p className="mt-2 text-xs text-[color:var(--color-brick)]">
                {lastFb?.status === "FAILED" && lastFb.errorMessage}
                {lastFb?.status === "FAILED" && lastIg?.status === "FAILED" && " · "}
                {lastIg?.status === "FAILED" && lastIg.errorMessage}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
