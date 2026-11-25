"use client";

import { useState } from "react";
import {
  AudioLines, Home, Compass, Radio, Library, Download, Search, Bell, Plus,
  Play, Pause, SkipBack, SkipForward, Heart, ListMusic, Headphones, Users,
  Music2, Sparkles, MoreHorizontal, Clock3
} from "lucide-react";

type Tab = "Home" | "Explore" | "Rooms" | "Library" | "Offline";

const navItems = [
  { name: "Home" as Tab, icon: Home },
  { name: "Explore" as Tab, icon: Compass },
  { name: "Rooms" as Tab, icon: Radio },
  { name: "Library" as Tab, icon: Library },
  { name: "Offline" as Tab, icon: Download }
];

const mixes = [
  { title: "Your Daily Mix", subtitle: "Pilihan musik untuk hari ini", tone: "" },
  { title: "Indonesian Indie", subtitle: "Musisi pilihan Indonesia", tone: "alt-1" },
  { title: "After Hours", subtitle: "Temani malam lebih tenang", tone: "alt-2" },
  { title: "The New Wave", subtitle: "Temukan suara baru", tone: "alt-3" }
];

const rooms = [
  { title: "Late Night Sessions", host: "Nana", members: "4/10", song: "Sedang mendengarkan musik" },
  { title: "Indie Corner", host: "Raka", members: "7/10", song: "Playlist indie pilihan" },
  { title: "Quiet Moments", host: "Alya", members: "2/10", song: "Lagu untuk bersantai" }
];

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<Tab>("Home");
  const [isPlaying, setIsPlaying] = useState(false);
  const [query, setQuery] = useState("");

  const pageCopy: Record<Tab, { title: string; subtitle: string }> = {
    Home: { title: "Music Without\nDistance.", subtitle: "Temukan musik yang kamu suka, simpan koleksi favorit, dan nikmati momen mendengarkan bersama." },
    Explore: { title: "Find your\nnext favorite.", subtitle: "Jelajahi lagu, artis, album, dan video musik dari berbagai genre." },
    Rooms: { title: "Listen together.", subtitle: "Temukan ruang dengar, bergabung dengan teman, dan nikmati musik dalam satu waktu." },
    Library: { title: "Your music,\nyour space.", subtitle: "Semua playlist, album, artis, dan lagu favoritmu dalam satu tempat." },
    Offline: { title: "Your music\neverywhere.", subtitle: "Putar koleksi audio pribadi dari perangkatmu, bahkan tanpa koneksi internet." }
  };

  const copy = pageCopy[activeTab];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><AudioLines size={22} /></div>
          <div className="brand-name">LN<span>MUSIK</span></div>
        </div>
        <div className="nav-label">MENU UTAMA</div>
        <nav className="nav-list">
          {navItems.map(({ name, icon: Icon }) => (
            <button key={name} className={`nav-item ${activeTab === name ? "active" : ""}`} onClick={() => setActiveTab(name)}>
              <Icon /><span>{name}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <p>Listening is better together.</p>
          <small>Buat ruang dengar dan nikmati musik bersama orang-orang terdekat.</small>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <label className="searchbox">
            <Search size={17} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari lagu, artis, album..." />
          </label>
          <div className="profile">
            <button className="icon-btn" aria-label="Notifikasi"><Bell size={18} /></button>
            <div className="avatar">L</div>
            <div className="profile-text"><strong>Listener</strong><small>Free account</small></div>
          </div>
        </header>

        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">LNMUSIK • MUSIC WITHOUT DISTANCE</div>
            <h1>{copy.title.split("\n").map((line, i) => <span key={i}>{line}{i === 0 ? <br /> : null}</span>)}</h1>
            <p>{copy.subtitle}</p>
            <button className="primary-btn" onClick={() => setActiveTab(activeTab === "Home" ? "Explore" : "Home")}>
              <Headphones size={15} /> {activeTab === "Home" ? "Jelajahi musik" : "Kembali ke Home"}
            </button>
          </div>
        </section>

        {activeTab === "Home" && (
          <>
            <section className="section">
              <div className="section-head"><h2>Made for your moments</h2><span>Kurasi pilihan</span></div>
              <div className="card-grid">
                {mixes.map((mix, i) => (
                  <article className="music-card" key={mix.title} onClick={() => setIsPlaying(true)}>
                    <div className={`artwork ${mix.tone}`}><AudioLines /></div>
                    <strong>{mix.title}</strong><small>{mix.subtitle}</small>
                  </article>
                ))}
              </div>
            </section>
            <section className="section">
              <div className="section-head"><h2>Listening rooms</h2><span>Temukan teman dengar</span></div>
              <div className="room-grid">
                {rooms.map((room) => (
                  <article className="room-card" key={room.title}>
                    <div className="room-top"><span className="live">● ROOM PREVIEW</span><MoreHorizontal size={17} color="#888" /></div>
                    <h3>{room.title}</h3><p>Host: {room.host} · {room.song}</p>
                    <div className="room-foot"><span><Users size={13} style={{ verticalAlign: "middle", marginRight: 5 }} />{room.members} anggota</span><button className="join-btn" onClick={() => setActiveTab("Rooms")}>Lihat room</button></div>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}

        {activeTab === "Explore" && (
          <section className="section">
            <div className="section-head"><h2>{query ? `Hasil untuk “${query}”` : "Jelajahi musik"}</h2><span>YouTube discovery akan dihubungkan</span></div>
            <div className="card-grid">
              {["Pop Indonesia", "Indie & Alternative", "Acoustic Sessions", "New Releases"].map((name, i) => (
                <article className="music-card" key={name}><div className={`artwork ${["", "alt-1", "alt-2", "alt-3"][i]}`}><Compass /></div><strong>{name}</strong><small>Koleksi untuk dijelajahi</small></article>
              ))}
            </div>
          </section>
        )}

        {activeTab === "Rooms" && (
          <section className="section">
            <div className="section-head"><h2>Active listening rooms</h2><span>Maksimal 10 orang per room</span></div>
            <div className="room-grid">
              {rooms.map((room) => <article className="room-card" key={room.title}><div className="room-top"><span className="live">● ROOM CONCEPT</span><Radio size={16} /></div><h3>{room.title}</h3><p>Host: {room.host} · {room.song}</p><div className="room-foot"><span><Users size={13} style={{ verticalAlign: "middle", marginRight: 5 }} />{room.members} anggota</span><button className="join-btn">Detail room</button></div></article>)}
            </div>
          </section>
        )}

        {activeTab === "Library" && (
          <section className="section">
            <div className="section-head"><h2>Your collection</h2><span>Perpustakaan musik</span></div>
            <div className="card-grid">
              {["Liked Songs", "Your Playlists", "Albums", "Artists"].map((name, i) => <article className="music-card" key={name}><div className={`artwork ${["", "alt-1", "alt-2", "alt-3"][i]}`}><Library /></div><strong>{name}</strong><small>Koleksimu</small></article>)}
            </div>
          </section>
        )}

        {activeTab === "Offline" && (
          <section className="section">
            <div className="room-card" style={{ padding: 26 }}>
              <Download size={28} color="#1ed760" />
              <h3 style={{ fontSize: 17, marginTop: 16 }}>Musik dari perangkatmu</h3>
              <p>Impor file audio pribadi untuk membangun koleksi offline. Dukungan pemilihan file akan diaktifkan pada tahap berikutnya.</p>
              <div style={{ marginTop: 20 }}><button className="primary-btn"><Plus size={15} /> Pilih file musik</button></div>
            </div>
          </section>
        )}
      </main>

      <div className="playerbar">
        <div className="track-info">
          <div className="track-cover"><Music2 size={21} /></div>
          <div style={{ minWidth: 0 }}><strong>Belum ada lagu diputar</strong><small>Mulai jelajahi musik</small></div>
          <button className="icon-btn" aria-label="Sukai lagu"><Heart size={16} /></button>
        </div>
        <div className="player-controls">
          <button className="icon-btn skip" aria-label="Sebelumnya"><SkipBack size={17} /></button>
          <button className="play-btn" aria-label={isPlaying ? "Pause" : "Play"} onClick={() => setIsPlaying(!isPlaying)}>{isPlaying ? <Pause size={17} /> : <Play size={17} fill="currentColor" />}</button>
          <button className="icon-btn skip" aria-label="Berikutnya"><SkipForward size={17} /></button>
        </div>
        <div className="player-actions"><Clock3 size={17} /><ListMusic size={18} /><Plus size={18} /></div>
      </div>

      <nav className="mobile-nav">
        {navItems.map(({ name, icon: Icon }) => <button key={name} className={activeTab === name ? "active" : ""} onClick={() => setActiveTab(name)}><Icon /><span>{name}</span></button>)}
      </nav>
    </div>
  );
}
