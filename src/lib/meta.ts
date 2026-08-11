import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

// Meta (Facebook Pages, Instagram, Marketing API) — same two-tier shape as
// Google OAuth and WhatsApp Cloud API elsewhere in this app: fully coded
// against Meta's documented Graph/Marketing API contract, silently inactive
// until META_APP_ID/SECRET/REDIRECT_URI are set. Every function here fails
// soft (returns null/false) rather than throwing when the connection is
// missing or Meta has a bad day — publishing and ads are conveniences
// layered on top of the CRM, never something a core action should block on.
//
// Unlike GoogleAccount (one connection per user, everyone's own Calendar),
// this is ONE SHARED, COMPANY-WIDE connection — Marketing Studio publishing
// and ad spend represent the agency, not an individual employee, so
// whoever connects becomes "the connection" for the whole team, closer to
// GoogleAccount.isStorageAccount's single admin-designated shared resource.

const GRAPH_VERSION = "v21.0";
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Standard Access (no App Review needed) covers all of these as long as the
// Page/Instagram account/Ad account connected belongs to the same Meta
// Business Portfolio as this app, and the connecting user is an
// Admin/Developer on the app — see the Connections tab copy for the
// one-time setup this assumes.
const SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "ads_management",
  "ads_read",
  "business_management",
].join(",");

function appId() {
  return process.env.META_APP_ID;
}
function appSecret() {
  return process.env.META_APP_SECRET;
}
function redirectUri() {
  return process.env.META_REDIRECT_URI;
}

export function metaOAuthConfigured(): boolean {
  return Boolean(appId() && appSecret() && redirectUri());
}

// Every network call in this file goes through here so a thrown network
// error fails soft — a null response, same shape as "Meta said no" —
// instead of an unhandled rejection taking down whatever publish/ads action
// triggered it.
async function safeFetch(url: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, init);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// state param — plain anti-CSRF nonce, same pattern as Google's.
// ---------------------------------------------------------------------------

export const META_OAUTH_NONCE_COOKIE = "meta_oauth_nonce";

export function newNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function buildAuthUrl(nonce: string): string {
  const params = new URLSearchParams({
    client_id: appId()!,
    redirect_uri: redirectUri()!,
    response_type: "code",
    scope: SCOPES,
    state: nonce,
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Token exchange — Facebook has no refresh_token grant like Google. A short-
// lived user token from the OAuth dialog is exchanged once for a long-lived
// one (~60 days); that long-lived token is then extended by re-exchanging
// it for a fresh 60 days before it expires, rather than a stored refresh
// credential.
// ---------------------------------------------------------------------------

type ShortLivedToken = { accessToken: string; expiresIn: number };

export async function exchangeCodeForToken(code: string): Promise<ShortLivedToken | null> {
  const params = new URLSearchParams({
    client_id: appId()!,
    client_secret: appSecret()!,
    redirect_uri: redirectUri()!,
    code,
  });
  const res = await safeFetch(`${GRAPH_URL}/oauth/access_token?${params.toString()}`);
  if (!res || !res.ok) return null;
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 3600 };
}

async function exchangeForLongLivedToken(shortLivedToken: string): Promise<ShortLivedToken | null> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId()!,
    client_secret: appSecret()!,
    fb_exchange_token: shortLivedToken,
  });
  const res = await safeFetch(`${GRAPH_URL}/oauth/access_token?${params.toString()}`);
  if (!res || !res.ok) return null;
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 60 * 24 * 60 * 60 };
}

export async function fetchMetaUser(accessToken: string): Promise<{ id: string; name: string } | null> {
  const res = await safeFetch(`${GRAPH_URL}/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`);
  if (!res || !res.ok) return null;
  return res.json();
}

// Single-row upsert — one shared connection for the whole company. Any
// admin reconnecting overwrites the same row rather than creating a second
// connection, per the confirmed design decision.
export async function saveMetaAccount(userId: string, code: string): Promise<{ ok: boolean; error?: string }> {
  const short = await exchangeCodeForToken(code);
  if (!short) return { ok: false, error: "token_exchange_failed" };
  const long = await exchangeForLongLivedToken(short.accessToken);
  if (!long) return { ok: false, error: "token_exchange_failed" };
  const me = await fetchMetaUser(long.accessToken);

  const existing = await prisma.metaAccount.findFirst();
  const expiresAt = new Date(Date.now() + long.expiresIn * 1000);
  const data = {
    connectedByUserId: userId,
    metaUserId: me?.id ?? "unknown",
    metaUserName: me?.name ?? null,
    accessToken: long.accessToken,
    expiresAt,
    scope: SCOPES,
  };
  if (existing) {
    await prisma.metaAccount.update({ where: { id: existing.id }, data });
  } else {
    await prisma.metaAccount.create({ data });
  }
  return { ok: true };
}

