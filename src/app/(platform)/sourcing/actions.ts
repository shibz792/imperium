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
import { districtForCity } from "@/lib/locations";
import { approvePropertyDraft } from "../ai-intake/actions";
import type { Draft, PropertyDraftFields } from "@/lib/intake-types";

const SOURCE_LABEL = { ikman: "ikman.lk", lankapropertyweb: "LankaPropertyWeb" } as const;

// priceValue/postedDays are computed here, server-side, rather than in the
// client — parsePriceToNumber/parsePostedAgoToDays live in lib/sourcing.ts
// alongside cheerio, which isn't safe to pull into a client bundle. The
// client only ever sorts by these two already-parsed numbers.
//
// alreadyRegisteredListingId / alreadyImportedPropertyId are two distinct
// states, not one — a listing can be registered (a SourcedListing exists)
// without ever having been promoted to a real, owned Property. Only the
// latter should read as "this is already one of our properties".
export type SourcingSearchResult = SourcingResult & {
  alreadyRegisteredListingId?: string;
  alreadyImportedPropertyId?: string;
  priceValue?: number;
  postedDays?: number;
};

// Dedup-against-DB + display-field enrichment, shared by both per-source
// search actions below — a listing already registered shouldn't invite a
// second registration (flag it so the card can link straight to the
// existing SourcedListing, or the promoted Property if it's gone that
// far), and priceValue/postedDays are computed here rather than in the
// client for the same reason as their comment on SourcingSearchResult.
async function enrichResults(results: SourcingResult[]): Promise<SourcingSearchResult[]> {
  const urls = results.map((r) => r.url);
  const existing = urls.length
    ? await prisma.sourcedListing.findMany({ where: { sourceUrl: { in: urls } }, select: { id: true, sourceUrl: true, promotedPropertyId: true } })
    : [];
  const byUrl = new Map(existing.map((l) => [l.sourceUrl, l]));
  return results.map((r) => {
    const match = byUrl.get(r.url);
    return {
      ...r,
      alreadyRegisteredListingId: match?.id,
      alreadyImportedPropertyId: match?.promotedPropertyId ?? undefined,
      priceValue: parsePriceToNumber(r.price),
      postedDays: parsePostedAgoToDays(r.postedAgo),
    };
  });
}

// Two separate search actions, not one combined one — ikman.lk and
// LankaPropertyWeb genuinely support different filters (LPW has real
// structured size data ikman never exposes in search results; ikman has
// real posted-date text LPW never exposes at all; LPW's own district
// scoping only really works for Colombo). Forcing one shared filter set
// onto both meant offering filters that silently did nothing for whichever
// site didn't support them. SourcingClient now searches one site at a
// time, its filter panel only ever showing what that site can actually do.
export async function searchIkmanListings(
  input: { dealType: "BUY" | "RENT" | "LEASE"; keyword: string; district?: string; city?: string; propertyType?: string } & SourcingFilters,
): Promise<{ results: SourcingSearchResult[]; error?: string }> {
  await requireUser();
  try {
    const raw = await searchIkman({ dealType: input.dealType, district: input.district, propertyType: input.propertyType, keyword: input.keyword });
    const filtered = applyFilters(raw, {
      district: input.district,
      city: input.city,
      propertyType: input.propertyType,
      dealType: input.dealType,
      priceMin: input.priceMin,
      priceMax: input.priceMax,
      bedrooms: input.bedrooms,
      postedWithinDays: input.postedWithinDays,
    });
    return { results: await enrichResults(filtered) };
  } catch (e) {
    return { results: [], error: e instanceof Error ? e.message : "ikman.lk search failed." };
  }
}

