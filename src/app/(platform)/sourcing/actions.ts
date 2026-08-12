"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { runAiIntake } from "@/lib/ai-intake";
import {
  searchIkman,
  searchLankaPropertyWeb,
  fetchListingText,
  extractPosterContact,
  applyFilters,
  isAllowedSourceUrl,
  type SourcingResult,
  type SourcingFilters,
} from "@/lib/sourcing";
import { findOrCreateContact } from "@/lib/contacts";
import { writeAudit, logActivity } from "@/lib/audit";
import type { Draft } from "@/lib/intake-types";

const SOURCE_LABEL = { ikman: "ikman.lk", lankapropertyweb: "LankaPropertyWeb" } as const;

export type SourcingSearchResult = SourcingResult & { alreadyImportedPropertyId?: string };

export async function searchExternalListings(
  input: {
    sites: ("ikman" | "lankapropertyweb")[];
    keyword: string;
    dealType: "BUY" | "RENT" | "LEASE";
    district?: string;
    propertyType?: string;
  } & SourcingFilters,
): Promise<{ results: SourcingSearchResult[]; errors: string[] }> {
  await requireUser();
  const results: SourcingResult[] = [];
  const errors: string[] = [];

  await Promise.all(
    input.sites.map(async (site) => {
      try {
        if (site === "ikman") {
          // Still worth sending the fullest query text we have — ikman's own
          // full-text search benefits from it even though it isn't a real
          // filter — but applyFilters() below is what actually guarantees
          // district/type/price/bedrooms are respected, not this string.
          const q = [input.keyword, input.propertyType, input.district].filter(Boolean).join(" ") || "property";
          results.push(...(await searchIkman(q)));
        } else {
          results.push(
            ...(await searchLankaPropertyWeb({ dealType: input.dealType, district: input.district, propertyType: input.propertyType })),
          );
        }
      } catch (e) {
        errors.push(`${SOURCE_LABEL[site]}: ${e instanceof Error ? e.message : "fetch failed"}`);
      }
    }),
  );

  const filtered = applyFilters(results, {
    district: input.district,
    propertyType: input.propertyType,
    priceMin: input.priceMin,
    priceMax: input.priceMax,
    bedrooms: input.bedrooms,
    postedWithinDays: input.postedWithinDays,
  });

  // Dedup-against-DB: a listing already imported shouldn't invite a second
  // import — flag it instead so the card can link straight to the existing
  // record.
  const urls = filtered.map((r) => r.url);
  const existing = urls.length ? await prisma.property.findMany({ where: { sourceUrl: { in: urls } }, select: { id: true, sourceUrl: true } }) : [];
  const byUrl = new Map(existing.map((p) => [p.sourceUrl, p.id]));

  return {
    results: filtered.map((r) => ({ ...r, alreadyImportedPropertyId: byUrl.get(r.url) })),
    errors,
  };
}

export async function importListing(url: string, source: "ikman" | "lankapropertyweb"): Promise<{ draft: Draft | null; error?: string }> {
  await requireUser();
  if (!isAllowedSourceUrl(url)) return { draft: null, error: "Only ikman.lk and lankapropertyweb.com links are supported." };
  // Guards against the paste-URL fallback: a URL pasted under the wrong site
  // tab would otherwise import silently mislabeled (e.g. an ikman ad tagged
  // as LankaPropertyWeb), which corrupts sourcing analytics downstream.
  const expectedHost = source === "ikman" ? "ikman.lk" : "lankapropertyweb.com";
  if (!url.includes(expectedHost)) return { draft: null, error: `That link doesn't look like a ${SOURCE_LABEL[source]} listing.` };

  try {
    const { text } = await fetchListingText(url);
    if (!text.trim()) return { draft: null, error: "Could not read this listing page. It may have been taken down." };

    const result = await runAiIntake(text, "PROPERTY");
    const draft = result.drafts[0];
    if (!draft) return { draft: null, error: "Nothing extractable found on that page." };

    draft.sourceExcerpt = text.slice(0, 400);
    return { draft: { ...draft, id: `sourced-${Date.now()}` } };
  } catch (e) {
    return { draft: null, error: e instanceof Error ? e.message : "Import failed." };
  }
}

// ---------------------------------------------------------------------------
// Save a listing's poster as an Outsourced contact — a lighter, separate
// path from "Import & review": you don't have to decide this is a property
// worth fully importing to hold onto who posted it.
// ---------------------------------------------------------------------------

export async function extractContactFromListing(url: string): Promise<{ name?: string; phone?: string; error?: string }> {
  await requireUser();
  if (!isAllowedSourceUrl(url)) return { error: "Only ikman.lk and lankapropertyweb.com links are supported." };
  try {
    const contact = await extractPosterContact(url);
    if (!contact.name && !contact.phone) return { error: "Couldn't find contact details on that page — enter them manually below." };
    return contact;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't read that page." };
  }
}

export async function saveOutsourcedContact(fields: { name: string; phone: string }, sourceUrl: string, source: "ikman" | "lankapropertyweb"): Promise<{ id: string }> {
  const user = await requireUser();
  const id = await findOrCreateContact(fields.name, fields.phone, "OUTSOURCED", user.id, {
    source: `External Sourcing (${SOURCE_LABEL[source]}) — ${sourceUrl}`,
    capacity: "REPRESENTATIVE",
  });
  await writeAudit({ userId: user.id, action: "CREATE", entityType: "contact", entityId: id, after: { ...fields, source: SOURCE_LABEL[source], sourceUrl } });
  await logActivity({ entityType: "contact", contactId: id, type: "CREATED", message: `${user.name} saved this contact from a sourced listing (${SOURCE_LABEL[source]}).`, userId: user.id });
  revalidatePath("/contacts");
  return { id };
}
