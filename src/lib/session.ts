import crypto from "node:crypto";

// Lightweight, dependency-free signed-cookie session. No session table needed —
// the cookie itself is the credential, HMAC-signed so it can't be forged.
// Good enough for a local/demo deployment; swap for NextAuth/Lucia + a real
// session store before this ever leaves localhost.
//
// No fallback secret here on purpose: this file is on a public repo, so a
// hardcoded default would be a hardcoded skeleton key. If SESSION_SECRET
// isn't set, every signature check below fails closed instead of quietly
// signing with a value anyone reading the source already knows.
const rawSecret = process.env.SESSION_SECRET;
if (!rawSecret) {
  throw new Error("SESSION_SECRET is not set — generate one (e.g. `openssl rand -base64 48`) and add it to .env.");
}
const SECRET: string = rawSecret;
const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type SessionPayload = {
  userId: string;
  role: string;
  name: string;
  exp: number;
};

function sign(data: string) {
  return crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
}

export function createSessionToken(payload: Omit<SessionPayload, "exp">) {
  const full: SessionPayload = { ...payload, exp: Date.now() + TTL_SECONDS * 1000 };
  const data = Buffer.from(JSON.stringify(full)).toString("base64url");
  const sig = sign(data);
  return `${data}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  if (sign(data) !== sig) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "ir_session";
export const SESSION_MAX_AGE = TTL_SECONDS;
