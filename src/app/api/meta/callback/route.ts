import { NextResponse } from "next/server";
import { requireRole, ADMIN_ROLES } from "@/lib/auth";
import { saveMetaAccount, refreshManagedPages, refreshAdAccounts, META_OAUTH_NONCE_COOKIE } from "@/lib/meta";

export async function GET(req: Request) {
  const user = await requireRole(ADMIN_ROLES);
  const url = new URL(req.url);
  const settings = (query: string) => NextResponse.redirect(new URL(`/settings?${query}`, url));

  const error = url.searchParams.get("error");
  if (error) return settings(`metaError=${encodeURIComponent(error)}`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedNonce = req.headers.get("cookie")?.match(new RegExp(`${META_OAUTH_NONCE_COOKIE}=([^;]+)`))?.[1];
  if (!code || !state || !expectedNonce || state !== expectedNonce) {
    return settings("metaError=invalid_state");
  }

  const saved = await saveMetaAccount(user.id, code);
  if (!saved.ok) return settings(`metaError=${encodeURIComponent(saved.error ?? "token_exchange_failed")}`);

  // Discover Pages/Instagram accounts/ad accounts right away so the
  // Settings page has something to show the moment the connect finishes,
  // rather than an empty "connected but nothing to pick from" state.
  await Promise.all([refreshManagedPages(), refreshAdAccounts()]);

  const res = settings("metaConnected=1");
  res.cookies.delete({ name: META_OAUTH_NONCE_COOKIE, path: "/api/meta" });
  return res;
}
