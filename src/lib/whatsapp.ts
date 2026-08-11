import crypto from "node:crypto";

// Two tiers, same as Groq: click-to-chat needs zero setup and works today;
// the Cloud API tier activates automatically once real Meta credentials
// are dropped into .env — nothing else in the app needs to change.

export function waDigits(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  // Sri Lankan mobiles are commonly stored as 0771234567 — wa.me needs the
  // country code, not the leading trunk 0.
  if (digits.startsWith("0")) return "94" + digits.slice(1);
  return digits;
}

export function waLink(phone: string, message?: string): string {
  const base = `https://wa.me/${waDigits(phone)}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export function whatsappCloudConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
}

// Message templates are scoped to the WhatsApp Business Account (WABA), not
// the phone number itself — a separate id from WHATSAPP_PHONE_NUMBER_ID.
export function whatsappBusinessAccountConfigured(): boolean {
  return whatsappCloudConfigured() && Boolean(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID);
}

// ---------------------------------------------------------------------------
// WhatsApp Business Cloud API — outbound send. Code-complete against Meta's
// documented contract; not exercised against a live account since none is
// configured here. Silently unused until WHATSAPP_PHONE_NUMBER_ID /
// WHATSAPP_ACCESS_TOKEN are set.
// ---------------------------------------------------------------------------

export async function sendWhatsAppMessage(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  if (!whatsappCloudConfigured()) return { ok: false, error: "WhatsApp Cloud API is not configured (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN)." };
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: waDigits(to),
        type: "text",
        text: { body },
      }),
    });
    if (!res.ok) return { ok: false, error: `Meta API returned ${res.status}: ${await res.text().catch(() => "")}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Send failed." };
  }
}

// ---------------------------------------------------------------------------
// Message templates — sendWhatsAppMessage's free-form text only works
// within Meta's 24-hour customer-service window (i.e. after the customer
// has messaged first). Genuine business-initiated marketing sends outside
// that window require an approved Message Template instead.
// ---------------------------------------------------------------------------

export type MessageTemplate = { name: string; language: string; status: string; category: string; bodyText: string };

export async function listMessageTemplates(): Promise<MessageTemplate[] | null> {
  if (!whatsappBusinessAccountConfigured()) return null;
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates?fields=name,language,status,category,components`,
      { headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { data: Array<{ name: string; language: string; status: string; category: string; components: Array<{ type: string; text?: string }> }> };
    return data.data.map((t) => ({
      name: t.name,
      language: t.language,
      status: t.status,
      category: t.category,
      bodyText: t.components.find((c) => c.type === "BODY")?.text ?? "",
    }));
  } catch {
    return null;
  }
}

export async function sendTemplateMessage(to: string, templateName: string, language: string, params: string[]): Promise<{ ok: boolean; error?: string }> {
  if (!whatsappCloudConfigured()) return { ok: false, error: "WhatsApp Cloud API is not configured (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN)." };
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: waDigits(to),
        type: "template",
        template: {
          name: templateName,
          language: { code: language },
          components: params.length ? [{ type: "body", parameters: params.map((p) => ({ type: "text", text: p })) }] : [],
        },
      }),
    });
    if (!res.ok) return { ok: false, error: `Meta API returned ${res.status}: ${await res.text().catch(() => "")}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Send failed." };
  }
}

// ---------------------------------------------------------------------------
// Webhook verification — matches Meta's documented contract exactly:
// GET handshake echoes hub.challenge when hub.verify_token matches; inbound
// POST payloads are authenticated via the X-Hub-Signature-256 header
// (HMAC-SHA256 of the raw body using the App Secret).
// ---------------------------------------------------------------------------

export function verifyWebhookHandshake(mode: string | null, token: string | null, challenge: string | null): string | null {
  if (mode !== "subscribe") return null;
  if (!process.env.WHATSAPP_VERIFY_TOKEN || token !== process.env.WHATSAPP_VERIFY_TOKEN) return null;
  return challenge;
}

export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !signatureHeader) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export type InboundWhatsAppMessage = { from: string; text: string; profileName?: string };

// Meta's webhook payload shape for an inbound text message.
export function parseInboundMessages(payload: unknown): InboundWhatsAppMessage[] {
  const out: InboundWhatsAppMessage[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry ?? [];
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes ?? [];
    for (const change of changes) {
      const value = (change as { value?: Record<string, unknown> })?.value;
      const messages = (value?.messages as Array<Record<string, unknown>> | undefined) ?? [];
      const contacts = (value?.contacts as Array<{ profile?: { name?: string }; wa_id?: string }> | undefined) ?? [];
      for (const m of messages) {
        if (m.type !== "text") continue;
        const from = String(m.from ?? "");
        const text = String((m.text as { body?: string } | undefined)?.body ?? "");
        const profile = contacts.find((c) => c.wa_id === from);
        if (text) out.push({ from, text, profileName: profile?.profile?.name });
      }
    }
  }
  return out;
}
