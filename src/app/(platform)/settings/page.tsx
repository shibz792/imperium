import { CalendarClock, CloudDownload, CheckCircle2, HardDrive, TriangleAlert } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser, isAdmin } from "@/lib/auth";
import { PageHeader, SectionCard } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { googleOAuthConfigured } from "@/lib/google";
import { disconnectGoogle, setStorageAccount } from "./actions";

// Present since before drive.file (upload permission) existed in this
// app's requested scope — an account connected before that was added only
// has read access until it's reconnected and re-consents. Checked against
// the scope actually granted at connect time, not assumed.
function hasUploadScope(scope: string) {
  return scope.includes("drive.file");
}

const ERROR_MESSAGES: Record<string, string> = {
  not_configured: "Google isn't configured on this deployment yet (missing GOOGLE_CLIENT_ID/SECRET).",
  invalid_state: "That connection attempt expired or didn't look right — try Connect again.",
  token_exchange_failed: "Google didn't accept that authorization — try Connect again.",
  access_denied: "You cancelled the Google sign-in.",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ googleConnected?: string; googleError?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const admin = isAdmin(user);

  const [account, allAccounts] = await Promise.all([
    prisma.googleAccount.findUnique({ where: { userId: user.id } }),
    admin ? prisma.googleAccount.findMany({ include: { user: true }, orderBy: { createdAt: "asc" } }) : Promise.resolve([]),
  ]);
  const storageAccount = admin ? allAccounts.find((a) => a.isStorageAccount) : await prisma.googleAccount.findFirst({ where: { isStorageAccount: true } });

  return (
    <div>
      <PageHeader eyebrow="Settings" title="Your account" description="Connections that are personal to you — each teammate connects their own." />

      {sp.googleConnected && (
        <div className="mb-5 flex items-center gap-2 rounded border border-[color:var(--color-forest)]/30 bg-[color:var(--color-forest)]/10 px-4 py-2.5 text-sm text-[color:var(--color-forest)]">
          <CheckCircle2 size={15} /> Google connected.
        </div>
      )}
      {sp.googleError && (
        <div className="mb-5 rounded border border-[#92601f4d] bg-[color:var(--color-bronze-tint)] px-4 py-2.5 text-sm text-[color:var(--color-bronze)]">
          {ERROR_MESSAGES[sp.googleError] ?? "Something went wrong connecting Google — try again."}
        </div>
      )}

      <SectionCard title="Google">
        {!googleOAuthConfigured() ? (
          <p className="text-sm text-black/50">Google isn&apos;t set up on this deployment yet.</p>
        ) : account ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-ir-navy">
                <CheckCircle2 size={15} className="text-[color:var(--color-forest)]" /> Connected as {account.email}
              </div>
              <div className="mt-1 text-xs text-black/40">Since {formatDateTime(account.createdAt)}</div>
              <ul className="mt-3 space-y-1 text-xs text-black/50">
                <li className="flex items-center gap-1.5"><CalendarClock size={12} /> Your viewings and tasks push to your primary Google Calendar, and scheduling a viewing checks it for conflicts.</li>
                <li className="flex items-center gap-1.5"><CloudDownload size={12} /> You can browse and import your own Drive files — they&apos;re saved into the company&apos;s shared Property Media Drive below, not kept in your account.</li>
              </ul>
              {!hasUploadScope(account.scope) && (
                <div className="mt-3 flex items-start gap-1.5 rounded border border-[#92601f4d] bg-[color:var(--color-bronze-tint)] px-2.5 py-2 text-xs text-[color:var(--color-bronze)]">
                  <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                  <span>This connection predates upload permission and only has read access to Drive. Reconnect to grant it — nothing else about the connection changes.</span>
                </div>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <a href="/api/google/connect" className="ir-btn ir-btn-ghost">{hasUploadScope(account.scope) ? "Reconnect" : "Reconnect to grant upload access"}</a>
              <form action={disconnectGoogle}>
                <button type="submit" className="text-xs text-black/35 hover:text-[color:var(--color-brick)]">Disconnect</button>
              </form>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-black/60">Connect your Google account to sync viewings and tasks to your calendar, and browse Drive to import photos.</p>
              <p className="mt-1 text-xs text-black/40">You&apos;ll see Google&apos;s own consent screen next — this app only ever sees what you approve there.</p>
            </div>
            <a href="/api/google/connect" className="ir-btn ir-btn-gold shrink-0">Connect Google</a>
          </div>
        )}
      </SectionCard>

      <div className="mt-6">
        <SectionCard title="Property media storage">
          <div className="mb-3 flex items-center gap-2 text-sm text-ir-navy">
            <HardDrive size={15} className="text-black/40" />
            {storageAccount ? (
              <span>Every property photo is saved into <span className="font-medium">{storageAccount.email}</span>&apos;s Google Drive, in a folder per property. Anyone signed in can upload or view; only an admin can delete.</span>
            ) : (
              <span className="text-black/50">No storage account is set yet — property photo uploads won&apos;t work until an admin designates one below.</span>
            )}
          </div>
          {storageAccount && !hasUploadScope(storageAccount.scope) && (
            <div className="mb-3 flex items-start gap-1.5 rounded border border-[#92601f4d] bg-[color:var(--color-bronze-tint)] px-2.5 py-2 text-xs text-[color:var(--color-bronze)]">
              <TriangleAlert size={13} className="mt-0.5 shrink-0" />
              <span>
                Uploads will fail: {storageAccount.email} was connected before upload permission existed and only has read access to Drive. The account owner needs to hit Reconnect above — the storage designation itself doesn&apos;t need to change.
              </span>
            </div>
          )}

          {admin && (
            <div className="mt-4 border-t border-black/6 pt-4">
              <div className="ir-label mb-2">Connected accounts</div>
              {allAccounts.length === 0 ? (
                <p className="text-xs text-black/40">No one has connected Google yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {allAccounts.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 rounded border border-black/8 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm text-ir-navy">{a.email}</div>
                        <div className="text-[0.7rem] text-black/40">{a.user.name}</div>
                      </div>
                      {a.isStorageAccount ? (
                        <span className="ir-badge shrink-0 border-ir-gold/40 bg-ir-gold/10 text-ir-gold-dark">Storage account</span>
                      ) : (
                        <form action={setStorageAccount.bind(null, a.userId)} className="shrink-0">
                          <button type="submit" className="ir-btn ir-btn-ghost !py-1 !text-[0.7rem]">Use for storage</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
