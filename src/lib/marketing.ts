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

async function generateWithGroq(p: Property, contentType: ContentType, language: string): Promise<string | null> {
  const system = `You are the copywriter for Imperium Realty, a premium Sri Lankan real estate agency. Brand voice: confident, precise, understated luxury. Never generic SaaS-brochure language, never invented facts, and never use an em dash. Write ONLY in ${LANGUAGE_NAMES[language] ?? "English"}. Use ONLY the facts provided; if something isn't given, do not mention it. Return JSON: {"content": "..."}`;
  const user = `Content type: ${CONTENT_TYPE_LABELS[contentType]}\n\nApproved facts:\n${factSheet(p)}`;
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
    case "SOCIAL_1_1":
      return `${p.title}\n${priceLine}\n${location}\n\nImperium Realty`;
    case "STORY_9_16":
      return `${p.title}\n${priceLine}\n\nSwipe up to enquire\nImperium Realty`;
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
