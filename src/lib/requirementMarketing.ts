import type { Property, Requirement, Contact } from "@/generated/prisma/client";
import { groqJson, groqConfigured } from "@/lib/groq";
import { formatCurrency, titleCase } from "@/lib/format";
import { relevantAskingPrice, priceUnit, primarySize } from "@/lib/property";

// "Marketing a requirement" is a different action than marketing a
// property — there's no public audience for a buyer's shopping list. In
// real-estate practice it means two specific things: sending the client
// the best current matches, and circulating the need to co-brokers to
// source off-market inventory. Both below. Neither invents facts — the
// AI only ever writes the framing/opening line; every number, location
// and budget figure is appended deterministically from the record itself,
// same discipline as lib/marketing.ts and lib/marketingImage.ts.

const BRAND_VOICE =
  "You are the copywriter for Imperium Realty, a premium Sri Lankan real estate agency. Brand voice: confident, precise, understated luxury. Never generic SaaS language, never invented facts, never an em dash.";

// ---------------------------------------------------------------------------
// Client digest — "here's what we found for you"
// ---------------------------------------------------------------------------

async function clientDigestIntro(clientName: string, requirementTitle: string, matchCount: number): Promise<string> {
  const firstName = clientName.split(" ")[0];
  if (groqConfigured()) {
    const system = `${BRAND_VOICE} Write ONLY a short WhatsApp opening line (1-2 sentences) telling a client you've found some property options matching what they're looking for. Warm, direct. Do not list any property facts — those are added separately below your line. Return JSON: {"intro": "..."}`;
    const user = `Client first name: ${firstName}\nLooking for: ${requirementTitle}\nNumber of matches found: ${matchCount}`;
    const result = await groqJson<{ intro: string }>(system, user);
    if (result?.intro) return result.intro;
  }
  return `Hi ${firstName}, we found ${matchCount} option${matchCount === 1 ? "" : "s"} that match what you're looking for:`;
}

function matchFactLine(p: Property): string {
  const price = relevantAskingPrice(p);
  const priceLine = price ? `${formatCurrency(price, p.currency)}${priceUnit(p)}` : "price on request";
  const size = primarySize(p);
  const location = [p.city, p.district].filter(Boolean).join(", ") || "location tbc";
  return `• *${p.title}* — ${priceLine}${size ? `, ${size}` : ""}, ${location}`;
}

// Top matches, already scored by the caller (scoreMatch, lib/match.ts) —
// this only composes the message, it doesn't re-score anything.
export async function buildClientDigest(requirement: Requirement & { client: Contact }, topMatches: Property[]): Promise<string> {
  const intro = await clientDigestIntro(requirement.client.name, requirement.title, topMatches.length);
  return [intro, "", ...topMatches.map(matchFactLine), "", "Reply if you'd like to arrange a viewing for any of these."].join("\n");
}

// ---------------------------------------------------------------------------
// Broker broadcast — "do you have anything matching this?"
// ---------------------------------------------------------------------------

function requirementFactSheet(requirement: Requirement): string {
  const locations = Array.isArray(requirement.preferredLocationsJson) ? (requirement.preferredLocationsJson as string[]) : [];
  const budget = requirement.budgetMax
    ? `up to ${formatCurrency(requirement.budgetMax)}`
    : requirement.budgetMin
      ? `from ${formatCurrency(requirement.budgetMin)}`
      : "not confirmed";
  return [
    `Looking for: ${requirement.subtype ?? titleCase(requirement.category)} (${titleCase(requirement.dealType)})`,
    `Budget: ${budget}`,
    locations.length ? `Preferred locations: ${locations.join(", ")}` : undefined,
    `Urgency: ${titleCase(requirement.urgency)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function brokerBroadcastIntro(requirement: Requirement): Promise<string> {
  if (groqConfigured()) {
    const system = `${BRAND_VOICE} Write ONLY a short WhatsApp message (2-3 sentences) to a co-broker asking if they have inventory matching a client's requirement. Professional broker-to-broker tone, not client-facing marketing copy. Do not restate the facts — those are listed separately below your message; write only the framing and the ask. Return JSON: {"message": "..."}`;
    const user = `Requirement facts:\n${requirementFactSheet(requirement)}`;
    const result = await groqJson<{ message: string }>(system, user);
    if (result?.message) return result.message;
  }
  return "Quick one — do you have anything matching this for a client of mine? Happy to co-broke.";
}

export async function buildBrokerBroadcast(requirement: Requirement): Promise<string> {
  const intro = await brokerBroadcastIntro(requirement);
  return [intro, "", requirementFactSheet(requirement), "", "Let me know if you have anything matching."].join("\n");
}
