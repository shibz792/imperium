"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, ADMIN_ROLES } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { appBaseUrl } from "@/lib/url";
import { publishToFacebookPage, publishToInstagram, fetchPermalink } from "@/lib/meta";

// Kept as its own file rather than growing the existing 296-line
// marketing-studio/actions.ts further — this is a distinct concern
// (Meta publishing) layered on top of the same MarketingAsset rows.

export async function getActiveMetaConnection(): Promise<{
  page: { id: string; name: string; igUsername: string | null } | null;
  adAccount: { id: string; name: string; currency: string } | null;
}> {
  await requireRole(ADMIN_ROLES);
  const [page, adAccount] = await Promise.all([
    prisma.metaPage.findFirst({ where: { isActive: true } }),
    prisma.metaAdAccount.findFirst({ where: { isActive: true } }),
  ]);
  return {
    page: page ? { id: page.pageId, name: page.name, igUsername: page.igUsername } : null,
    adAccount: adAccount ? { id: adAccount.adAccountId, name: adAccount.name, currency: adAccount.currency } : null,
  };
}

export async function publishableAssetsForProperty(propertyId: string) {
  await requireRole(ADMIN_ROLES);
  return prisma.marketingAsset.findMany({
    where: { propertyId, approved: true, imageUrl: { not: null } },
    include: { publishedPosts: { orderBy: { createdAt: "desc" } } },
    orderBy: { createdAt: "desc" },
  });
}

async function absoluteImageUrl(imageUrl: string): Promise<string> {
  if (/^https?:\/\//.test(imageUrl)) return imageUrl;
  return `${appBaseUrl()}${imageUrl}`;
}

export async function publishAssetToFacebook(assetId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole(ADMIN_ROLES);
  const asset = await prisma.marketingAsset.findUniqueOrThrow({ where: { id: assetId } });
  if (!asset.imageUrl) return { ok: false, error: "This asset has no image to publish yet." };

  const page = await prisma.metaPage.findFirst({ where: { isActive: true } });
  if (!page) return { ok: false, error: "No active Facebook Page — connect and choose one in Settings first." };

  const result = await publishToFacebookPage(page.pageId, page.pageAccessToken, {
    imageUrl: await absoluteImageUrl(asset.imageUrl),
    caption: asset.content,
  });

  if (result.ok) {
    const permalink = await fetchPermalink(result.postId, page.pageAccessToken);
    await prisma.metaPublishedPost.create({
      data: { marketingAssetId: assetId, target: "FACEBOOK_PAGE", metaPageId: page.id, externalPostId: result.postId, permalinkUrl: permalink, status: "PUBLISHED", publishedById: user.id },
    });
    await logActivity({ entityType: "property", propertyId: asset.propertyId, type: "MARKETING_PUBLISHED_FACEBOOK", message: `${user.name} published to Facebook Page "${page.name}".`, userId: user.id });
  } else {
    await prisma.metaPublishedPost.create({
      data: { marketingAssetId: assetId, target: "FACEBOOK_PAGE", metaPageId: page.id, status: "FAILED", errorMessage: result.error, publishedById: user.id },
    });
  }

  revalidatePath("/marketing-studio");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function publishAssetToInstagram(assetId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole(ADMIN_ROLES);
  const asset = await prisma.marketingAsset.findUniqueOrThrow({ where: { id: assetId } });
  if (!asset.imageUrl) return { ok: false, error: "This asset has no image to publish yet — Instagram always needs one." };

  const page = await prisma.metaPage.findFirst({ where: { isActive: true } });
  if (!page) return { ok: false, error: "No active Facebook Page — connect and choose one in Settings first." };
  if (!page.igBusinessAccountId) return { ok: false, error: "The active Page has no linked Instagram Business Account." };

  const result = await publishToInstagram(page.igBusinessAccountId, page.pageAccessToken, {
    imageUrl: await absoluteImageUrl(asset.imageUrl),
    caption: asset.content,
  });

  if (result.ok) {
    const permalink = await fetchPermalink(result.mediaId, page.pageAccessToken);
    await prisma.metaPublishedPost.create({
      data: { marketingAssetId: assetId, target: "INSTAGRAM", metaPageId: page.id, externalPostId: result.mediaId, permalinkUrl: permalink, status: "PUBLISHED", publishedById: user.id },
    });
    await logActivity({ entityType: "property", propertyId: asset.propertyId, type: "MARKETING_PUBLISHED_INSTAGRAM", message: `${user.name} published to Instagram (@${page.igUsername ?? page.igBusinessAccountId}).`, userId: user.id });
  } else {
    await prisma.metaPublishedPost.create({
      data: { marketingAssetId: assetId, target: "INSTAGRAM", metaPageId: page.id, status: "FAILED", errorMessage: result.error, publishedById: user.id },
    });
  }

  revalidatePath("/marketing-studio");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function republishAsset(assetId: string, target: "FACEBOOK_PAGE" | "INSTAGRAM") {
  return target === "FACEBOOK_PAGE" ? publishAssetToFacebook(assetId) : publishAssetToInstagram(assetId);
}