export async function disconnectMetaAccount(): Promise<void> {
  await prisma.metaAccount.deleteMany({});
}

// Re-exchanges the currently stored long-lived token for a fresh 60 days.
// Called opportunistically by getValidUserToken when the stored token is
// within 7 days of expiry — same "refresh if about to expire" shape as
// Google's getValidAccessToken, different mechanism since Facebook has no
// refresh_token grant.
export async function extendMetaToken(): Promise<boolean> {
  const account = await prisma.metaAccount.findFirst();
  if (!account) return false;
  const extended = await exchangeForLongLivedToken(account.accessToken);
  if (!extended) return false;
  await prisma.metaAccount.update({
    where: { id: account.id },
    data: { accessToken: extended.accessToken, expiresAt: new Date(Date.now() + extended.expiresIn * 1000) },
  });
  return true;
}

// Returns a valid user token, extending first if it's within 7 days of
// expiry. Returns null if never connected or the extension itself fails
// (revoked) — callers treat that as "not connected".
async function getValidUserToken(): Promise<string | null> {
  const account = await prisma.metaAccount.findFirst();
  if (!account) return null;
  if (account.expiresAt.getTime() > Date.now() + 7 * 24 * 60 * 60 * 1000) return account.accessToken;
  const extended = await extendMetaToken();
  if (!extended) return account.expiresAt.getTime() > Date.now() ? account.accessToken : null;
  const refreshed = await prisma.metaAccount.findFirst();
  return refreshed?.accessToken ?? null;
}

// ---------------------------------------------------------------------------
// Pages / Instagram discovery
// ---------------------------------------------------------------------------

export type MetaPageOption = {
  pageId: string;
  name: string;
  pageAccessToken: string;
  category: string | null;
  igBusinessAccountId?: string;
  igUsername?: string;
};

export async function listManageablePages(): Promise<MetaPageOption[] | null> {
  const token = await getValidUserToken();
  if (!token) return null;
  const res = await safeFetch(`${GRAPH_URL}/me/accounts?fields=id,name,access_token,category&access_token=${encodeURIComponent(token)}`);
  if (!res || !res.ok) return null;
  const data = (await res.json()) as { data: { id: string; name: string; access_token: string; category?: string }[] };

  const pages: MetaPageOption[] = [];
  for (const p of data.data ?? []) {
    const igRes = await safeFetch(`${GRAPH_URL}/${p.id}?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(p.access_token)}`);
    const ig = igRes && igRes.ok ? ((await igRes.json()) as { instagram_business_account?: { id: string; username: string } }) : null;
    pages.push({
      pageId: p.id,
      name: p.name,
      pageAccessToken: p.access_token,
      category: p.category ?? null,
      igBusinessAccountId: ig?.instagram_business_account?.id,
      igUsername: ig?.instagram_business_account?.username,
    });
  }
  return pages;
}

// Re-fetches and upserts MetaPage rows by pageId — called right after
// connect, and available as a manual "Refresh pages" action for when a Page
// is added to the Business Portfolio after the initial connect.
export async function refreshManagedPages(): Promise<{ ok: boolean; count?: number }> {
  const account = await prisma.metaAccount.findFirst();
  if (!account) return { ok: false };
  const pages = await listManageablePages();
  if (!pages) return { ok: false };
  for (const p of pages) {
    await prisma.metaPage.upsert({
      where: { pageId: p.pageId },
      create: {
        metaAccountId: account.id,
        pageId: p.pageId,
        name: p.name,
        pageAccessToken: p.pageAccessToken,
        category: p.category,
        igBusinessAccountId: p.igBusinessAccountId,
        igUsername: p.igUsername,
      },
      update: {
        name: p.name,
        pageAccessToken: p.pageAccessToken,
        category: p.category,
        igBusinessAccountId: p.igBusinessAccountId,
        igUsername: p.igUsername,
      },
    });
  }
  return { ok: true, count: pages.length };
}

