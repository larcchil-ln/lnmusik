"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Play, Plus, TrendingUp } from "lucide-react";

export type Track = { videoId: string; title: string; channelTitle: string; thumbnail: string };
export type ChartRegion = "ID" | "GLOBAL";

type HomeHeroProps = {
  region: ChartRegion;
  onRegionChange: (region: ChartRegion) => void;
  tracks: Track[];
  loading: boolean;
  error: string;
  onPlay: (track: Track) => void;
  onQueue: (track: Track) => void;
};

const FEATURED_COUNT = 5;

export default function HomeHero({ region, onRegionChange, tracks, loading, error, onPlay, onQueue }: HomeHeroProps) {
  const featured = tracks.slice(0, FEATURED_COUNT);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => { setIndex(0); }, [region, featured[0]?.videoId]);

  useEffect(() => {
    if (paused || featured.length < 2) return;
    const timer = window.setInterval(() => setIndex(value => (value + 1) % featured.length), 7000);
    return () => window.clearInterval(timer);
  }, [paused, featured.length]);

  const track = featured[index];
  const step = (direction: 1 | -1) => setIndex(value => (value + direction + featured.length) % featured.length);

  return (
    <section
      className="hero hero-cover"
      aria-roledescription="carousel"
      aria-label="Lagu trending"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {track && <img key={track.videoId} className="hero-backdrop" src={track.thumbnail} alt="" aria-hidden="true" />}
      <div className="hero-shade" aria-hidden="true" />

      <div className="hero-inner">
        <div className="hero-copy">
          <div className="hero-top">
            <span className="eyebrow"><TrendingUp size={12} /> Trending #{index + 1} · {region === "ID" ? "Indonesia" : "Global"}</span>
            <div className="region-toggle" role="group" aria-label="Pilih chart">
              {(["ID", "GLOBAL"] as ChartRegion[]).map(value => (
                <button key={value} className={region === value ? "active" : ""} aria-pressed={region === value} onClick={() => onRegionChange(value)}>
                  {value === "ID" ? "Indonesia" : "Global"}
                </button>
              ))}
            </div>
          </div>

          {track ? (
            <>
              <h1 className="hero-title">{track.title}</h1>
              <p className="hero-artist">{track.channelTitle}</p>
              <div className="hero-actions">
                <button className="primary-btn" onClick={() => onPlay(track)}><Play size={15} fill="currentColor" /> Putar sekarang</button>
                <button className="ghost-btn" onClick={() => onQueue(track)}><Plus size={15} /> Antrean</button>
              </div>
            </>
          ) : loading ? (
            <div className="hero-status"><Loader2 className="spin" size={18} /> Memuat lagu trending...</div>
          ) : (
            <>
              <h1 className="hero-title">Music Without Distance.</h1>
              <p className="hero-artist">{error || "Daftar trending belum tersedia. Coba lagi sebentar lagi."}</p>
            </>
          )}
        </div>

        {track && (
          <div className="hero-art">
            <img src={track.thumbnail} alt={`Cover ${track.title}`} />
          </div>
        )}
      </div>

      {featured.length > 1 && (
        <div className="hero-nav">
          <div className="hero-dots">
            {featured.map((item, i) => (
              <button key={item.videoId} className={i === index ? "active" : ""} onClick={() => setIndex(i)} aria-label={`Tampilkan trending #${i + 1}`} aria-current={i === index} />
            ))}
          </div>
          <div className="hero-arrows">
            <button className="icon-btn" onClick={() => step(-1)} aria-label="Sebelumnya"><ChevronLeft size={18} /></button>
            <button className="icon-btn" onClick={() => step(1)} aria-label="Berikutnya"><ChevronRight size={18} /></button>
          </div>
        </div>
      )}
    </section>
  );
}