export async function searchLpwListings(
  input: { dealType: "BUY" | "RENT" | "LEASE"; district?: string; city?: string; propertyType?: string; keyword?: string } & SourcingFilters,
): Promise<{ results: SourcingSearchResult[]; error?: string }> {
  await requireUser();
  try {
    const raw = await searchLankaPropertyWeb({ dealType: input.dealType, district: input.district, propertyType: input.propertyType });
    const filtered = applyFilters(raw, {
      district: input.district,
      city: input.city,
      propertyType: input.propertyType,
      dealType: input.dealType,
      keyword: input.keyword,
      priceMin: input.priceMin,
      priceMax: input.priceMax,
      sizeMin: input.sizeMin,
      sizeMax: input.sizeMax,
      bedrooms: input.bedrooms,
    });
    return { results: await enrichResults(filtered) };
  } catch (e) {
    return { results: [], error: e instanceof Error ? e.message : "LankaPropertyWeb search failed." };
  }
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

// ---------------------------------------------------------------------------
// Registering an ad link — deliberately NOT the same as owning the
// property. This is the thing that used to happen silently as a side
// effect of "Import & review": clicking through the AI-drafted fields and
// approving them created a real Property row immediately, mixing "a
// listing we noticed on ikman" into the same list as properties this
// agency actually represents. Registering now only ever creates a
// SourcedListing; promoteSourcedListing (below) is the separate, explicit
// action that turns one into a real Property, and a human has to take it.
// ---------------------------------------------------------------------------

export async function registerSourcedListing(
  fields: PropertyDraftFields,
  sourceExcerpt: string,
  display: Pick<SourcingResult, "price" | "location" | "size" | "imgUrl" | "bedrooms">,
  url: string,
  source: "ikman" | "lankapropertyweb",
): Promise<{ id: string }> {
  const user = await requireUser();
  const district = fields.city ? districtForCity(fields.city) : undefined;
  // Deliberately not fields.transactionType verbatim — that's Property's
  // own enum (SALE/RENT/LEASE/...); this is the simpler BUY/RENT/LEASE
  // vocabulary the sourcing UI itself uses, for display consistency with
  // the search results this listing came from.
  const dealType = fields.transactionType === "SALE" ? "BUY" : fields.transactionType === "RENT" || fields.transactionType === "LEASE" ? fields.transactionType : undefined;

  const listing = await prisma.sourcedListing.create({
    data: {
      source,
      sourceUrl: url,
      title: fields.title || `${fields.subtype ?? "Property"} in ${fields.city ?? "location tbc"}`,
      price: display.price,
      // Prefer the AI-drafted, human-reviewed number over re-parsing the
      // raw scraped price string — it's already been through the same
      // review step everything else on this row went through.
      priceValue: fields.totalPrice ?? fields.monthlyRental ?? fields.annualLeaseValue ?? parsePriceToNumber(display.price),
      location: display.location ?? fields.city,
      size: display.size,
      imgUrl: display.imgUrl,
      bedrooms: display.bedrooms ?? fields.bedrooms,
      dealType,
      district,
      propertyType: fields.subtype,
      sourceExcerpt,
      fieldsJson: fields as never,
      registeredBy: { connect: { id: user.id } },
    },
  });

  await writeAudit({ userId: user.id, action: "CREATE", entityType: "sourcedListing", entityId: listing.id, after: { title: listing.title, source, sourceUrl: url } });
  revalidatePath("/sourcing");
  return { id: listing.id };
}

// The explicit, separate step that actually creates a real, owned Property
// — reuses approvePropertyDraft (the same AI-Intake code path) with the
// field set already reviewed once at registration time, so promoting
// doesn't re-fetch the listing or re-run AI extraction.
export async function promoteSourcedListing(id: string): Promise<{ id: string } | { error: string }> {
  const user = await requireUser();
  const listing = await prisma.sourcedListing.findUnique({ where: { id } });
  if (!listing) return { error: "That sourced listing no longer exists." };
  if (listing.promotedPropertyId) return { error: "Already promoted to a property." };

  const fields = (listing.fieldsJson ?? {}) as PropertyDraftFields;
  const source = listing.source as "ikman" | "lankapropertyweb";
  const { id: propertyId } = await approvePropertyDraft(fields, listing.sourceExcerpt ?? "", {
    source: SOURCE_LABEL[source] ?? listing.source,
    sourceUrl: listing.sourceUrl,
  });

  await prisma.sourcedListing.update({ where: { id }, data: { promotedPropertyId: propertyId, promotedAt: new Date(), promotedById: user.id } });
  await writeAudit({ userId: user.id, action: "PROMOTE", entityType: "sourcedListing", entityId: id, after: { propertyId } });
  revalidatePath("/sourcing");
  revalidatePath("/properties");
  return { id: propertyId };
}

// Only before promotion — once it's a real property, removing the paper
// trail back to where it came from isn't something a stray click should do.
export async function deleteSourcedListing(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const listing = await prisma.sourcedListing.findUnique({ where: { id }, select: { promotedPropertyId: true } });
  if (!listing) return { ok: true };
  if (listing.promotedPropertyId) return { ok: false, error: "This has already been promoted to a property — nothing to remove." };
  await prisma.sourcedListing.delete({ where: { id } });
  revalidatePath("/sourcing");
  return { ok: true };
}
