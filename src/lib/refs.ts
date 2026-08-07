import { prisma } from "@/lib/prisma";

// Human-facing sequential reference numbers, e.g. IR-P-000142.
// Based on the highest existing ref, not a row count — a count-based
// "next" number collides the moment anything's ever been deleted (the
// count drops, but the ref numbers already used haven't). Same
// zero-padded-digit prefix means a plain string sort already sorts
// numerically, so ORDER BY ref DESC LIMIT 1 finds the real high-water mark.
// Not perfectly race-safe under heavy concurrency (fine for local/demo use;
// swap for a DB sequence before multi-writer production use).

type Entity = "property" | "requirement" | "deal" | "contact";

const REF_FIELD: Record<Entity, string> = {
  property: "propertyRef",
  requirement: "requirementRef",
  deal: "dealRef",
  contact: "contactRef",
};

const FINDERS: Record<Entity, (field: string) => Promise<{ ref: string } | null>> = {
  property: async (field) => prisma.property.findFirst({ orderBy: { [field]: "desc" }, select: { [field]: true } }) as never,
  requirement: async (field) => prisma.requirement.findFirst({ orderBy: { [field]: "desc" }, select: { [field]: true } }) as never,
  deal: async (field) => prisma.deal.findFirst({ orderBy: { [field]: "desc" }, select: { [field]: true } }) as never,
  contact: async (field) => prisma.contact.findFirst({ orderBy: { [field]: "desc" }, select: { [field]: true } }) as never,
};

async function nextSeq(entity: Entity): Promise<number> {
  const field = REF_FIELD[entity];
  const row = (await FINDERS[entity](field)) as Record<string, string> | null;
  const highest = row?.[field];
  const n = highest ? parseInt(highest.slice(highest.lastIndexOf("-") + 1), 10) : 0;
  return (Number.isFinite(n) ? n : 0) + 1;
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
