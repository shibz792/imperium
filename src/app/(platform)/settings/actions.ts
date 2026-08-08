"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { disconnectGoogleAccount } from "@/lib/google";

export async function disconnectGoogle() {
  const user = await requireUser();
  await disconnectGoogleAccount(user.id);
  revalidatePath("/settings");
}
