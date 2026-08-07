"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { FINANCE_ROLES } from "@/lib/auth";

export async function updateCommissionStatus(id: string, status: string) {
  const user = await requireRole(FINANCE_ROLES);
  await prisma.commission.update({
    where: { id },
    data: { status: status as never, paidDate: status === "PAID" ? new Date() : undefined },
  });
  await writeAudit({ userId: user.id, action: "COMMISSION_STATUS", entityType: "commission", entityId: id, after: { status } });
  revalidatePath("/commissions");
}