// Transaction: unset all, set one — identical shape to the existing
// Google Drive designateStorageAccount pattern.
export async function setActivePage(pageId: string): Promise<void> {
  await prisma.$transaction([
    prisma.metaPage.updateMany({ data: { isActive: false }, where: {} }),
    prisma.metaPage.update({ where: { pageId }, data: { isActive: true } }),
  ]);
}

// ---------------------------------------------------------------------------
// Ad accounts discovery
// ---------------------------------------------------------------------------

export type MetaAdAccountOption = { adAccountId: string; name: string; currency: string; accountStatus: number };

export async function listAdAccounts(): Promise<MetaAdAccountOption[] | null> {
  const token = await getValidUserToken();
  if (!token) return null;
  const res = await safeFetch(`${GRAPH_URL}/me/adaccounts?fields=name,currency,account_status&access_token=${encodeURIComponent(token)}`);
  if (!res || !res.ok) return null;
  const data = (await res.json()) as { data: { id: string; name: string; currency: string; account_status: number }[] };
  return (data.data ?? []).map((a) => ({ adAccountId: a.id, name: a.name, currency: a.currency, accountStatus: a.account_status }));
}

export async function refreshAdAccounts(): Promise<{ ok: boolean; count?: number }> {
  const account = await prisma.metaAccount.findFirst();
  if (!account) return { ok: false };
  const accounts = await listAdAccounts();
  if (!accounts) return { ok: false };
  for (const a of accounts) {
    await prisma.metaAdAccount.upsert({
      where: { adAccountId: a.adAccountId },
      create: { metaAccountId: account.id, adAccountId: a.adAccountId, name: a.name, currency: a.currency, accountStatus: a.accountStatus },
      update: { name: a.name, currency: a.currency, accountStatus: a.accountStatus },
    });
  }
  return { ok: true, count: accounts.length };
}

export async function setActiveAdAccount(adAccountId: string): Promise<void> {
  await prisma.$transaction([
    prisma.metaAdAccount.updateMany({ data: { isActive: false }, where: {} }),
    prisma.metaAdAccount.update({ where: { adAccountId }, data: { isActive: true } }),
  ]);
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

export async function publishToFacebookPage(
  pageId: string,
  pageAccessToken: string,
  opts: { imageUrl?: string; caption: string },
): Promise<{ ok: true; postId: string } | { ok: false; error: string }> {
  const endpoint = opts.imageUrl ? `${GRAPH_URL}/${pageId}/photos` : `${GRAPH_URL}/${pageId}/feed`;
  const body = opts.imageUrl
    ? { url: opts.imageUrl, caption: opts.caption, access_token: pageAccessToken }
    : { message: opts.caption, access_token: pageAccessToken };
  const res = await safeFetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res) return { ok: false, error: "Network error reaching Meta." };
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.error?.message ?? "Facebook rejected the post." };
  return { ok: true, postId: data.post_id ?? data.id };
}

// Instagram Content Publishing API — two-step: create a media container,
// then publish it. Always needs an image; unlike Facebook's feed endpoint
// there is no text-only path.
export async function publishToInstagram(
  igBusinessAccountId: string,
  pageAccessToken: string,
  opts: { imageUrl: string; caption: string },
): Promise<{ ok: true; mediaId: string } | { ok: false; error: string }> {
  const createRes = await safeFetch(`${GRAPH_URL}/${igBusinessAccountId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: opts.imageUrl, caption: opts.caption, access_token: pageAccessToken }),
  });
  if (!createRes) return { ok: false, error: "Network error reaching Meta." };
  const created = await createRes.json().catch(() => ({}));
  if (!createRes.ok || !created.id) return { ok: false, error: created?.error?.message ?? "Instagram rejected the media." };

  const publishRes = await safeFetch(`${GRAPH_URL}/${igBusinessAccountId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: created.id, access_token: pageAccessToken }),
  });
  if (!publishRes) return { ok: false, error: "Network error reaching Meta." };
  const published = await publishRes.json().catch(() => ({}));
  if (!publishRes.ok || !published.id) return { ok: false, error: published?.error?.message ?? "Instagram publish failed." };
  return { ok: true, mediaId: published.id };
}

export async function fetchPermalink(objectId: string, accessToken: string): Promise<string | null> {
  const res = await safeFetch(`${GRAPH_URL}/${objectId}?fields=permalink_url&access_token=${encodeURIComponent(accessToken)}`);
  if (!res || !res.ok) return null;
  const data = (await res.json()) as { permalink_url?: string };
  return data.permalink_url ?? null;
}
