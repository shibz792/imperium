import { NextResponse } from "next/server";
import { requireRole, ADMIN_ROLES } from "@/lib/auth";
import { metaOAuthConfigured, buildAuthUrl, newNonce, META_OAUTH_NONCE_COOKIE } from "@/lib/meta";

// Starting point for "Connect Meta" on the Settings page. A plain GET link
// rather than a server action — this needs to issue a real HTTP redirect to
// facebook.com, not a Next.js navigation. Admin-only: this connects the one
// shared, company-wide Meta account the whole team publishes/advertises
// through, not a personal integration like Google Calendar.
export async function GET(req: Request) {
  await requireRole(ADMIN_ROLES); // redirects if not signed in / not admin
  if (!metaOAuthConfigured()) {
    return NextResponse.redirect(new URL("/settings?metaError=not_configured", req.url));
  }

  const nonce = newNonce();
  const res = NextResponse.redirect(buildAuthUrl(nonce));
  res.cookies.set(META_OAUTH_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/api/meta",
  });
  return res;
}
