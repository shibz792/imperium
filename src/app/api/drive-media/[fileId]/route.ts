import { NextResponse } from "next/server";
import { streamPropertyPhoto } from "@/lib/google";

// The public-facing <img src> for every property photo (property cards,
// list rows, the Media tab, public share pages). Not gated behind
// requireUser — property photos aren't confidential, and this needs to work
// on public share links too, same as the old Supabase public-bucket URLs it
// replaces. Cached aggressively: a given fileId's bytes never change.
export async function GET(_req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const file = await streamPropertyPhoto(fileId);
  if (!file) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
