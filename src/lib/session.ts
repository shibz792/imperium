import crypto from "node:crypto";

// Lightweight, dependency-free signed-cookie session. No session table needed —
// the cookie itself is the credential, HMAC-signed so it can't be forged.
// Good enough for a local/demo deployment; swap for NextAuth/Lucia + a real
// session store before this ever leaves localhost.

const SECRET = process.env.SESSION_SECRET || "imperium-realty-dev-secret-change-me";
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
