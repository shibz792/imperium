import { NextResponse } from "next/server";
import sharp from "sharp";
import { streamPropertyPhoto } from "@/lib/google";

// The public-facing <img src> for every property photo (property cards,
// list rows, the Media tab, public share pages). Not gated behind
// requireUser — property photos aren't confidential, and this needs to work
// on public share links too, same as the old Supabase public-bucket URLs it
// replaces. Cached aggressively: a given fileId's bytes never change.
export async function GET(req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const file = await streamPropertyPhoto(fileId);
  if (!file) return new NextResponse("Not found", { status: 404 });

  // On-the-fly resize for grid/card thumbnails (?w=400 etc.) — the full
  // original Drive-hosted file was always served before, everywhere,
  // meaning every gallery load paid for the full-size bytes even for a
  // 200px tile. Full size still serves with no `w` param (the lightbox,
  // public share pages). sharp is already a dependency (marketing image
  // compositing); a resize failure falls back to the original bytes
  // rather than a broken image.
  const width = Number(new URL(req.url).searchParams.get("w"));
  let buffer = file.buffer;
  let mimeType = file.mimeType;
  if (width > 0 && width < 4000 && file.mimeType.startsWith("image/") && file.mimeType !== "image/svg+xml") {
    try {
      buffer = await sharp(file.buffer).resize({ width, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
      mimeType = "image/jpeg";
    } catch {
      // keep the original buffer/mimeType
    }
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
