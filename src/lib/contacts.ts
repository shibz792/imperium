import { prisma } from "@/lib/prisma";
import { nextContactRef } from "@/lib/refs";

// Shared dedupe-by-phone contact upsert — originally lived inside AI
// Intake's approve actions; External Sourcing's "save as outsourced
// contact" flow needs the exact same behavior (don't create a duplicate
// Contact for a phone number we already have on file), so it's a plain
// library function both features import rather than two parallel
// almost-identical implementations.
export async function findOrCreateContact(
  name: string | undefined,
  phone: string | undefined,
  type: "OWNER" | "BUYER" | "TENANT" | "OUTSOURCED",
  agentId: string,
  opts?: { source?: string; capacity?: "INDIVIDUAL" | "COMPANY" | "REPRESENTATIVE"; alternatePhone?: string },
): Promise<string> {
  if (phone) {
    const existing = await prisma.contact.findFirst({ where: { OR: [{ phone }, { whatsapp: phone }] } });
    if (existing) return existing.id;
  }
  const contact = await prisma.contact.create({
    data: {
      contactRef: await nextContactRef(),
      name: name || "Unnamed contact",
      contactType: type,
      capacity: (opts?.capacity ?? "INDIVIDUAL") as never,
      phone: phone ?? "",
      whatsapp: phone,
      assignedAgentId: agentId,
      source: opts?.source ?? "Imperium AI Intake",
      // Contact has one phone column — a second number the source text
      // gave has nowhere structured to go, so it's recorded here rather
      // than silently dropped.
      notes: opts?.alternatePhone ? `Alternate phone: ${opts.alternatePhone}` : undefined,
    },
  });
  return contact.id;
}
