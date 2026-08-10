import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// The composed social tile's <img src>, served straight from Postgres —
// no Google Drive round trip, so a generated image works regardless of
// whether Drive storage is connected. Not gated behind requireUser for the
// same reason /api/drive-media/[fileId] isn't: these are made to be posted
// publicly on social media, not confidential.
export async function GET(_req: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const asset = await prisma.marketingAsset.findUnique({ where: { id: assetId }, select: { imageData: true, imageMimeType: true } });
  if (!asset?.imageData) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(asset.imageData), {
    headers: {
      "Content-Type": asset.imageMimeType ?? "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
