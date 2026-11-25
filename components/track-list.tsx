"use client";

import { Heart, Play, Plus } from "lucide-react";
import type { Track } from "@/components/home-hero";

type TrackListProps = {
  tracks: Track[];
  ranked?: boolean;
  activeId?: string;
  isLiked?: (videoId: string) => boolean;
  onPlay: (track: Track) => void;
  onQueue: (track: Track) => void;
  onLike?: (track: Track) => void;
};

export default function TrackList({ tracks, ranked, activeId, isLiked, onPlay, onQueue, onLike }: TrackListProps) {
  return (
    <ol className="trending-grid">
      {tracks.map((track, index) => {
        const liked = isLiked?.(track.videoId) ?? false;
        return (
          <li className={`trending-track ${activeId === track.videoId ? "is-active" : ""}`} key={track.videoId}>
            <button className="trending-play" onClick={() => onPlay(track)} aria-label={`Putar ${track.title}`}>
              <img src={track.thumbnail} alt="" loading="lazy" />
              <span className="trending-overlay"><Play size={16} fill="currentColor" /></span>
              {ranked && <span className="trending-rank">{index + 1}</span>}
            </button>
            <div className="trending-copy"><strong>{track.title}</strong><small>{track.channelTitle}</small></div>
            <div className="trending-actions">
              {onLike && (
                <button className={`icon-btn ${liked ? "liked" : ""}`} onClick={() => onLike(track)} aria-label={liked ? "Hapus dari favorit" : "Tambah ke favorit"} aria-pressed={liked}>
                  <Heart size={16} fill={liked ? "currentColor" : "none"} />
                </button>
              )}
              <button className="icon-btn" onClick={() => onQueue(track)} aria-label="Tambah ke antrean"><Plus size={18} /></button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
