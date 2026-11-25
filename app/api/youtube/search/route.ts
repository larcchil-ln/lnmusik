import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "YouTube API belum dikonfigurasi. Tambahkan YOUTUBE_API_KEY di Vercel Environment Variables." },
      { status: 503 }
    );
  }

  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query || query.length < 2) {
    return NextResponse.json({ error: "Masukkan minimal 2 karakter untuk mencari." }, { status: 400 });
  }
  if (query.length > 100) {
    return NextResponse.json({ error: "Kata pencarian terlalu panjang." }, { status: 400 });
  }

  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    maxResults: "12",
    regionCode: "ID",
    relevanceLanguage: "id",
    safeSearch: "strict",
    videoEmbeddable: "true",
    key: apiKey
  });

  try {
    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`, {
      next: { revalidate: 300 }
    });
    const payload = await response.json();

    if (!response.ok) {
      const reason = payload?.error?.errors?.[0]?.reason;
      const message =
        reason === "quotaExceeded"
          ? "Kuota pencarian YouTube hari ini sudah habis. Coba lagi setelah kuota direset."
          : "YouTube belum dapat memproses pencarian ini. Periksa konfigurasi API.";
      return NextResponse.json({ error: message }, { status: response.status });
    }

    const items = (payload.items ?? [])
      .filter((item: { id?: { videoId?: string }; snippet?: unknown }) => item.id?.videoId && item.snippet)
      .map((item: { id: { videoId: string }; snippet: { title: string; channelTitle: string; thumbnails?: Record<string, { url: string }> } }) => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        thumbnail:
          item.snippet.thumbnails?.high?.url ??
          item.snippet.thumbnails?.medium?.url ??
          item.snippet.thumbnails?.default?.url ??
          ""
      }));

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: "Koneksi ke YouTube gagal. Coba beberapa saat lagi." }, { status: 502 });
  }
}
