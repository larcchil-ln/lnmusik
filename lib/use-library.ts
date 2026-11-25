"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Track } from "@/components/home-hero";

type LibraryRow = { kind: "liked" | "history"; video_id: string; title: string; channel_title: string; thumbnail: string };

const HISTORY_LIMIT = 30;
const toTrack = (row: LibraryRow): Track => ({ videoId: row.video_id, title: row.title, channelTitle: row.channel_title, thumbnail: row.thumbnail });

async function ensureUserId() {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) return data.session.user.id;
  const { data: anon, error } = await supabase.auth.signInAnonymously();
  if (error || !anon.user) throw new Error("Tidak dapat membuat sesi Listener.");
  return anon.user.id;
}

export function useLibrary() {
  const [liked, setLiked] = useState<Track[]>([]);
  const [history, setHistory] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const userId = await ensureUserId();
      const { data, error: queryError } = await createClient()
        .from("user_library")
        .select("kind,video_id,title,channel_title,thumbnail")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (queryError) throw queryError;
      const rows = (data ?? []) as LibraryRow[];
      setLiked(rows.filter(row => row.kind === "liked").map(toTrack));
      setHistory(rows.filter(row => row.kind === "history").slice(0, HISTORY_LIMIT).map(toTrack));
      setError("");
    } catch (err) {
      const message = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? "");
      setError(/user_library/.test(message) ? "Tabel library belum dibuat. Jalankan supabase/user-library.sql di Supabase SQL Editor." : message || "Library belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const isLiked = useCallback((videoId?: string) => Boolean(videoId && liked.some(track => track.videoId === videoId)), [liked]);

  const toggleLike = useCallback(async (track: Track) => {
    const wasLiked = liked.some(item => item.videoId === track.videoId);
    setLiked(items => wasLiked ? items.filter(item => item.videoId !== track.videoId) : [track, ...items]);
    try {
      const userId = await ensureUserId();
      const table = createClient().from("user_library");
      const { error: writeError } = wasLiked
        ? await table.delete().eq("user_id", userId).eq("kind", "liked").eq("video_id", track.videoId)
        : await table.upsert({ user_id: userId, kind: "liked", video_id: track.videoId, title: track.title, channel_title: track.channelTitle, thumbnail: track.thumbnail, created_at: new Date().toISOString() });
      if (writeError) throw writeError;
    } catch {
      setLiked(items => wasLiked ? [track, ...items] : items.filter(item => item.videoId !== track.videoId));
      setError("Gagal menyimpan lagu favorit.");
    }
  }, [liked]);

  const recordPlay = useCallback(async (track: Track) => {
    setHistory(items => [track, ...items.filter(item => item.videoId !== track.videoId)].slice(0, HISTORY_LIMIT));
    try {
      const userId = await ensureUserId();
      await createClient().from("user_library").upsert({ user_id: userId, kind: "history", video_id: track.videoId, title: track.title, channel_title: track.channelTitle, thumbnail: track.thumbnail, created_at: new Date().toISOString() });
    } catch {
      // History is best-effort; playback should never fail because of it.
    }
  }, []);

  return { liked, history, loading, error, isLiked, toggleLike, recordPlay };
}
