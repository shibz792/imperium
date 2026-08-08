import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

// Google OAuth (Calendar two-way sync + Drive import) — same two-tier shape
// as Groq and WhatsApp elsewhere in this app: fully coded against Google's
// documented contract, silently inactive until GOOGLE_CLIENT_ID/SECRET are
// set. Every function here fails soft (returns null / false) rather than
// throwing when a user simply hasn't connected an account — Calendar/Drive
// are conveniences layered on top of the CRM, never something a core action
// (scheduling a viewing, creating a task) should be blocked by.

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
].join(" ");

function clientId() {
  return process.env.GOOGLE_CLIENT_ID;
}
function clientSecret() {
  return process.env.GOOGLE_CLIENT_SECRET;
}
function redirectUri() {
  return process.env.GOOGLE_REDIRECT_URI;
}

export function googleOAuthConfigured(): boolean {
  return Boolean(clientId() && clientSecret() && redirectUri());
}

// Every network call in this file goes through here so a thrown network
// error (DNS, timeout, Google having a bad day) fails soft — a null
// response, same shape as "Google said no" — instead of an unhandled
// rejection blowing up whatever CRM action triggered the calendar/Drive
// sync. Calendar and Drive are conveniences, never allowed to take down
// the viewing/task action they're layered on top of.
async function safeFetch(url: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, init);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// state param — a plain anti-CSRF nonce, not an identity carrier. /connect
// mints one, stores it in a short-lived httpOnly cookie, and passes it as
// `state`; /callback checks the two match before trusting the code. Who the
// tokens belong to comes from the logged-in session at /callback time, the
// same as any other authenticated request — simpler than round-tripping a
// signed userId through Google and back.
// ---------------------------------------------------------------------------

export const GOOGLE_OAUTH_NONCE_COOKIE = "google_oauth_nonce";

export function newNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function buildAuthUrl(nonce: string): string {
  const params = new URLSearchParams({
    client_id: clientId()!,
    redirect_uri: redirectUri()!,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent", // forces a refresh_token on every connect, not just the first ever
    state: nonce,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Token exchange / refresh / storage
// ---------------------------------------------------------------------------

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number; scope: string; token_type: string };

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse | null> {
  const res = await safeFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId()!,
      client_secret: clientSecret()!,
      redirect_uri: redirectUri()!,
      grant_type: "authorization_code",
    }),
  });
  if (!res || !res.ok) return null;
  return res.json();
}

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date } | null> {
  const res = await safeFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId()!,
      client_secret: clientSecret()!,
      grant_type: "refresh_token",
    }),
  });
  if (!res || !res.ok) return null;
  const data = (await res.json()) as { access_token: string; expires_in: number };
  return { accessToken: data.access_token, expiresAt: new Date(Date.now() + data.expires_in * 1000) };
}

export async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  const res = await safeFetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res || !res.ok) return null;
  const data = (await res.json()) as { email?: string };
  return data.email ?? null;
}

export async function saveGoogleAccount(userId: string, tokens: TokenResponse): Promise<void> {
  const email = (await fetchGoogleEmail(tokens.access_token)) ?? "connected";
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  await prisma.googleAccount.upsert({
    where: { userId },
    create: {
      userId,
      email,
      accessToken: tokens.access_token,
      // Google only sends a refresh_token on the first-ever consent for a
      // given user+client pair; prompt=consent above forces it every time,
      // but fall back to keeping the existing one if it's ever absent.
      refreshToken: tokens.refresh_token ?? "",
      expiresAt,
      scope: tokens.scope,
    },
    update: {
      email,
      accessToken: tokens.access_token,
      ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
      expiresAt,
      scope: tokens.scope,
    },
  });
}

export async function disconnectGoogleAccount(userId: string): Promise<void> {
  await prisma.googleAccount.deleteMany({ where: { userId } });
}

// Returns a valid access token for this user, refreshing first if it's
// expired or about to. Returns null if the user has never connected, or if
// the refresh itself fails (revoked access) — callers treat that as "not
// connected" rather than surfacing a raw error.
async function getValidAccessToken(userId: string): Promise<string | null> {
  const account = await prisma.googleAccount.findUnique({ where: { userId } });
  if (!account) return null;
  if (account.expiresAt.getTime() > Date.now() + 60_000) return account.accessToken;
  if (!account.refreshToken) return null;
  const refreshed = await refreshAccessToken(account.refreshToken);
  if (!refreshed) return null;
  await prisma.googleAccount.update({ where: { userId }, data: { accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt } });
  return refreshed.accessToken;
}

