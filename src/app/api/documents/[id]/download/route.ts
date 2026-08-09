import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, canSeeConfidential } from "@/lib/auth";
import { DOCUMENT_ROLES } from "@/lib/roles";
import { readStoredFile } from "@/lib/storage";
import { writeAudit } from "@/lib/audit";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!DOCUMENT_ROLES.includes(user.role)) return NextResponse.json({ error: "Not permitted." }, { status: 403 });

  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (doc.confidential && !canSeeConfidential(user)) {
    return NextResponse.json({ error: "This document is restricted to confidential-access roles." }, { status: 403 });
  }

  const buffer = await readStoredFile(doc.fileUrl);
  await writeAudit({ userId: user.id, action: "DOWNLOAD", entityType: "document", entityId: doc.id });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Disposition": `attachment; filename="${doc.name.replace(/"/g, "")}"`,
      "Content-Type": "application/octet-stream",
      "Cache-Control": "private, no-store",
    },
  });
}
