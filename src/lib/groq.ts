// Thin wrapper around the Groq chat completions API (OpenAI-compatible).
// Used as the AI Intake extraction engine when GROQ_API_KEY is configured.
// Falls back silently to null so callers can drop back to the heuristic
// parser — AI Intake must never hard-fail just because a key isn't set.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

export function groqConfigured() {
  return Boolean(process.env.GROQ_API_KEY);
}

export async function groqJson<T = unknown>(system: string, user: string): Promise<T | null> {
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
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
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
