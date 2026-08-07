"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { nextPropertyRef, nextRequirementRef, nextContactRef } from "@/lib/refs";
import { writeAudit, logActivity } from "@/lib/audit";
import { runAiIntake } from "@/lib/ai-intake";
import { districtForCity } from "@/lib/locations";
import type { IntakeResult, PropertyDraftFields, RequirementDraftFields } from "@/lib/intake-types";

export async function extractAction(rawText: string, mode: "PROPERTY" | "REQUIREMENT" | "AUTO" | "UPDATE"): Promise<IntakeResult> {
  const user = await requireUser();
  const result = await runAiIntake(rawText, mode);

  await prisma.aiIntakeJob.create({
    data: {
      rawText,
      mode,
      engine: result.engine,
      resultJson: result.drafts as never,
      createdById: user.id,
    },
  });

  return result;
}

async function findOrCreateContact(
  name: string | undefined,
  phone: string | undefined,
  type: "OWNER" | "BUYER" | "TENANT",
  agentId: string,
  opts?: { source?: string; capacity?: "INDIVIDUAL" | "COMPANY" | "REPRESENTATIVE" },
) {
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
    },
  });
  return contact.id;
}

export async function approvePropertyDraft(
  fields: PropertyDraftFields,
  sourceExcerpt: string,
  origin?: { source: string; sourceUrl?: string },
) {
  const user = await requireUser();
  // A listing sourced from a public marketplace is usually posted by a
  // broker/agent on the owner's behalf, not the owner directly — default
  // the capacity accordingly rather than assuming INDIVIDUAL.
  const ownerId = await findOrCreateContact(fields.ownerName, fields.ownerPhone, "OWNER", user.id, {
    source: origin?.source,
    capacity: origin ? "REPRESENTATIVE" : undefined,
  });

  const property = await prisma.property.create({
    data: {
      propertyRef: await nextPropertyRef(),
      title: fields.title || `${fields.subtype ?? "Property"} in ${fields.city ?? "location tbc"}`,
      description: fields.description ?? sourceExcerpt,
      category: (fields.category ?? "RESIDENTIAL") as never,
      subtype: fields.subtype ?? "House",
      transactionType: (fields.transactionType ?? "SALE") as never,
      listingStatus: "DRAFT",
      exclusivity: "OPEN",
      source: origin?.source ?? "Imperium AI Intake",
      sourceUrl: origin?.sourceUrl,
      city: fields.city,
      district: fields.city ? districtForCity(fields.city) : undefined,
      address: fields.address,
      sizeSqft: fields.sizeSqft,
      sizePerches: fields.sizePerches,
      sizeAcres: fields.sizeAcres,
      bedrooms: fields.bedrooms,
      totalPrice: fields.totalPrice,
      monthlyRental: fields.monthlyRental,
      annualLeaseValue: fields.annualLeaseValue,
      advertisedPrice: fields.totalPrice ?? fields.monthlyRental ?? fields.annualLeaseValue,
      currency: fields.currency ?? "LKR",
      featuresJson: fields.features ?? {},
      ownerId,
      assignedAgentId: user.id,
      dateReceived: new Date(),
    } as never,
  });

  await writeAudit({ userId: user.id, action: "AI_INTAKE_CREATE", entityType: "property", entityId: property.id, after: fields as never });
  await logActivity({ entityType: "property", propertyId: property.id, type: "AI_INTAKE", message: `Created via Imperium AI Intake and approved by ${user.name}.`, userId: user.id });

  revalidatePath("/properties");
  return { id: property.id };
}

export async function approveRequirementDraft(fields: RequirementDraftFields, sourceExcerpt: string) {
  const user = await requireUser();
  const clientId = await findOrCreateContact(fields.clientName, fields.clientPhone, fields.dealType === "RENT" ? "TENANT" : "BUYER", user.id);

  const requirement = await prisma.requirement.create({
    data: {
      requirementRef: await nextRequirementRef(),
      type: fields.dealType === "RENT" ? "TENANT" : "BUYER",
      clientId,
      title: fields.title || `${fields.subtype ?? "Property"} requirement`,
      dealType: (fields.dealType ?? "BUY") as never,
      category: (fields.category ?? "RESIDENTIAL") as never,
      subtype: fields.subtype,
      preferredLocationsJson: fields.locations ?? [],
      sizeMin: fields.sizeMin,
      sizeMax: fields.sizeMax,
      budgetMin: fields.budgetMin,
      budgetMax: fields.budgetMax,
      requiredFeaturesJson: fields.requiredFeatures ?? {},
      intendedUse: fields.intendedUse,
      urgency: fields.urgency ?? "MEDIUM",
      quality: "UNVERIFIED",
      status: "NEW",
      source: "Imperium AI Intake",
      confidentialNotes: fields.notes && fields.notes !== sourceExcerpt ? fields.notes : undefined,
      lastContacted: new Date(),
      assignedAgentId: user.id,
    } as never,
  });

  await writeAudit({ userId: user.id, action: "AI_INTAKE_CREATE", entityType: "requirement", entityId: requirement.id, after: fields as never });
  await logActivity({ entityType: "requirement", requirementId: requirement.id, type: "AI_INTAKE", message: `Created via Imperium AI Intake and approved by ${user.name}.`, userId: user.id });

  revalidatePath("/requirements");
  return { id: requirement.id };
}
