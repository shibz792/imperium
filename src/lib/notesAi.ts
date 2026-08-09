import { groqJson, groqConfigured } from "@/lib/groq";
import type { Draft, PropertyDraftFields, RequirementDraftFields, TaskDraftFields } from "@/lib/intake-types";

// A different job from AI Intake's extraction engine (src/lib/ai-intake.ts),
// even though the shapes it returns are the same — that one splits a long
// pasted conversation into however many property/requirement drafts it
// contains. This looks at one short note and asks a narrower question:
// given what was just jotted down, does anything need to happen next? Zero,
// one, or several suggestions — a note that's just a reminder to self
// suggests nothing, and that's a correct answer, not a failure.
//
// On-demand only (see the "Suggest next step" trigger in NoteAiSuggestions),
// never automatic on note creation — notes are meant to be fast to jot
// down, not gated behind a round trip to an LLM every time.

const SYSTEM_PROMPT = `You are an assistant for Imperium Realty OS, a Sri Lankan real estate CRM. You're given one short note someone on the team just wrote — a scratchpad entry, not a full conversation. Decide what, if anything, should happen next.

Rules:
- Most notes suggest nothing — a reminder to self, a passing observation. Only suggest a follow-up when the note clearly implies one. Returning zero suggestions is a normal, correct outcome.
- Suggest a TASK when the note implies a concrete follow-up action with an implied or statable timeframe (e.g. "call back Friday", "need to confirm the viewing", "chase the owner for the survey plan"). Give it a short, specific title and a dueAt (ISO date, infer a sensible one — "tomorrow", "next week", or a specific day mentioned; if truly no signal, default to 2 days from now).
- Suggest a PROPERTY when the note describes a specific property being offered/available that isn't just a passing mention (an owner's name, location, size, or price is usually present).
- Suggest a REQUIREMENT when the note describes someone specific looking for a property.
- A single note can produce more than one suggestion (e.g. a task AND a requirement), or none.
- Sri Lankan currency is LKR. "lakhs" = 100,000, "Cr"/"crore" = 10,000,000, "mn"/"million" = 1,000,000.
- If a field is missing or uncertain, omit it — never invent data.
- Give each suggestion a confidence 0-100.

Return strict JSON only:
{
  "suggestions": [
    {
      "kind": "task" | "property" | "requirement",
      "confidence": number,
      "fields": {
        // kind=task: "title": string, "dueAt": string (ISO date), "type": "CONTACT_INQUIRY"|"VIEWING_CONFIRM"|"CLIENT_UPDATE"|"LISTING_VERIFY"|"OFFER_RESPONSE"|"LEASE_EXPIRY"|"REQUIREMENT_RECONFIRM"|"CUSTOM"
        // kind=property: "title","ownerName","ownerPhone","category" ("RESIDENTIAL"|"COMMERCIAL"|"INDUSTRIAL_LOGISTICS"|"LAND_AGRICULTURE"),"subtype","transactionType" ("SALE"|"RENT"|"LEASE"),"city","address","sizeSqft","totalPrice","monthlyRental","bedrooms","bathrooms","description"
        // kind=requirement: "clientName","clientPhone","title","dealType" ("BUY"|"RENT"|"LEASE"),"category","subtype","locations" (string[]),"budgetMax","sizeMax","urgency" ("LOW"|"MEDIUM"|"HIGH"|"CRITICAL")
      }
    }
  ]
}`;

export type NoteSuggestion = Draft;

export async function suggestFromNote(noteContent: string): Promise<NoteSuggestion[] | null> {
  if (!groqConfigured()) return null;

  const result = await groqJson<{ suggestions: Array<Record<string, unknown>> }>(SYSTEM_PROMPT, `Note:\n"""\n${noteContent}\n"""`);
  if (!result?.suggestions) return [];

  return result.suggestions.map((s, i) => ({
    id: `note-suggestion-${Date.now()}-${i}`,
    kind: s.kind === "property" ? "property" : s.kind === "requirement" ? "requirement" : "task",
    sourceExcerpt: noteContent,
    confidence: clampConfidence(s.confidence),
    fieldConfidence: {},
    fields: (s.fields as PropertyDraftFields | RequirementDraftFields | TaskDraftFields) ?? {},
    missingFields: [],
    duplicates: [],
  }));
}

function clampConfidence(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(n)) return 60;
  return Math.max(0, Math.min(100, Math.round(n)));
}
