// Thin wrapper around the Groq chat completions API (OpenAI-compatible).
// Used as the AI Intake extraction engine when GROQ_API_KEY is configured.
// Falls back silently to null so callers can drop back to the heuristic
// parser — AI Intake must never hard-fail just because a key isn't set.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// llama-3.3-70b-versatile was decommissioned by Groq (confirmed live against
// /openai/v1/models — no longer in their catalog at all) and every call was
// silently falling back to the heuristic parser as a result. Verified this
// replacement live: real request with response_format json_object, correct
// JSON back. Kept as a fallback for when GROQ_MODEL isn't set — the env var
// on Vercel is the actual source of truth and can move to a newer model
// without a code change.
const DEFAULT_MODEL = "openai/gpt-oss-120b";

export function groqConfigured() {
  return Boolean(process.env.GROQ_API_KEY);
}

export type GroqChatMessage = { role: "system" | "user" | "assistant"; content: string };

// Multi-turn variant — needed by the WhatsApp lead-chat agent, which has to
// replay real conversation history (not just one system + one user string)
// so the model actually remembers what was already asked/answered.
export async function groqChat<T = unknown>(messages: GroqChatMessage[]): Promise<T | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || DEFAULT_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages,
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      console.error("Groq API error", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content) as T;
  } catch (err) {
    console.error("Groq request failed", err);
    return null;
  }
}

// Single-shot convenience wrapper — every existing caller (AI Intake,
// Marketing Studio, Notes AI) just wants one system + one user string.
export async function groqJson<T = unknown>(system: string, user: string): Promise<T | null> {
  return groqChat<T>([
    { role: "system", content: system },
    { role: "user", content: user },
  ]);
}
