"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

// Opening the bell is the "mark all read" action — one timestamp on User,
// not a read-flag per task/offer. Revalidates every page (not just the
// current one) since the bell renders on all of them via the Topbar.
export async function markNotificationsSeen() {
  const user = await requireUser();
  await prisma.user.update({ where: { id: user.id }, data: { lastNotificationsSeenAt: new Date() } });
  revalidatePath("/", "layout");
}
