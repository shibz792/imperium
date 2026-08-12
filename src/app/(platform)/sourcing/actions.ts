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
  parsePriceToNumber,
  parsePostedAgoToDays,
  type SourcingResult,
  type SourcingFilters,
} from "@/lib/sourcing";
import { findOrCreateContact } from "@/lib/contacts";
import { writeAudit, logActivity } from "@/lib/audit";
import type { Draft } from "@/lib/intake-types";

const SOURCE_LABEL = { ikman: "ikman.lk", lankapropertyweb: "LankaPropertyWeb" } as const;

// priceValue/postedDays are computed here, server-side, rather than in the
// client — parsePriceToNumber/parsePostedAgoToDays live in lib/sourcing.ts
// alongside cheerio, which isn't safe to pull into a client bundle. The
// client only ever sorts by these two already-parsed numbers.
export type SourcingSearchResult = SourcingResult & { alreadyImportedPropertyId?: string; priceValue?: number; postedDays?: number };

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
          // Real district/category/deal-type scoping now lives in the URL
          // itself (see buildIkmanSearchUrl) — keyword is still passed
          // through as ikman's own in-category text filter (verified live:
          // it genuinely narrows within a scoped category), not as the only
          // thing standing between "everything" and an accurate result.
          results.push(...(await searchIkman({ dealType: input.dealType, district: input.district, propertyType: input.propertyType, keyword: input.keyword })));
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
    dealType: input.dealType,
    keyword: input.keyword,
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
    results: filtered.map((r) => ({
      ...r,
      alreadyImportedPropertyId: byUrl.get(r.url),
      priceValue: parsePriceToNumber(r.price),
      postedDays: parsePostedAgoToDays(r.postedAgo),
    })),
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
