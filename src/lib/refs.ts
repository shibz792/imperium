import { prisma } from "@/lib/prisma";

// Human-facing sequential reference numbers, e.g. IR-P-000142.
// Not perfectly race-safe under heavy concurrency (fine for local/demo use;
// swap for a DB sequence before multi-writer production use).

async function nextSeq(entity: "property" | "requirement" | "deal" | "contact") {
  const counts: Record<typeof entity, () => Promise<number>> = {
    property: () => prisma.property.count(),
    requirement: () => prisma.requirement.count(),
    deal: () => prisma.deal.count(),
    contact: () => prisma.contact.count(),
  };
  const n = await counts[entity]();
  return n + 1;
}

export async function nextPropertyRef() {
  return `IR-P-${String(await nextSeq("property")).padStart(6, "0")}`;
}
export async function nextRequirementRef() {
  return `IR-R-${String(await nextSeq("requirement")).padStart(6, "0")}`;
}
export async function nextDealRef() {
  return `IR-D-${String(await nextSeq("deal")).padStart(6, "0")}`;
}
export async function nextContactRef() {
  return `IR-C-${String(await nextSeq("contact")).padStart(6, "0")}`;
}
