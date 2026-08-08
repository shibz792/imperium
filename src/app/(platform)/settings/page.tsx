import { CalendarClock, CloudDownload, CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { PageHeader, SectionCard } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { googleOAuthConfigured } from "@/lib/google";
import { disconnectGoogle } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  not_configured: "Google isn't configured on this deployment yet (missing GOOGLE_CLIENT_ID/SECRET).",
  invalid_state: "That connection attempt expired or didn't look right — try Connect again.",
  token_exchange_failed: "Google didn't accept that authorization — try Connect again.",
  access_denied: "You cancelled the Google sign-in.",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ googleConnected?: string; googleError?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const account = await prisma.googleAccount.findUnique({ where: { userId: user.id } });

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
                <li className="flex items-center gap-1.5"><CloudDownload size={12} /> Photos and documents can be imported straight from Drive, from the property Media tab or the Document Vault.</li>
              </ul>
            </div>
            <form action={disconnectGoogle}>
              <button type="submit" className="ir-btn ir-btn-ghost">Disconnect</button>
            </form>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-black/60">Connect your Google account to sync viewings and tasks to your calendar, and import photos or documents straight from Drive.</p>
              <p className="mt-1 text-xs text-black/40">You&apos;ll see Google&apos;s own consent screen next — this app only ever sees what you approve there.</p>
            </div>
            <a href="/api/google/connect" className="ir-btn ir-btn-gold shrink-0">Connect Google</a>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
