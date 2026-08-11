import Link from "next/link";
import { CheckCircle2, Circle, Share2, Camera, Wallet, MessageCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { whatsappCloudConfigured, whatsappBusinessAccountConfigured, listMessageTemplates } from "@/lib/whatsapp";

// Read-only status summary — the actual connect/disconnect/choose-active
// action lives in Settings (one place to manage a shared connection,
// avoids duplicating that UI here) but status is visible right where the
// work happens, not just as a surprise "why is this button disabled".
export async function ConnectionsPanel() {
  const [page, adAccount, templates] = await Promise.all([
    prisma.metaPage.findFirst({ where: { isActive: true } }),
    prisma.metaAdAccount.findFirst({ where: { isActive: true } }),
    whatsappBusinessAccountConfigured() ? listMessageTemplates() : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-3">
      <div className="ir-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ir-navy"><Share2 size={15} /> Facebook Page</h2>
        <Row ok={Boolean(page)} label={page ? `Publishing to "${page.name}"` : "No active Page"} />
      </div>
      <div className="ir-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ir-navy"><Camera size={15} /> Instagram</h2>
        <Row ok={Boolean(page?.igBusinessAccountId)} label={page?.igUsername ? `Publishing to @${page.igUsername}` : "No linked Instagram Business Account"} />
      </div>
      <div className="ir-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ir-navy"><Wallet size={15} /> Ad account</h2>
        <Row ok={Boolean(adAccount)} label={adAccount ? `${adAccount.name} (${adAccount.currency})` : "No active ad account"} />
      </div>
      <div className="ir-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ir-navy"><MessageCircle size={15} /> WhatsApp Business</h2>
        <Row ok={whatsappCloudConfigured()} label={whatsappCloudConfigured() ? "Cloud API connected" : "Not configured"} />
        {whatsappCloudConfigured() && (
          <Row ok={whatsappBusinessAccountConfigured()} label={whatsappBusinessAccountConfigured() ? `${templates?.length ?? 0} message template${templates?.length === 1 ? "" : "s"}` : "No message templates (WHATSAPP_BUSINESS_ACCOUNT_ID not set)"} />
        )}
      </div>
      <Link href="/settings" className="text-xs font-medium text-ir-gold-dark hover:underline">
        Manage connections in Settings →
      </Link>
    </div>
  );
}

function Row({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-black/70">
      {ok ? <CheckCircle2 size={14} className="text-[color:var(--color-forest)]" /> : <Circle size={14} className="text-black/25" />}
      {label}
    </div>
  );
}
