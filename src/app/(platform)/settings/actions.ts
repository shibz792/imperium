"use server";

import { revalidatePath } from "next/cache";
import { requireUser, requireRole, ADMIN_ROLES } from "@/lib/auth";
import { disconnectGoogleAccount, designateStorageAccount } from "@/lib/google";
import { writeAudit } from "@/lib/audit";

export async function disconnectGoogle() {
  const user = await requireUser();
  await disconnectGoogleAccount(user.id);
  revalidatePath("/settings");
}

// Which connected account the company's shared property-media Drive lives
// in — admin-only, since it's a shared setting, not a personal one.
export async function setStorageAccount(userId: string) {
  const admin = await requireRole(ADMIN_ROLES);
  await designateStorageAccount(userId);
  await writeAudit({ userId: admin.id, action: "SET_DRIVE_STORAGE_ACCOUNT", entityType: "googleAccount", entityId: userId });
  revalidatePath("/settings");
}
