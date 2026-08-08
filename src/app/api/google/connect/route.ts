import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { googleOAuthConfigured, buildAuthUrl, newNonce, GOOGLE_OAUTH_NONCE_COOKIE } from "@/lib/google";

// Starting point for "Connect Google" on the Settings page. A plain GET link
// rather than a server action — this needs to issue a real HTTP redirect to
// accounts.google.com, not a Next.js navigation.
export async function GET(req: Request) {
  await requireUser(); // redirects to /login if not signed in
  if (!googleOAuthConfigured()) {
    return NextResponse.redirect(new URL("/settings?googleError=not_configured", req.url));
  }

  const nonce = newNonce();
  const res = NextResponse.redirect(buildAuthUrl(nonce));
  res.cookies.set(GOOGLE_OAUTH_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/api/google",
  });
  return res;
}
