import { Prisma } from "@/generated/prisma/client";

// A P2003 foreign key violation means some other record still points at
// this row — surfaced as a plain-English message instead of a raw Prisma
// error, and instead of silently cascading through everything downstream.
// A Property with real Deals against it shouldn't vanish along with its
// deal/commission history just because someone clicked delete; the fix is
// "remove or reassign what's pointing at it first," not "delete harder."
export async function deleteGuarded(run: () => Promise<unknown>, blockedByMessage: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await run();
    return { ok: true };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return { ok: false, error: `Can't delete — still referenced by ${blockedByMessage}. Remove or reassign those first.` };
    }
    throw e;
  }
}
