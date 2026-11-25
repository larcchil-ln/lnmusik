import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) {
    return NextResponse.json({ error: "Sesi Listener tidak valid." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const turnKeyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const turnApiToken = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!supabaseUrl || !supabaseAnonKey || !turnKeyId || !turnApiToken) {
    return NextResponse.json({ error: "Konfigurasi voice server belum lengkap." }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Sesi Listener sudah berakhir. Silakan masuk kembali." }, { status: 401 });
  }

  try {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(turnKeyId)}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${turnApiToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ ttl: 3600 }),
        cache: "no-store"
      }
    );

    if (!response.ok) {
      console.error("Cloudflare TURN credential request failed:", response.status);
      return NextResponse.json({ error: "Cloudflare gagal membuat kredensial koneksi voice." }, { status: 502 });
    }

    const data = await response.json() as { iceServers?: RTCIceServer[] };
    if (!Array.isArray(data.iceServers) || data.iceServers.length === 0) {
      return NextResponse.json({ error: "Cloudflare tidak mengembalikan konfigurasi ICE yang valid." }, { status: 502 });
    }

    const iceServers = data.iceServers
      .map((server) => {
        if (!server || !server.urls) return null;
        const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
        const browserUrls = urls.filter((url) => !url.includes(":53"));
        if (browserUrls.length === 0) return null;
        return { ...server, urls: browserUrls };
      })
      .filter((server): server is RTCIceServer => server !== null);

    return NextResponse.json({ iceServers }, {
      headers: { "Cache-Control": "no-store, max-age=0" }
    });
  } catch (error) {
    console.error("Cloudflare TURN credential generation error:", error);
    return NextResponse.json({ error: "Tidak dapat menghubungi layanan Cloudflare TURN." }, { status: 502 });
  }
}
