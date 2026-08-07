import { prisma } from "@/lib/prisma";

const DAY = 86_400_000;

// A lighter cousin of getDashboardData() — this runs on every page via the
// Topbar, not just Command Centre, so it only selects what a notification
// dropdown actually shows instead of the full dashboard's joined objects.
//
// "Unread" here means "created since you last opened the bell" (lastSeenAt),
// tracked as a single timestamp on User rather than a read-flag per item —
// opening the bell is a "mark all read" action, same as every mail client's
// simplest mode. staleCount doesn't have a real "created" moment (staleness
// is ongoing), so it stays out of the unread badge and just always shows in
// the list.
export async function getNotificationSummary(lastSeenAt: Date | null) {
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const staleThreshold = new Date(now.getTime() - 30 * DAY);

  const [tasks, offers, staleCount] = await Promise.all([
    prisma.task.findMany({
      where: { status: "OPEN", dueAt: { lte: endOfToday } },
      orderBy: { dueAt: "asc" },
      take: 5,
      select: { id: true, title: true, dueAt: true, createdAt: true, relatedEntityType: true, relatedEntityId: true },
    }),
    prisma.offer.findMany({
      where: { status: { in: ["SUBMITTED", "COUNTERED"] } },
      orderBy: { createdAt: "asc" },
      take: 5,
      select: { id: true, dealId: true, amount: true, createdAt: true, deal: { select: { property: { select: { title: true } } } } },
    }),
    prisma.property.count({
      where: { listingStatus: "ACTIVE", OR: [{ lastVerifiedDate: null }, { lastVerifiedDate: { lt: staleThreshold } }] },
    }),
  ]);

  const overdueCount = tasks.filter((t) => t.dueAt < now).length;
  const isUnseen = (createdAt: Date) => !lastSeenAt || createdAt > lastSeenAt;
  const unseenCount = tasks.filter((t) => isUnseen(t.createdAt)).length + offers.filter((o) => isUnseen(o.createdAt)).length;

  return {
    tasks,
    offers,
    staleCount,
    overdueCount,
    unseenCount,
    total: tasks.length + offers.length + staleCount,
  };
}
