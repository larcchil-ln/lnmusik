import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET(request: NextRequest) {
  const track = request.nextUrl.searchParams.get("track")?.trim();
  const artist = request.nextUrl.searchParams.get("artist")?.trim() || "";
  if (!track) return NextResponse.json({ error: "Judul lagu wajib diisi." }, { status: 400 });

  const title = track.replace(/\s*[-|–].*$/, "").replace(/\s*\(.*?\)\s*/g, " ").trim();
  const params = new URLSearchParams({ track_name: title.slice(0, 160) });
  if (artist) params.set("artist_name", artist.slice(0, 100));

  try {
    const response = await fetch(`https://lrclib.net/api/search?${params.toString()}`, {
      headers: { "User-Agent": "LNMUSIK/1.0 (music player)" },
      next: { revalidate: 3600 }
    });
    if (!response.ok) return NextResponse.json({ plainLyrics: null });
    const items = await response.json();
    const match = Array.isArray(items)
      ? items.find((item: { plainLyrics?: string; instrumental?: boolean }) => item.plainLyrics && !item.instrumental)
      : null;
    return NextResponse.json({ plainLyrics: match?.plainLyrics ?? null });
  } catch {
    return NextResponse.json({ plainLyrics: null });
  }
}
