"use server";

import { requireUser } from "@/lib/auth";
import { runAiIntake } from "@/lib/ai-intake";
import { searchIkman, searchLankaPropertyWeb, fetchListingText, isAllowedSourceUrl, type SourcingResult } from "@/lib/sourcing";
import type { Draft } from "@/lib/intake-types";

const SOURCE_LABEL = { ikman: "ikman.lk", lankapropertyweb: "LankaPropertyWeb" } as const;

export async function searchExternalListings(input: {
  sites: ("ikman" | "lankapropertyweb")[];
  keyword: string;
  dealType: "BUY" | "RENT" | "LEASE";
  district?: string;
  propertyType?: string;
}): Promise<{ results: SourcingResult[]; errors: string[] }> {
  await requireUser();
  const results: SourcingResult[] = [];
  const errors: string[] = [];

  await Promise.all(
    input.sites.map(async (site) => {
      try {
        if (site === "ikman") {
          const q = [input.keyword, input.district].filter(Boolean).join(" ") || input.propertyType || "property";
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

  return { results, errors };
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
