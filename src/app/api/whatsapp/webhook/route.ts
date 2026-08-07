import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookHandshake, verifyWebhookSignature, parseInboundMessages } from "@/lib/whatsapp";
import { runAiIntake } from "@/lib/ai-intake";

// Point Meta's WhatsApp Business app at
// https://<your-domain>/api/whatsapp/webhook with WHATSAPP_VERIFY_TOKEN set
// in .env. Not reachable from Meta until this app is deployed somewhere
// with a public HTTPS URL — localhost can't receive webhooks — but the
// handshake and signature verification below match Meta's contract exactly
// and are ready the moment it is.

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const challenge = verifyWebhookHandshake(
    searchParams.get("hub.mode"),
    searchParams.get("hub.verify_token"),
    searchParams.get("hub.challenge"),
  );
  if (challenge === null) return new NextResponse("Forbidden", { status: 403 });
  return new NextResponse(challenge, { status: 200 });
}

export async function POST(req: Request) {
  const rawBody = await req.text();

  if (process.env.WHATSAPP_APP_SECRET) {
    const valid = verifyWebhookSignature(rawBody, req.headers.get("x-hub-signature-256"));
    if (!valid) return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Bad payload", { status: 400 });
  }

  const messages = parseInboundMessages(payload);
  for (const msg of messages) {
    // Same extraction pipeline as pasted text or a sourced listing — the
    // draft is stored for review, never auto-published.
    const result = await runAiIntake(msg.text, "AUTO");
    await prisma.aiIntakeJob.create({
      data: {
        rawText: `WhatsApp from ${msg.profileName ?? msg.from} (${msg.from}):\n${msg.text}`,
        mode: "AUTO",
        engine: result.engine,
        resultJson: result.drafts as never,
      },
    });
  }

  return NextResponse.json({ received: messages.length });
}
