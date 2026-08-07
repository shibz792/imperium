"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { nextRequirementRef, nextContactRef } from "@/lib/refs";
import { writeAudit, logActivity } from "@/lib/audit";

function str(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}
function num(fd: FormData, key: string): number | undefined {
  const v = str(fd, key);
  if (v === undefined) return undefined;
  const n = Number(v.replace(/,/g, ""));
  return Number.isNaN(n) ? undefined : n;
}
function date(fd: FormData, key: string): Date | undefined {
  const v = str(fd, key);
  return v ? new Date(v) : undefined;
}
function list(fd: FormData, key: string): string[] {
  const v = str(fd, key);
  if (!v) return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}
function featureList(fd: FormData): Record<string, boolean> {
  const raw = fd.getAll("requiredFeatures");
  const out: Record<string, boolean> = {};
  for (const f of raw) if (typeof f === "string") out[f] = true;
  return out;
}

async function resolveClient(fd: FormData, agentId: string): Promise<string> {
  const existing = str(fd, "clientId");
  if (existing) return existing;
  const name = str(fd, "clientNewName") ?? "New client";
  const phone = str(fd, "clientNewPhone") ?? "";
  const contact = await prisma.contact.create({
    data: {
      contactRef: await nextContactRef(),
      name,
      contactType: str(fd, "clientContactType") === "TENANT" ? "TENANT" : "BUYER",
      phone,
      whatsapp: phone,
      assignedAgentId: agentId,
      source: "Requirement intake",
    },
  });
  return contact.id;
}

function buildRequirementData(fd: FormData) {
  return {
    type: (str(fd, "type") ?? "BUYER") as never,
    companyName: str(fd, "companyName"),
    decisionMaker: str(fd, "decisionMaker"),
    title: str(fd, "title") ?? "Untitled requirement",
    dealType: (str(fd, "dealType") ?? "BUY") as never,
    category: (str(fd, "category") ?? "RESIDENTIAL") as never,
    subtype: str(fd, "subtype"),
    preferredLocationsJson: list(fd, "preferredLocations"),
    acceptableSurroundingJson: list(fd, "acceptableSurrounding"),
    budgetMin: num(fd, "budgetMin"),
    budgetMax: num(fd, "budgetMax"),
    sizeMin: num(fd, "sizeMin"),
    sizeMax: num(fd, "sizeMax"),
    requiredFeaturesJson: featureList(fd),
    intendedUse: str(fd, "intendedUse"),
    deadline: date(fd, "deadline"),
    financingStatus: (str(fd, "financingStatus") ?? "UNCONFIRMED") as never,
    decisionStage: str(fd, "decisionStage"),
    urgency: (str(fd, "urgency") ?? "MEDIUM") as never,
    quality: (str(fd, "quality") ?? "UNVERIFIED") as never,
    source: str(fd, "source"),
    nextAction: str(fd, "nextAction"),
    nextActionDate: date(fd, "nextActionDate"),
    confidentialNotes: str(fd, "confidentialNotes"),
    expiryDate: date(fd, "expiryDate"),
    status: (str(fd, "status") ?? "NEW") as never,
  };
}

function collaboratorIds(fd: FormData): string[] {
  return fd.getAll("collaboratorIds").filter((v): v is string => typeof v === "string" && v.length > 0);
}

export async function createRequirement(formData: FormData) {
  const user = await requireUser();
  const clientId = await resolveClient(formData, user.id);
  const data = buildRequirementData(formData);

  const requirement = await prisma.requirement.create({
    data: {
      ...data,
      requirementRef: await nextRequirementRef(),
      clientId,
      assignedAgentId: str(formData, "assignedAgentId") ?? user.id,
      lastContacted: new Date(),
      collaborators: { connect: collaboratorIds(formData).map((id) => ({ id })) },
    } as never,
  });

  await writeAudit({ userId: user.id, action: "CREATE", entityType: "requirement", entityId: requirement.id, after: data });
  await logActivity({ entityType: "requirement", requirementId: requirement.id, type: "CREATED", message: `${user.name} created this requirement.`, userId: user.id });

  revalidatePath("/requirements");
  redirect(`/requirements/${requirement.id}`);
}

export async function updateRequirement(id: string, formData: FormData) {
  const user = await requireUser();
  const before = await prisma.requirement.findUniqueOrThrow({ where: { id } });
  const clientId = str(formData, "clientId");
  const data = buildRequirementData(formData);

  await prisma.requirement.update({
    where: { id },
    data: {
      ...data,
      clientId: clientId ?? before.clientId,
      assignedAgentId: str(formData, "assignedAgentId") ?? before.assignedAgentId,
      collaborators: { set: collaboratorIds(formData).map((id) => ({ id })) },
    } as never,
  });

  await writeAudit({ userId: user.id, action: "UPDATE", entityType: "requirement", entityId: id, before, after: data });
  await logActivity({ entityType: "requirement", requirementId: id, type: "UPDATED", message: `${user.name} updated this requirement.`, userId: user.id });

  revalidatePath("/requirements");
  revalidatePath(`/requirements/${id}`);
  redirect(`/requirements/${id}`);
}

export async function reconfirmRequirement(id: string) {
  const user = await requireUser();
  await prisma.requirement.update({ where: { id }, data: { lastContacted: new Date() } });
  await logActivity({ entityType: "requirement", requirementId: id, type: "RECONFIRMED", message: `${user.name} reconfirmed this requirement is still active.`, userId: user.id });
  await writeAudit({ userId: user.id, action: "RECONFIRM", entityType: "requirement", entityId: id });
  revalidatePath(`/requirements/${id}`);
  revalidatePath("/requirements");
}

export async function changeRequirementStatus(id: string, status: string) {
  const user = await requireUser();
  await prisma.requirement.update({ where: { id }, data: { status: status as never } });
  await logActivity({ entityType: "requirement", requirementId: id, type: "STATUS", message: `${user.name} changed status to ${status.replace("_", " ")}.`, userId: user.id });
  await writeAudit({ userId: user.id, action: "STATUS_CHANGE", entityType: "requirement", entityId: id, after: { status } });
  revalidatePath(`/requirements/${id}`);
  revalidatePath("/requirements");
}
