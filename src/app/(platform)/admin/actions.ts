"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { deriveUsername } from "@/lib/username";

function str(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

export async function createUser(formData: FormData) {
  const admin = await requireRole(["SUPER_ADMIN"]);
  const email = str(formData, "email")!.toLowerCase();
  const passwordHash = await bcrypt.hash(str(formData, "password") || "Imperium@123", 10);

  const user = await prisma.user.create({
    data: {
      name: str(formData, "name") ?? "New user",
      email,
      username: await deriveUsername(email),
      passwordHash,
      role: (str(formData, "role") ?? "AGENT") as never,
      phone: str(formData, "phone"),
    },
  });

  await writeAudit({ userId: admin.id, action: "CREATE", entityType: "user", entityId: user.id, after: { email, role: user.role } });
  revalidatePath("/admin");
}

export async function toggleUserActive(id: string, active: boolean) {
  const admin = await requireRole(["SUPER_ADMIN"]);
  await prisma.user.update({ where: { id }, data: { active } });
  await writeAudit({ userId: admin.id, action: active ? "ACTIVATE" : "DEACTIVATE", entityType: "user", entityId: id });
  revalidatePath("/admin");
}
