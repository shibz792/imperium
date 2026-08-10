import type { Property } from "@/generated/prisma/client";
import { groqJson, groqConfigured } from "@/lib/groq";
import { formatCurrency } from "@/lib/format";
import { primarySize, relevantAskingPrice, priceUnit } from "@/lib/property";

export type ContentType =
  | "DESCRIPTION" | "WHATSAPP" | "META_AD" | "FB_MARKETPLACE" | "INSTAGRAM_CAPTION"
  | "WEBSITE_COPY" | "EMAIL_CAMPAIGN" | "BROCHURE" | "SOCIAL_1_1" | "STORY_9_16";

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  DESCRIPTION: "Premium property description",
  WHATSAPP: "Short WhatsApp description",
  META_AD: "Meta advertisement copy",
  FB_MARKETPLACE: "Facebook Marketplace listing",
  INSTAGRAM_CAPTION: "Instagram caption",
  WEBSITE_COPY: "Website copy",
  EMAIL_CAMPAIGN: "Email campaign",
  BROCHURE: "Branded PDF brochure text",
  SOCIAL_1_1: "1:1 social post copy",
  STORY_9_16: "9:16 story copy",
};

function factSheet(p: Property) {
  const lines = [
    `Title: ${p.title}`,
    `Category / subtype: ${p.category} / ${p.subtype}`,
    `Transaction: ${p.transactionType}`,
    p.description ? `Description notes: ${p.description}` : undefined,
    `Location: ${[p.city, p.district].filter(Boolean).join(", ") || "not specified"}`,
    primarySize(p) ? `Size: ${primarySize(p)}` : undefined,
    p.bedrooms ? `Bedrooms: ${p.bedrooms}` : undefined,
    p.bathrooms ? `Bathrooms: ${p.bathrooms}` : undefined,
    relevantAskingPrice(p) ? `Price: ${formatCurrency(relevantAskingPrice(p), p.currency)}${priceUnit(p)}${p.priceNegotiable ? " (negotiable)" : ""}` : "Price: on request",
    p.featuresJson && Object.keys(p.featuresJson as object).length ? `Features: ${Object.keys(p.featuresJson as object).join(", ")}` : undefined,
  ].filter(Boolean);
  return lines.join("\n");
}

const LANGUAGE_NAMES: Record<string, string> = { EN: "English", SI: "Sinhala", TA: "Tamil" };

// The actual fix for "weird text that doesn't fit any channel": every
// content type used to share one identical prompt, differing only by a
// label string. These specs are what a human copywriter would actually
// know about each destination — length, structure, and convention — so the
// model produces something that reads like it belongs on that channel,
// not an interchangeable paragraph with the label swapped.
const CHANNEL_SPECS: Record<ContentType, string> = {
  DESCRIPTION:
    "120-180 words, one flowing paragraph for a listing detail page. Lead with the single most compelling fact. No bullet points, no hashtags, no emoji.",
  WHATSAPP:
    "Under 60 words. Use WhatsApp's own bold syntax (*text*) for the headline line, nothing else. At most 2 emoji, used sparingly. End with one direct line inviting a reply or a viewing.",
  META_AD:
    "Meta (Facebook/Instagram) ad primary text. First line is the hook, under 90 characters, must stand alone if everything after it gets truncated. Whole thing under 125 words. Exactly one clear call to action. No hashtags.",
  FB_MARKETPLACE:
    "Facebook Marketplace listing description. First line states price, location and size together — Marketplace truncates long descriptions aggressively in the feed. Plain, factual tone, no marketing flourish. Short list of key specs, then one closing line prompting contact.",
  INSTAGRAM_CAPTION:
    "Instagram caption. First line is a hook under 125 characters (everything after that sits behind the 'more' fold). Short lines with room to breathe, not one dense block. End with 5-8 relevant hashtags mixing broad (#SriLankaRealEstate) and specific (city, subtype) tags.",
  WEBSITE_COPY:
    "Markdown for a listing detail page. One H2-style opening line (## ...), then 2-3 short paragraphs. Work location and property-type keywords into the sentences naturally, never a stuffed list of them.",
  EMAIL_CAMPAIGN:
    "Email to a client list. First line literally 'Subject: ...', then a blank line, then the body. Short scannable paragraphs, a greeting and a sign-off, exactly one call to action.",
  BROCHURE:
    "Formal print brochure text. Structured under clear section headers (Overview, Specifications, Features). No emoji, no hashtags. Longer and more formal than any of the other formats is expected and fine.",
  SOCIAL_1_1:
    'Not a caption — this is on-image text for a square (1:1) social media tile, read at a glance in under two seconds. Return ONLY two short lines: a headline under 40 characters, then a tagline under 70 characters. No hashtags, no emoji, no price and no call to action (the price and agency mark are added to the image separately).',
  STORY_9_16:
    'On-image text for a vertical (9:16) story tile — shorter than the square format, read while mid-scroll. Return ONLY two short lines: a headline under 32 characters, then a short line under 50 characters. No hashtags, no emoji, no price.',
};

