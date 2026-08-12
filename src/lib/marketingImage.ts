import sharp from "sharp";

// Composes a real, postable social tile from a property's actual photo —
// deliberately not a pure text-to-image model. Real estate marketing can't
// responsibly hallucinate a room that doesn't match the listing; this
// overlays AI-written headline text and the database's own price onto the
// real photo instead. Uses only system font families (Georgia / Arial)
// rather than embedding the brand's Fraunces/Jakarta font files — sharp's
// SVG text rendering (via librsvg/fontconfig) isn't guaranteed to have
// custom fonts available in a serverless environment, and a font that
// silently falls back mid-deploy is worse than one chosen to always resolve.
//
// The one narrow exception: generateSocialImage (marketing-studio/actions.ts)
// falls back to a Pollinations-generated background when a listing has no
// real photo yet (e.g. a pre-launch/off-plan property). That's still never
// presented as the actual unit — composeSocialImage's `aiConcept` flag bakes
// a permanent "AI CONCEPT — NOT ACTUAL PROPERTY" badge into the pixels so
// the disclosure can't be cropped or stripped out after download.
//
// A content piece must never fail to get its image just because a free,
// best-effort third-party service happened to be slow or unreachable —
// brandGradientBackground() below is the guaranteed last resort: generated
// entirely locally (no network call, can't fail the way a fetch can), so
// generateSocialImage always has *something* to composite text onto.

export type SocialImageFormat = "1:1" | "9:16";

const DIMENSIONS: Record<SocialImageFormat, { width: number; height: number }> = {
  "1:1": { width: 1080, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
};

// Brand tokens, mirrored from globals.css (--color-navy / --color-gold /
// --color-ivory) — kept as plain hex here since this runs server-side, no
// CSS custom properties available.
const NAVY = "#091526";
const GOLD = "#cca274";
const IVORY = "#f5f2ed";
const BRICK = "#8c4a3e";

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// Simple greedy word-wrap for the tagline — headline is already capped
// short enough by the generation prompt to fit on one line at its font size.
function wrapLine(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2);
}

// Guaranteed, network-free fallback: a plain on-brand gradient panel. Not
// a photo and doesn't pretend to be one, so it carries none of the AI
// disclosure badges — there's nothing to disclose, it's just a background
// color. Used only when both a real photo and the Pollinations concept
// image are unavailable.
export async function brandGradientBackground(format: SocialImageFormat): Promise<Buffer> {
  const { width, height } = DIMENSIONS[format];
  const svg = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${NAVY}" />
      <stop offset="100%" stop-color="#1c2f4d" />
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)" />
</svg>`.trim();
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function composeSocialImage(
  photoBuffer: Buffer,
  opts: { headline: string; tagline: string; priceLine: string; format: SocialImageFormat; aiConcept?: boolean; aiEnhanced?: boolean },
): Promise<Buffer> {
  const { width, height } = DIMENSIONS[opts.format];
  const scrimHeight = Math.round(height * (opts.format === "9:16" ? 0.4 : 0.42));
  const scrimTop = height - scrimHeight;
  const margin = Math.round(width * 0.07);
  const headlineSize = opts.format === "9:16" ? 58 : 64;
  const taglineSize = opts.format === "9:16" ? 30 : 32;
  const priceSize = opts.format === "9:16" ? 34 : 36;
  const wordmarkSize = 20;

  const taglineLines = wrapLine(opts.tagline, opts.format === "9:16" ? 26 : 34);
  const headlineY = scrimTop + headlineSize + 44;
  const taglineStartY = headlineY + taglineSize + 20;

  const taglineTspans = taglineLines
    .map((line, i) => `<tspan x="${margin}" dy="${i === 0 ? 0 : taglineSize + 8}">${escapeXml(line)}</tspan>`)
    .join("");

  const priceY = taglineStartY + taglineLines.length * (taglineSize + 8) + 30;
  const hairlineY = priceY + 34;
  const wordmarkY = hairlineY + 38;

  // Two distinct disclosure levels, both baked permanently into the pixels
  // (not just UI text around the image) so the disclosure can't be cropped
  // or stripped out after download:
  //  - aiConcept: the whole photo is an AI-generated stand-in (no real
  //    property photo exists yet) — loud, brick-red, impossible to miss.
  //  - aiEnhanced: it's still the listing's own real photo, only retouched
  //    (lighting/color/sky) by Pollinations' Kontext model — a quiet,
  //    on-brand gold pill, since nothing about the room itself changed.
  // Mutually exclusive by construction (generateSocialImage only enhances
  // when a real photo was found, and only falls back to a concept image
  // when none was) — aiConcept wins if both were ever somehow set.
  const badgeText = opts.aiConcept ? "AI CONCEPT — NOT ACTUAL PROPERTY" : opts.aiEnhanced ? "AI-ENHANCED PHOTO" : "";
  const badgeFill = opts.aiConcept ? BRICK : NAVY;
  const badgeTextFill = opts.aiConcept ? IVORY : GOLD;
  const badgeFontSize = Math.round(width * 0.021);
  const badgePadX = Math.round(badgeFontSize * 0.9);
  const badgeWidth = Math.round(badgeText.length * badgeFontSize * 0.62) + badgePadX * 2;
  const badgeHeight = Math.round(badgeFontSize * 2.1);
  const badge = badgeText
    ? `<rect x="${margin}" y="${margin}" width="${badgeWidth}" height="${badgeHeight}" rx="${badgeHeight / 2}" fill="${badgeFill}" fill-opacity="${opts.aiConcept ? 1 : 0.85}" />
  <text x="${margin + badgeWidth / 2}" y="${margin + badgeHeight / 2 + badgeFontSize * 0.34}" font-family="Arial, Helvetica, sans-serif" font-size="${badgeFontSize}" font-weight="bold" letter-spacing="1" fill="${badgeTextFill}" text-anchor="middle">${escapeXml(badgeText)}</text>`
    : "";

  const svg = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${NAVY}" stop-opacity="0" />
      <stop offset="35%" stop-color="${NAVY}" stop-opacity="0.55" />
      <stop offset="100%" stop-color="${NAVY}" stop-opacity="0.92" />
    </linearGradient>
  </defs>
  <rect x="0" y="${scrimTop}" width="${width}" height="${scrimHeight}" fill="url(#scrim)" />
  <text x="${margin}" y="${headlineY}" font-family="Georgia, 'Times New Roman', serif" font-size="${headlineSize}" font-weight="bold" fill="${IVORY}">${escapeXml(opts.headline)}</text>
  <text x="${margin}" y="${taglineStartY}" font-family="Arial, Helvetica, sans-serif" font-size="${taglineSize}" fill="${IVORY}" fill-opacity="0.85">${taglineTspans}</text>
  <text x="${margin}" y="${priceY}" font-family="Arial, Helvetica, sans-serif" font-size="${priceSize}" font-weight="bold" fill="${GOLD}">${escapeXml(opts.priceLine)}</text>
  <rect x="${margin}" y="${hairlineY}" width="${Math.round(width * 0.16)}" height="2" fill="${GOLD}" />
  <text x="${margin}" y="${wordmarkY}" font-family="Arial, Helvetica, sans-serif" font-size="${wordmarkSize}" letter-spacing="3" fill="${IVORY}" fill-opacity="0.75">IMPERIUM REALTY</text>
  ${badge}
</svg>`.trim();

  const base = sharp(photoBuffer).resize(width, height, { fit: "cover", position: "attention" });

  return base.composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
}
