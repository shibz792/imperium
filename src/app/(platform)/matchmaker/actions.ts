"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/audit";

export async function shareMatch(propertyId: string, requirementId: string, score: number) {
  const user = await requireUser();
  await prisma.matchShare.create({ data: { propertyId, requirementId, score, channel: "WhatsApp" } });

  const [property, requirement] = await Promise.all([
    prisma.property.findUnique({ where: { id: propertyId } }),
    prisma.requirement.findUnique({ where: { id: requirementId }, include: { client: true } }),
  ]);

  await logActivity({
    entityType: "property",
    propertyId,
    type: "MATCH_SHARED",
    message: `${user.name} shared this property with ${requirement?.client.name ?? "a client"} (${requirement?.requirementRef}), a ${score}% match.`,
    userId: user.id,
  });
  await logActivity({
    entityType: "requirement",
    requirementId,
    type: "MATCH_SHARED",
    message: `${user.name} shared "${property?.title}" (${property?.propertyRef}) with this client, a ${score}% match.`,
    userId: user.id,
  });

  revalidatePath("/matchmaker");
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath(`/requirements/${requirementId}`);
}