async function generateWithGroq(p: Property, contentType: ContentType, language: string): Promise<string | null> {
  const system = `You are the copywriter for Imperium Realty, a premium Sri Lankan real estate agency. Brand voice: confident, precise, understated luxury. Never generic SaaS-brochure language, never invented facts, and never use an em dash. Write ONLY in ${LANGUAGE_NAMES[language] ?? "English"}. Use ONLY the facts provided; if something isn't given, do not mention it.\n\nYou are writing specifically for: ${CONTENT_TYPE_LABELS[contentType]}.\nFormat and length rules for this exact channel, follow them precisely: ${CHANNEL_SPECS[contentType]}\n\nReturn JSON: {"content": "..."}. For SOCIAL_1_1 and STORY_9_16, "content" is exactly two lines separated by a newline: the headline, then the tagline.`;
  const user = `Approved facts:\n${factSheet(p)}`;
  const result = await groqJson<{ content: string }>(system, user);
  return result?.content ?? null;
}

function generateHeuristic(p: Property, contentType: ContentType): string {
  const price = relevantAskingPrice(p);
  const priceLine = price ? `${formatCurrency(price, p.currency)}${priceUnit(p)}${p.priceNegotiable ? ", negotiable" : ""}` : "Price on request";
  const location = [p.city, p.district].filter(Boolean).join(", ") || "Sri Lanka";
  const size = primarySize(p);
  const featureList = p.featuresJson && typeof p.featuresJson === "object" ? Object.keys(p.featuresJson as object) : [];

  switch (contentType) {
    case "WHATSAPP":
      return [`*${p.title}*`, [p.subtype, size].filter(Boolean).join(" · "), priceLine, location, "", "Message us for a private viewing, Imperium Realty."].join("\n");
    case "META_AD":
      return `${p.title}, ${location}\n${priceLine}. ${size ? `${size}. ` : ""}Enquire today with Imperium Realty, Sri Lanka's private property intelligence platform.`;
    case "FB_MARKETPLACE":
      return `${p.title}\n${location}\n${priceLine}\n${size ?? ""}\n${featureList.length ? `Features: ${featureList.join(", ")}\n` : ""}Contact Imperium Realty for details.`;
    case "INSTAGRAM_CAPTION":
      return `${p.title} ✨\n📍 ${location}\n💰 ${priceLine}\n\n${featureList.slice(0, 5).map((f) => `#${f.replace(/[^a-zA-Z0-9]/g, "")}`).join(" ")} #ImperiumRealty #SriLankaRealEstate`;
    case "WEBSITE_COPY":
      return `## ${p.title}\n\n${p.description ?? `A ${p.subtype.toLowerCase()} in ${location}.`}\n\n**Price:** ${priceLine}\n**Size:** ${size ?? "on request"}\n${featureList.length ? `**Features:** ${featureList.join(", ")}\n` : ""}\n*Presented by Imperium Realty. Property intelligence, precisely matched.*`;
    case "EMAIL_CAMPAIGN":
      return `Subject: ${p.title}, now available through Imperium Realty\n\nDear valued client,\n\nWe are pleased to present ${p.title} in ${location}.\n\n${p.description ?? ""}\n\nPrice: ${priceLine}\nSize: ${size ?? "on request"}\n\nReply to arrange a private viewing.\n\nWarm regards,\nImperium Realty`;
    case "BROCHURE":
      return `IMPERIUM REALTY\n${p.title}\n\n${p.description ?? ""}\n\nLOCATION: ${location}\nSIZE: ${size ?? "on request"}\nPRICE: ${priceLine}\n${featureList.length ? `\nFEATURES\n${featureList.map((f) => `- ${f}`).join("\n")}\n` : ""}\nProperty Intelligence. Precisely Matched.`;
    // Two lines only — headline then tagline — matching the Groq output
    // shape, since generateSocialImage() parses exactly these two lines as
    // the on-image overlay text. Price is deliberately excluded here: it's
    // rendered onto the image directly from the property record, never
    // from generated text.
    case "SOCIAL_1_1":
      return `${p.title}\n${location}`;
    case "STORY_9_16":
      return `${p.title}\nEnquire today`;
    case "DESCRIPTION":
    default:
      return `${p.description ? p.description + "\n\n" : ""}Located in ${location}, this ${p.subtype.toLowerCase()} offers ${size ? `${size} of space ` : ""}${featureList.length ? `with ${featureList.slice(0, 4).join(", ")}. ` : ""}${priceLine}. Presented exclusively through Imperium Realty.`;
  }
}

export async function generateMarketingContent(p: Property, contentType: ContentType, language: string): Promise<{ content: string; engine: "groq" | "heuristic" }> {
  if (groqConfigured()) {
    const content = await generateWithGroq(p, contentType, language);
    if (content) return { content, engine: "groq" };
  }
  if (language !== "EN") {
    return {
      content: `[Offline heuristic engine only supports English. Set GROQ_API_KEY to generate ${LANGUAGE_NAMES[language]} copy.]\n\n${generateHeuristic(p, contentType)}`,
      engine: "heuristic",
    };
  }
  return { content: generateHeuristic(p, contentType), engine: "heuristic" };
}
