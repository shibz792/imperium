"use server";

import { revalidatePath } from "next/cache";
import { requireUser, requireRole, ADMIN_ROLES } from "@/lib/auth";
import { disconnectGoogleAccount, designateStorageAccount } from "@/lib/google";
import { disconnectMetaAccount, setActivePage, setActiveAdAccount, refreshManagedPages, refreshAdAccounts } from "@/lib/meta";
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

// Meta (Facebook/Instagram/Ads) — one shared, company-wide connection.
// Admin-only, same reasoning as the Drive storage account: this changes
// what the whole team publishes to and spends from, not a personal setting.
export async function disconnectMeta() {
  const admin = await requireRole(ADMIN_ROLES);
  await disconnectMetaAccount();
  await writeAudit({ userId: admin.id, action: "DISCONNECT_META", entityType: "metaAccount", entityId: "singleton" });
  revalidatePath("/settings");
}

export async function setActiveMetaPage(pageId: string) {
  const admin = await requireRole(ADMIN_ROLES);
  await setActivePage(pageId);
  await writeAudit({ userId: admin.id, action: "SET_ACTIVE_META_PAGE", entityType: "metaPage", entityId: pageId });
  revalidatePath("/settings");
}

export async function setActiveMetaAdAccount(adAccountId: string) {
  const admin = await requireRole(ADMIN_ROLES);
  await setActiveAdAccount(adAccountId);
  await writeAudit({ userId: admin.id, action: "SET_ACTIVE_META_AD_ACCOUNT", entityType: "metaAdAccount", entityId: adAccountId });
  revalidatePath("/settings");
}

// Re-runs Page/ad-account discovery — for when a Page or ad account is
// added to the Business Portfolio after the initial connect.
export async function refreshMetaConnections() {
  await requireRole(ADMIN_ROLES);
  await Promise.all([refreshManagedPages(), refreshAdAccounts()]);
  revalidatePath("/settings");
}
