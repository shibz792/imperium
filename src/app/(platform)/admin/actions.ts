"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { deriveUsername } from "@/lib/username";

// A generous ceiling, not a guess at the real number — high enough that no
// real Sri Lankan agency fee would ever legitimately hit it, low enough
// that a fat-fingered extra digit (25 instead of 2.5) gets caught instead
// of silently becoming next quarter's commission math.
const MAX_AGENCY_FEE_PCT = 20;

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

export async function setCommissionRateRule(category: string, formData: FormData) {
  const admin = await requireRole(["SUPER_ADMIN"]);
  const raw = str(formData, "agencyFeePct");
  const agencyFeePct = raw ? Number(raw) : NaN;
  if (Number.isNaN(agencyFeePct) || agencyFeePct < 0 || agencyFeePct > MAX_AGENCY_FEE_PCT) {
    // A silent no-op reads as a bug — say what went wrong, even briefly.
    redirect(`/admin?tab=categories&commissionRateError=${encodeURIComponent(category)}`);
  }

  await prisma.commissionRateRule.upsert({
    where: { category: category as never },
    create: { category: category as never, agencyFeePct },
    update: { agencyFeePct },
  });
  await writeAudit({ userId: admin.id, action: "SET_COMMISSION_RATE_RULE", entityType: "commissionRateRule", entityId: category, after: { agencyFeePct } });
  revalidatePath("/admin");
  redirect("/admin?tab=categories&commissionRateSaved=1");
}
