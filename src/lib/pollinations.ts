// Free, keyless image generation via Pollinations.ai (open Stable-Diffusion
// / Flux models, no signup, no billing). No "configured" gate like groq.ts
// or a real API key — it's always available — but there's also no uptime
// or content-quality guarantee behind a free anonymous endpoint, so every
// caller must treat a null result as an expected outcome, not an error to
// surface as broken. Never used for anything claiming to depict a real,
// specific property — see the AI-concept labeling in marketingImage.ts and
// the comment at the top of that file for why.

const POLLINATIONS_BASE = "https://image.pollinations.ai/prompt";

export async function generatePollinationsImage(
  prompt: string,
  opts: { width: number; height: number; seed?: number },
): Promise<Buffer | null> {
  try {
    const url =
      `${POLLINATIONS_BASE}/${encodeURIComponent(prompt)}` +
      `?width=${opts.width}&height=${opts.height}&nologo=true&model=flux&safe=true` +
      (opts.seed !== undefined ? `&seed=${opts.seed}` : "");
    // The service can be slow under load — bound the wait so a stalled
    // request doesn't hang whatever server action called this indefinitely.
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return buffer.length > 0 ? buffer : null;
  } catch {
    return null;
  }
}

// Image-to-image retouch of a *real* property photo via Pollinations' Kontext
// model — passed a publicly-fetchable URL (Pollinations fetches it itself,
// there's no raw-bytes upload on the free endpoint) plus a deliberately
// conservative prompt. This is retouching, not generation: same room, same
// property, just lighting/color/sky improved — never used to add, remove, or
// invent anything in the frame. `sourceImageUrl` must be publicly reachable
// (won't work against a localhost dev server); any failure returns null so
// the caller can fall back to the untouched original, same discipline as
// generatePollinationsImage.
export async function enhancePropertyPhoto(
  sourceImageUrl: string,
  opts: { width: number; height: number },
): Promise<Buffer | null> {
  try {
    const prompt =
      "subtle professional real estate photo retouch: improve natural lighting, color balance and sky only; " +
      "do not add, remove, move, or alter any furniture, structures, rooms, or objects; keep composition and " +
      "every real detail exactly as-is";
    const url =
      `${POLLINATIONS_BASE}/${encodeURIComponent(prompt)}` +
      `?model=kontext&image=${encodeURIComponent(sourceImageUrl)}` +
      `&width=${opts.width}&height=${opts.height}&nologo=true&safe=true`;
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(45000) });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return buffer.length > 0 ? buffer : null;
  } catch {
    return null;
  }
}
