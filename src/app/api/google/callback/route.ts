import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { exchangeCodeForTokens, saveGoogleAccount, GOOGLE_OAUTH_NONCE_COOKIE } from "@/lib/google";

export async function GET(req: Request) {
  const user = await requireUser();
  const url = new URL(req.url);
  const settings = (query: string) => NextResponse.redirect(new URL(`/settings?${query}`, url));

  const error = url.searchParams.get("error");
  if (error) return settings(`googleError=${encodeURIComponent(error)}`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedNonce = req.headers.get("cookie")?.match(new RegExp(`${GOOGLE_OAUTH_NONCE_COOKIE}=([^;]+)`))?.[1];
  if (!code || !state || !expectedNonce || state !== expectedNonce) {
    return settings("googleError=invalid_state");
  }

  const tokens = await exchangeCodeForTokens(code);
  if (!tokens) return settings("googleError=token_exchange_failed");

  await saveGoogleAccount(user.id, tokens);

  const res = settings("googleConnected=1");
  res.cookies.delete({ name: GOOGLE_OAUTH_NONCE_COOKIE, path: "/api/google" });
  return res;
}
