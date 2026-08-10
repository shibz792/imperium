"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

// A soft gate, not bank-grade auth — SharePage links are meant to be handed
// to one recipient, not a general login system. A short-lived cookie scoped
// to this one slug means a correct password isn't asked for again on
// refresh, without needing a session/account for someone who was never
// asked to create one.
function gateCookieName(slug: string) {
  return `share_ok_${slug}`;
}

export async function unlockSharePage(slug: string, formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const sharePage = await prisma.sharePage.findUnique({ where: { slug }, select: { password: true } });
  if (!sharePage?.password || password !== sharePage.password) {
    redirect(`/share/${slug}?wrong=1`);
  }
  const store = await cookies();
  store.set(gateCookieName(slug), "1", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: `/share/${slug}`, maxAge: 60 * 60 * 24 });
  redirect(`/share/${slug}`);
}

export async function isShareUnlocked(slug: string): Promise<boolean> {
  const store = await cookies();
  return store.get(gateCookieName(slug))?.value === "1";
}
