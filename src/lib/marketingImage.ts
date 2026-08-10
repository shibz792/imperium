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

export async function composeSocialImage(
  photoBuffer: Buffer,
  opts: { headline: string; tagline: string; priceLine: string; format: SocialImageFormat },
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
</svg>`.trim();

  const base = sharp(photoBuffer).resize(width, height, { fit: "cover", position: "attention" });

  return base.composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
}
