"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { deriveUsername } from "@/lib/username";

const MANAGE_ROLES = ["SUPER_ADMIN", "DIRECTOR", "SALES_MANAGER"] as const;

function str(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}
function list(fd: FormData, key: string): string[] {
  const v = str(fd, key);
  if (!v) return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}
function num(fd: FormData, key: string): number | undefined {
  const v = str(fd, key);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

export async function createAgent(formData: FormData) {
  const manager = await requireRole([...MANAGE_ROLES]);
  const email = str(formData, "email")!.toLowerCase();
  const passwordHash = await bcrypt.hash(str(formData, "password") || "Imperium@123", 10);

  const agent = await prisma.user.create({
    data: {
      name: str(formData, "name") ?? "New agent",
      email,
      username: await deriveUsername(email),
      passwordHash,
      role: (str(formData, "role") ?? "AGENT") as never,
      phone: str(formData, "phone"),
      title: str(formData, "title"),
      bio: str(formData, "bio"),
      territoryJson: list(formData, "territory"),
      commissionRateType: (str(formData, "commissionRateType") ?? "PERCENT") as never,
      commissionRate: num(formData, "commissionRate"),
    },
  });

  await writeAudit({ userId: manager.id, action: "CREATE", entityType: "agent", entityId: agent.id, after: { email, role: agent.role } });
  revalidatePath("/agents");
  redirect(`/agents/${agent.id}`);
}

export async function updateAgentProfile(id: string, formData: FormData) {
  const manager = await requireRole([...MANAGE_ROLES]);
  const before = await prisma.user.findUniqueOrThrow({ where: { id } });

  const data = {
    name: str(formData, "name") ?? before.name,
    phone: str(formData, "phone"),
    title: str(formData, "title"),
    bio: str(formData, "bio"),
    territoryJson: list(formData, "territory"),
    commissionRateType: (str(formData, "commissionRateType") ?? "PERCENT") as never,
    commissionRate: num(formData, "commissionRate") ?? null,
  };

  await prisma.user.update({ where: { id }, data });
  await writeAudit({ userId: manager.id, action: "UPDATE", entityType: "agent", entityId: id, before, after: data });
  revalidatePath("/agents");
  revalidatePath(`/agents/${id}`);
  redirect(`/agents/${id}`);
}