export async function isGoogleConnected(userId: string): Promise<boolean> {
  const account = await prisma.googleAccount.findUnique({ where: { userId }, select: { id: true } });
  return Boolean(account);
}

// ---------------------------------------------------------------------------
// Calendar — push viewings/tasks out as events, check freebusy before
// double-booking an agent. "primary" calendar only; no calendar picker —
// keeps the connect flow to one click instead of a second setup step.
// ---------------------------------------------------------------------------

export type CalendarEventInput = { title: string; description?: string; start: Date; end: Date; location?: string };

export async function createCalendarEvent(userId: string, input: CalendarEventInput): Promise<string | null> {
  const token = await getValidAccessToken(userId);
  if (!token) return null;
  const res = await safeFetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(toGoogleEvent(input)),
  });
  if (!res || !res.ok) return null;
  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function updateCalendarEvent(userId: string, eventId: string, input: CalendarEventInput): Promise<boolean> {
  const token = await getValidAccessToken(userId);
  if (!token) return false;
  const res = await safeFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(toGoogleEvent(input)),
  });
  return Boolean(res?.ok);
}

export async function deleteCalendarEvent(userId: string, eventId: string): Promise<boolean> {
  const token = await getValidAccessToken(userId);
  if (!token) return false;
  // 410 Gone (already deleted on the Google side, e.g. by the user) counts
  // as success — the end state we want either way is "no event".
  const res = await safeFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return Boolean(res && (res.ok || res.status === 410 || res.status === 404));
}

function toGoogleEvent(input: CalendarEventInput) {
  return {
    summary: input.title,
    description: input.description,
    location: input.location,
    start: { dateTime: input.start.toISOString() },
    end: { dateTime: input.end.toISOString() },
  };
}

// Busy intervals for this user's primary calendar in [timeMin, timeMax].
// Returns null (not an empty array) when the user isn't connected, so
// callers can tell "no conflict data available" apart from "confirmed free".
export async function freeBusy(userId: string, timeMin: Date, timeMax: Date): Promise<{ start: string; end: string }[] | null> {
  const token = await getValidAccessToken(userId);
  if (!token) return null;
  const res = await safeFetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), items: [{ id: "primary" }] }),
  });
  if (!res || !res.ok) return null;
  const data = (await res.json()) as { calendars?: Record<string, { busy?: { start: string; end: string }[] }> };
  return data.calendars?.primary?.busy ?? [];
}

// ---------------------------------------------------------------------------
// Drive — browse and import existing files. drive.readonly (not drive.file)
// on purpose: drive.file would only ever see files this app itself created,
// which defeats "pull in the photos already sitting in my Drive".
// ---------------------------------------------------------------------------

export type DriveFile = { id: string; name: string; mimeType: string; iconLink?: string; thumbnailLink?: string; modifiedTime?: string };

export async function listDriveFiles(userId: string, opts: { folderId?: string; query?: string; pageToken?: string } = {}): Promise<{ files: DriveFile[]; nextPageToken?: string } | null> {
  const token = await getValidAccessToken(userId);
  if (!token) return null;
  const clauses = ["trashed = false"];
  if (opts.folderId) clauses.push(`'${opts.folderId}' in parents`);
  else if (!opts.query) clauses.push("'root' in parents");
  if (opts.query) clauses.push(`name contains '${opts.query.replace(/'/g, "\\'")}'`);

  const params = new URLSearchParams({
    q: clauses.join(" and "),
    fields: "nextPageToken, files(id, name, mimeType, iconLink, thumbnailLink, modifiedTime)",
    orderBy: "folder,modifiedTime desc",
    pageSize: "50",
  });
  if (opts.pageToken) params.set("pageToken", opts.pageToken);

  const res = await safeFetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res || !res.ok) return null;
  return res.json();
}

const GOOGLE_NATIVE_PREFIX = "application/vnd.google-apps.";

export async function downloadDriveFile(userId: string, fileId: string): Promise<{ buffer: Buffer; mimeType: string; name: string } | null> {
  const token = await getValidAccessToken(userId);
  if (!token) return null;

  const metaRes = await safeFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes || !metaRes.ok) return null;
  const meta = (await metaRes.json()) as { name: string; mimeType: string };
  // Google Docs/Sheets/Slides have no raw bytes to download — they'd need
  // files.export to a target format, out of scope here (this import path is
  // for photos and documents, not converting native Google files).
  if (meta.mimeType.startsWith(GOOGLE_NATIVE_PREFIX) || meta.mimeType === "application/vnd.google-apps.folder") return null;

  const fileRes = await safeFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!fileRes || !fileRes.ok) return null;
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  return { buffer, mimeType: meta.mimeType, name: meta.name };
}
