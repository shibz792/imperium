import { Resend } from "resend";

// Same two-tier shape as WhatsApp/Google elsewhere in this app: fully
// coded against Resend's real API, silently inactive until RESEND_API_KEY
// is set. RESEND_FROM_EMAIL lets a verified sending domain be used once
// one exists; Resend's own onboarding address works with no domain setup
// for getting this running immediately.
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(to: string, subject: string, body: string): Promise<{ ok: boolean; error?: string }> {
  if (!emailConfigured()) return { ok: false, error: "Email sending isn't configured yet (RESEND_API_KEY)." };
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = process.env.RESEND_FROM_EMAIL || "Imperium Realty <onboarding@resend.dev>";
    const { error } = await resend.emails.send({ from, to, subject, text: body });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Send failed." };
  }
}

// EMAIL_CAMPAIGN content is generated as "Subject: ...\n\n<body>" by
// design (see CHANNEL_SPECS in lib/marketing.ts) precisely so this split
// is a one-line parse instead of asking the model to return separate
// JSON fields for something it's already writing as plain text.
export function parseEmailContent(content: string): { subject: string; body: string } {
  const match = content.match(/^Subject:\s*(.+?)\r?\n\r?\n([\s\S]*)$/i);
  if (match) return { subject: match[1].trim(), body: match[2].trim() };
  return { subject: "A property from Imperium Realty", body: content };
}
