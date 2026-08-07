"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { generateMarketingContent, type ContentType } from "@/lib/marketing";

export async function generateAsset(propertyId: string, contentType: ContentType, language: "EN" | "SI" | "TA") {
  const user = await requireUser();
  const property = await prisma.property.findUniqueOrThrow({ where: { id: propertyId } });
  const { content } = await generateMarketingContent(property, contentType, language);

  const asset = await prisma.marketingAsset.create({
    data: { propertyId, contentType, language, content, approved: false },
  });

  await logActivity({ entityType: "property", propertyId, type: "MARKETING_GENERATED", message: `${user.name} generated ${contentType.replace(/_/g, " ").toLowerCase()} content.`, userId: user.id });
  revalidatePath("/marketing-studio");
  revalidatePath(`/properties/${propertyId}`);
  return asset;
}

export async function approveAsset(id: string) {
  const user = await requireUser();
  const asset = await prisma.marketingAsset.update({ where: { id }, data: { approved: true, approvedById: user.id } });
  await logActivity({ entityType: "property", propertyId: asset.propertyId, type: "MARKETING_APPROVED", message: `${user.name} approved marketing content for use.`, userId: user.id });
  revalidatePath("/marketing-studio");
  revalidatePath(`/properties/${asset.propertyId}`);
}
