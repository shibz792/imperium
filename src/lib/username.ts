import { prisma } from "@/lib/prisma";

// Usernames aren't collected as their own form field — they're derived from
// the email's local part (shiham@imperiumrealty.lk → "shiham") so creating
// a staff account doesn't ask for one more thing nobody has an opinion on.
// Collision-safe in case two people ever share a local part across domains.
export async function deriveUsername(email: string): Promise<string> {
  const base = email.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "") || "user";
  let candidate = base;
  let n = 1;
  while (await prisma.user.findUnique({ where: { username: candidate } })) {
    n++;
    candidate = `${base}${n}`;
  }
  return candidate;
}
