import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type YouTubeItem = {
  id?: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: Record<string, { url?: string }>;
  };
};

export async function GET(request: NextRequest) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "YouTube API belum dikonfigurasi." }, { status: 503 });

  const requestedRegion = request.nextUrl.searchParams.get("region")?.toUpperCase() ?? "ID";
  const region = requestedRegion === "US" ? "US" : "ID";
  const params = new URLSearchParams({
    part: "snippet",
    chart: "mostPopular",
    regionCode: region,
    maxResults: "20",
    videoCategoryId: "10",
    key: apiKey
  });

  try {
    const response = await fetch("https://www.googleapis.com/youtube/v3/videos?" + params.toString(), {
      next: { revalidate: 600 }
    });
    const payload = await response.json();
    if (!response.ok) {
      const reason = payload?.error?.errors?.[0]?.reason;
      const message = reason === "quotaExceeded"
        ? "Kuota YouTube hari ini sudah habis. Coba lagi nanti."
        : "Daftar lagu populer belum dapat dimuat.";
      return NextResponse.json({ error: message }, { status: response.status });
    }

    const items = ((payload.items ?? []) as YouTubeItem[])
      .filter(item => typeof item.id === "string" && item.snippet)
      .map(item => ({
        videoId: item.id!,
        title: item.snippet!.title ?? "Tanpa judul",
        channelTitle: (item.snippet!.channelTitle ?? "").replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, ""),
        thumbnail: item.snippet!.thumbnails?.maxres?.url ?? item.snippet!.thumbnails?.standard?.url ?? item.snippet!.thumbnails?.high?.url ?? item.snippet!.thumbnails?.medium?.url ?? `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`
      }));

    return NextResponse.json({ region, items }, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=120" } });
  } catch {
    return NextResponse.json({ error: "Koneksi ke YouTube gagal." }, { status: 502 });
  }
}
