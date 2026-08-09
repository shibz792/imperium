"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { SALES_TEAM_ROLES, DEAL_ROLES } from "@/lib/roles";

export type SearchResult = { id: string; href: string; title: string; subtitle: string };
export type SearchResults = {
  properties: SearchResult[];
  requirements: SearchResult[];
  contacts: SearchResult[];
  deals: SearchResult[];
};

const EMPTY: SearchResults = { properties: [], requirements: [], contacts: [], deals: [] };
const LIMIT = 5;

// One box, four record types — a small, real "find it" instead of needing
// to already know which section a property/contact/requirement/deal lives
// in before you can look for it. Plain `contains` queries, not full-text
// search — fine at this data volume, and doesn't need a search index to
// keep in sync.
export async function globalSearch(rawQuery: string): Promise<SearchResults> {
  const user = await requireUser();
  const query = rawQuery.trim();
  if (query.length < 2) return EMPTY;

  // Only search (and only ever return) categories this role could actually
  // open — a result that just bounces back with "not available for your
  // role" isn't a result, it's a dead end with extra steps.
  const canRequirements = SALES_TEAM_ROLES.includes(user.role);
  const canContacts = SALES_TEAM_ROLES.includes(user.role);
  const canDeals = DEAL_ROLES.includes(user.role);

  const insensitive = { contains: query, mode: "insensitive" as const };

  const [properties, requirements, contacts, deals] = await Promise.all([
    prisma.property.findMany({
      where: { OR: [{ title: insensitive }, { propertyRef: insensitive }, { city: insensitive }, { district: insensitive }] },
      select: { id: true, title: true, propertyRef: true, city: true, district: true },
      take: LIMIT,
    }),
    canRequirements
      ? prisma.requirement.findMany({
          where: { OR: [{ title: insensitive }, { requirementRef: insensitive }] },
          select: { id: true, title: true, requirementRef: true, client: { select: { name: true } } },
          take: LIMIT,
        })
      : Promise.resolve([]),
    canContacts
      ? prisma.contact.findMany({
          where: { OR: [{ name: insensitive }, { contactRef: insensitive }, { phone: insensitive }, { companyName: insensitive }] },
          select: { id: true, name: true, contactRef: true, companyName: true },
          take: LIMIT,
        })
      : Promise.resolve([]),
    canDeals
      ? prisma.deal.findMany({
          where: { OR: [{ dealRef: insensitive }, { property: { title: insensitive } }, { client: { name: insensitive } }] },
          select: { id: true, dealRef: true, property: { select: { title: true } }, client: { select: { name: true } } },
          take: LIMIT,
        })
      : Promise.resolve([]),
  ]);

  return {
    properties: properties.map((p) => ({ id: p.id, href: `/properties/${p.id}`, title: p.title, subtitle: [p.propertyRef, p.city ?? p.district].filter(Boolean).join(" · ") })),
    requirements: requirements.map((r) => ({ id: r.id, href: `/requirements/${r.id}`, title: r.title, subtitle: [r.requirementRef, r.client.name].filter(Boolean).join(" · ") })),
    contacts: contacts.map((c) => ({ id: c.id, href: `/contacts/${c.id}`, title: c.name, subtitle: [c.contactRef, c.companyName].filter(Boolean).join(" · ") })),
    deals: deals.map((d) => ({ id: d.id, href: `/deals/${d.id}`, title: d.property.title, subtitle: [d.dealRef, d.client.name].filter(Boolean).join(" · ") })),
  };
}
