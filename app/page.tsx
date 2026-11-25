"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import RoomsPanel from "@/components/rooms-panel";
import {
  AudioLines, Home, Compass, Radio, Library, Download, Search, Bell, Plus,
  Play, Pause, SkipBack, SkipForward, Heart, ListMusic, Headphones, Users,
  Music2, MoreHorizontal, ChevronUp, ChevronDown, X, Youtube, Loader2
} from "lucide-react";

type Tab = "Home" | "Explore" | "Rooms" | "Library" | "Offline";
type Track = { videoId: string; title: string; channelTitle: string; thumbnail: string };
type RoomPlaybackEvent = { action: "track"; track: Track } | { action: "play" | "pause" } | { action: "seek"; seconds: number };
type RoomQueueRow = { id: string; video_id: string; title: string; channel_title: string; thumbnail: string; position: number };

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
  const [query, setQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [searchError, setSearchError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [roomQueueRows, setRoomQueueRows] = useState<RoomQueueRow[]>([]);
  const [homeIndonesia, setHomeIndonesia] = useState<Track[]>([]);
  const [homeGlobal, setHomeGlobal] = useState<Track[]>([]);
  const [homeLoading, setHomeLoading] = useState(false);
  const [homeUpdatedAt, setHomeUpdatedAt] = useState<Date | null>(null);
  const [showQueue, setShowQueue] = useState(false);
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const [lyrics, setLyrics] = useState<string[]>([]);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const roomChannelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const [localAudioUrl, setLocalAudioUrl] = useState("");
  const [localAudioName, setLocalAudioName] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);


  const broadcastRoomPlayback = (payload: RoomPlaybackEvent) => {
    if (!roomChannelRef.current) return;
    void roomChannelRef.current.send({ type: "broadcast", event: "playback", payload });
  };

  useEffect(() => {
    const handleRoomChange = (event: Event) => {
      const detail = (event as CustomEvent<{ roomId: string | null }>).detail;
      setActiveRoomId(detail?.roomId ?? null);
    };
    window.addEventListener("lnmusik:room", handleRoomChange);
    return () => window.removeEventListener("lnmusik:room", handleRoomChange);
  }, []);

  useEffect(() => {
    if (!activeRoomId) {
      if (roomChannelRef.current) {
        void createClient().removeChannel(roomChannelRef.current);
        roomChannelRef.current = null;
      }
      return;
    }

    const supabase = createClient();
    const channel = supabase.channel(`room-playback-${activeRoomId}`, { config: { broadcast: { self: false } } });
    channel.on("broadcast", { event: "playback" }, ({ payload }: { payload: RoomPlaybackEvent }) => {
      if (!payload) return;
      if (payload.action === "track") {
        setLocalAudioUrl((oldUrl) => { if (oldUrl) URL.revokeObjectURL(oldUrl); return ""; });
        setLocalAudioName("");
        setCurrentTrack(payload.track);
        setIsPlaying(true);
        setQueue((items) => items.filter((item) => item.videoId !== payload.track.videoId));
      } else if (payload.action === "play" || payload.action === "pause") {
        const shouldPlay = payload.action === "play";
        setIsPlaying(shouldPlay);
        iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: shouldPlay ? "playVideo" : "pauseVideo", args: [] }), "*");
      } else if (payload.action === "seek") {
        iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "seekTo", args: [payload.seconds, true] }), "*");
      }
    }).subscribe();

    roomChannelRef.current = channel;
    return () => {
      void supabase.removeChannel(channel);
      if (roomChannelRef.current === channel) roomChannelRef.current = null;
    };
  }, [activeRoomId]);

  useEffect(() => {
    if (!activeRoomId) { setRoomQueueRows([]); return; }
    const supabase = createClient();
    let alive = true;
    const refresh = async () => {
      const { data, error } = await supabase.from("room_queue").select("id,video_id,title,channel_title,thumbnail,position").eq("room_id", activeRoomId).order("position", { ascending: true }).order("created_at", { ascending: true });
      if (!alive) return;
      if (error) { setSearchError(error.message); return; }
      const rows = (data ?? []) as RoomQueueRow[];
      setRoomQueueRows(rows);
      setQueue(rows.map(row => ({ videoId: row.video_id, title: row.title, channelTitle: row.channel_title, thumbnail: row.thumbnail })));
    };
    void refresh();
    const channel = supabase.channel("room-queue-" + activeRoomId).on("postgres_changes", { event: "*", schema: "public", table: "room_queue", filter: "room_id=eq." + activeRoomId }, () => { void refresh(); }).subscribe();
    return () => { alive = false; void supabase.removeChannel(channel); };
  }, [activeRoomId]);

  useEffect(() => {
    let alive = true;
    const loadTrending = async () => {
      setHomeLoading(true);
      const [idResponse, globalResponse] = await Promise.all([fetch("/api/youtube/trending?region=ID"), fetch("/api/youtube/trending?region=US")]);
      const [idData, globalData] = await Promise.all([idResponse.json(), globalResponse.json()]);
      if (!alive) return;
      if (idResponse.ok) setHomeIndonesia(idData.items ?? []);
      if (globalResponse.ok) setHomeGlobal(globalData.items ?? []);
      setHomeUpdatedAt(new Date());
      setHomeLoading(false);
    };
    void loadTrending();
    const interval = window.setInterval(() => { void loadTrending(); }, 10 * 60 * 1000);
    return () => { alive = false; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setResults([]); setSearchQuery(""); setIsSearching(false); return; }
    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      setSearchError("");
      setSearchQuery(term);
      try {
        const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(term)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Pencarian gagal.");
        setResults(data.items ?? []);
      } catch (error) {
        setResults([]);
        setSearchError(error instanceof Error ? error.message : "Terjadi kesalahan.");
      } finally { setIsSearching(false); }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!currentTrack) { setLyrics([]); return; }
    let alive = true;
    setLyricsLoading(true);
    setLyrics([]);
    const params = new URLSearchParams({ track: currentTrack.title, artist: currentTrack.channelTitle });
    fetch(`/api/lyrics?${params.toString()}`).then(response => response.ok ? response.json() : null).then(data => {
      if (!alive) return;
      setLyrics(typeof data?.plainLyrics === "string" ? data.plainLyrics.split("\\n").filter(Boolean) : []);
    }).catch(() => { if (alive) setLyrics([]); }).finally(() => { if (alive) setLyricsLoading(false); });
    return () => { alive = false; };
  }, [currentTrack?.videoId]);

  const searchYouTube = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const term = query.trim();
    if (term.length < 2) {
      setSearchError("Masukkan minimal 2 karakter.");
      return;
    }
    setIsSearching(true);
    setSearchError("");
    setSearchQuery(term);
    if (!activeRoomId) setActiveTab("Explore");
    try {
      const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(term)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Pencarian gagal.");
      setResults(data.items ?? []);
      if (!data.items?.length) setSearchError("Belum ada hasil. Coba kata pencarian lain.");
    } catch (error) {
      setResults([]);
      setSearchError(error instanceof Error ? error.message : "Terjadi kesalahan.");
    } finally {
      setIsSearching(false);
    }
  };

  const playTrack = (track: Track) => {
    if (localAudioUrl) {
      URL.revokeObjectURL(localAudioUrl);
      setLocalAudioUrl("");
      setLocalAudioName("");
    }
    setCurrentTrack(track);
    setIsPlaying(true);
    broadcastRoomPlayback({ action: "track", track });
    setQueue((items) => items.filter((item) => item.videoId !== track.videoId));
    if (activeRoomId) void createClient().from("room_queue").delete().eq("room_id", activeRoomId).eq("video_id", track.videoId);
  };

  const addToQueue = async (track: Track) => {
    if (currentTrack?.videoId === track.videoId || queue.some((item) => item.videoId === track.videoId)) return;
    if (activeRoomId) {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { setSearchError("Identitas Listener belum tersedia."); return; }
      const { error } = await supabase.from("room_queue").insert({ room_id: activeRoomId, video_id: track.videoId, title: track.title, channel_title: track.channelTitle, thumbnail: track.thumbnail, position: roomQueueRows.length, added_by: auth.user.id });
      if (error) { setSearchError("Gagal menambahkan lagu ke antrean room: " + error.message); return; }
      return;
    }
    setQueue((items) => [...items, track]);
  };

  const togglePlayback = () => {
    if (localAudioUrl && audioRef.current) {
      if (audioRef.current.paused) void audioRef.current.play();
      else audioRef.current.pause();
      return;
    }
    if (currentTrack && iframeRef.current?.contentWindow) {
      const func = isPlaying ? "pauseVideo" : "playVideo";
      iframeRef.current.contentWindow.postMessage(JSON.stringify({ event: "command", func, args: [] }), "*");
      setIsPlaying(!isPlaying);
      broadcastRoomPlayback({ action: isPlaying ? "pause" : "play" });
    }
  };

  const playNext = () => {
    if (!queue.length) {
      setCurrentTrack(null);
      setIsPlaying(false);
      return;
    }
    const [next, ...remaining] = queue;
    setQueue(remaining);
    setCurrentTrack(next);
    setIsPlaying(true);
    broadcastRoomPlayback({ action: "track", track: next });
    if (activeRoomId) {
      const row = roomQueueRows.find(item => item.video_id === next.videoId);
      if (row) void createClient().from("room_queue").delete().eq("id", row.id);
    }
  };

  const moveQueueItem = (index: number, direction: -1 | 1) => {
    setQueue((items) => {
      const target = index + direction;
      if (target < 0 || target >= items.length) return items;
      const updated = [...items];
      [updated[index], updated[target]] = [updated[target], updated[index]];
      if (activeRoomId) {
        const rows = [...roomQueueRows];
        [rows[index], rows[target]] = [rows[target], rows[index]];
        setRoomQueueRows(rows);
        const supabase = createClient();
        void Promise.all(rows.map((row, position) => supabase.from("room_queue").update({ position }).eq("id", row.id)));
      }
      return updated;
    });
  };

  const handleLocalFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (localAudioUrl) URL.revokeObjectURL(localAudioUrl);
    const url = URL.createObjectURL(file);
    setLocalAudioUrl(url);
    setLocalAudioName(file.name);
    setCurrentTrack(null);
    setIsPlaying(true);
  };

  const pageCopy: Record<Tab, { title: string; subtitle: string }> = {
    Home: { title: "Music Without\nDistance.", subtitle: "Temukan musik yang kamu suka, simpan koleksi favorit, dan nikmati momen mendengarkan bersama." },
    Explore: { title: "Find your\nnext favorite.", subtitle: "Cari lagu dan video musik dari katalog YouTube." },
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
        {<header className="topbar">
          <div className="search-area"><form className="searchbox" onSubmit={searchYouTube}>
            <Search size={17} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={activeRoomId ? "Cari lagu untuk diputar bareng..." : "Cari lagu, artis, album..."} aria-label="Cari musik di YouTube" />
            <button type="submit" className="search-submit" aria-label="Cari" disabled={isSearching}>
              {isSearching ? <Loader2 size={16} className="spin" /> : <Search size={16} />}
            </button>
          </form>
          {activeRoomId && query.trim().length >= 2 && <div className="search-popover">
            {isSearching && <div className="search-popover-status"><Loader2 size={14} className="spin" /> Mencari lagu...</div>}
            {!isSearching && searchError && <div className="search-popover-status">{searchError}</div>}
            {!isSearching && !searchError && results.length === 0 && <div className="search-popover-status">Tidak ada hasil untuk “{searchQuery}”.</div>}
            {!isSearching && results.slice(0,5).map(track => <div className="search-suggestion" key={track.videoId}><button className="suggestion-main" onClick={() => { playTrack(track); setQuery(""); setResults([]); }}><img src={track.thumbnail} alt="" /><span><strong>{track.title}</strong><small>{track.channelTitle}</small></span></button><button className="icon-btn" aria-label="Tambah ke antrean" onClick={() => void addToQueue(track)}><Plus size={18}/></button></div>)}
          </div>}
          </div>
          {!activeRoomId && <div className="profile">
            <button className="icon-btn" aria-label="Notifikasi"><Bell size={18} /></button>
            <div className="avatar">L</div>
            <div className="profile-text"><strong>Listener</strong><small>Free account</small></div>
          </div>}
        </header>}

        {!activeRoomId && <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">LNMUSIK • MUSIC WITHOUT DISTANCE</div>
            <h1>{copy.title.split("\n").map((line, i) => <span key={i}>{line}{i === 0 ? <br /> : null}</span>)}</h1>
            <p>{copy.subtitle}</p>
            <button className="primary-btn" onClick={() => setActiveTab(activeTab === "Home" ? "Explore" : "Home")}>
              <Headphones size={15} /> {activeTab === "Home" ? "Jelajahi musik" : "Kembali ke Home"}
            </button>
          </div>
        </section>}

        {activeTab === "Home" && (
          <>
            <section className="section">
              <div className="section-head"><h2>Made for your moments</h2><span>Kurasi pilihan</span></div>
              <div className="card-grid">
                {mixes.map((mix) => (
                  <article className="music-card" key={mix.title} onClick={() => { setQuery(mix.title); setActiveTab("Explore"); }}>
                    <div className={`artwork ${mix.tone}`}><AudioLines /></div>
                    <strong>{mix.title}</strong><small>{mix.subtitle}</small>
                  </article>
                ))}
              </div>
            </section>
            <section className="section trending-section">
              <div className="section-head"><h2>Hits Indonesia sekarang</h2><span>{homeUpdatedAt ? "Diperbarui " + homeUpdatedAt.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}) : homeLoading ? "Memuat..." : "YouTube Music Charts"}</span></div>
              {homeLoading && !homeIndonesia.length ? <div className="loading-state"><Loader2 className="spin" /> Memuat lagu populer Indonesia...</div> : <div className="trending-grid">{homeIndonesia.slice(0,8).map((track,index)=><article className="trending-track" key={track.videoId}><button className="trending-play" onClick={()=>playTrack(track)}><img src={track.thumbnail} alt="" /><span>{index+1}</span></button><div className="trending-copy"><strong>{track.title}</strong><small>{track.channelTitle}</small></div><button className="icon-btn" onClick={()=>void addToQueue(track)} aria-label="Tambah ke antrean"><Plus size={18}/></button></article>)}</div>}
            </section>
            <section className="section trending-section">
              <div className="section-head"><h2>Global hits</h2><span>Trending dunia</span></div>
              {homeLoading && !homeGlobal.length ? <div className="loading-state"><Loader2 className="spin" /> Memuat global hits...</div> : <div className="trending-grid">{homeGlobal.slice(0,8).map((track,index)=><article className="trending-track" key={track.videoId}><button className="trending-play" onClick={()=>playTrack(track)}><img src={track.thumbnail} alt="" /><span>{index+1}</span></button><div className="trending-copy"><strong>{track.title}</strong><small>{track.channelTitle}</small></div><button className="icon-btn" onClick={()=>void addToQueue(track)} aria-label="Tambah ke antrean"><Plus size={18}/></button></article>)}</div>}
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

        {(activeTab === "Explore" && !activeRoomId) && (
          <section className="section">
            <div className="section-head"><h2>{searchQuery ? `Hasil untuk “${searchQuery}”` : "Jelajahi musik"}</h2><span><Youtube size={13} style={{ verticalAlign: "middle", marginRight: 5 }} />YouTube</span></div>
            {searchError && <div className="notice">{searchError}</div>}
            {isSearching && <div className="loading-state"><Loader2 className="spin" /> Sedang mencari di YouTube...</div>}
            {!isSearching && results.length > 0 && (
              <div className="youtube-results">
                {results.map((track) => (
                  <article className="youtube-result" key={track.videoId}>
                    <button className="result-main" onClick={() => playTrack(track)}>
                      <img src={track.thumbnail} alt="" />
                      <span className="result-copy"><strong>{track.title}</strong><small>{track.channelTitle}</small></span>
                    </button>
                    <button className="icon-btn add-track" onClick={() => addToQueue(track)} aria-label="Tambahkan ke antrean"><Plus size={19} /></button>
                  </article>
                ))}
              </div>
            )}
            {!isSearching && results.length === 0 && !searchError && (
              <div className="empty-state"><div className="empty-icon"><Search /></div><h3>Temukan musik berikutnya</h3><p>Ketik judul lagu, nama artis, atau kata kunci di kolom pencarian.</p></div>
            )}
          </section>
        )}

        {activeTab === "Rooms" && <RoomsPanel />}

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
            <div className="room-card offline-card">
              <Download size={28} color="#1ed760" />
              <h3>Musik dari perangkatmu</h3>
              <p>Pilih file audio pribadi dari perangkat untuk diputar di browser ini. File tidak diunggah ke server.</p>
              <label className="primary-btn file-picker"><Plus size={15} /> Pilih file musik<input type="file" accept="audio/*" onChange={handleLocalFile} /></label>
              {localAudioName && <p className="local-file-name">Dipilih: {localAudioName}</p>}
              {localAudioUrl && <audio ref={audioRef} className="local-audio" controls autoPlay src={localAudioUrl} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />}
            </div>
          </section>
        )}
      </main>

      {currentTrack && (
        <aside className="mini-youtube">
          <div className="mini-youtube-head"><span>NOW PLAYING · YOUTUBE</span><button className="icon-btn" onClick={() => { setCurrentTrack(null); setIsPlaying(false); }} aria-label="Tutup pemutar"><X size={15} /></button></div>
          <iframe ref={iframeRef} key={currentTrack.videoId} title={currentTrack.title} width="240" height="200" src={`https://www.youtube-nocookie.com/embed/${currentTrack.videoId}?autoplay=1&controls=1&rel=0&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`} allow="autoplay; encrypted-media; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" />
          <div className="mini-youtube-title">{currentTrack.title}</div>
        </aside>
      )}

      {showNowPlaying && currentTrack && <div className="now-playing-backdrop" onClick={() => setShowNowPlaying(false)}><section className="now-playing-modal" onClick={event => event.stopPropagation()}><div className="now-playing-head"><span>NOW PLAYING · LNMUSIK</span><button className="icon-btn" onClick={() => setShowNowPlaying(false)} aria-label="Tutup"><X/></button></div><div className="now-playing-video"><iframe title={currentTrack.title + " video"} src={`https://www.youtube-nocookie.com/embed/${currentTrack.videoId}?autoplay=0&controls=1&rel=0&playsinline=1`} allow="autoplay; encrypted-media; picture-in-picture" /></div><div className="now-playing-track"><img src={currentTrack.thumbnail} alt="" /><div><strong>{currentTrack.title}</strong><small>{currentTrack.channelTitle}</small></div></div><div className="now-playing-controls"><button className="play-btn" onClick={togglePlayback} aria-label={isPlaying ? "Pause" : "Play"}>{isPlaying ? <Pause/> : <Play fill="currentColor"/>}</button><button className="icon-btn" onClick={playNext} aria-label="Lagu berikutnya"><SkipForward/></button><button className={`icon-btn ${showQueue ? "selected" : ""}`} onClick={() => setShowQueue(value => !value)} aria-label="Buka antrean"><ListMusic/></button></div><div className="now-playing-lyrics"><div className="section-head"><h2>Lirik</h2><span>{lyricsLoading ? "Mencari lirik..." : lyrics.length ? "LRCLIB" : "Belum tersedia"}</span></div>{lyricsLoading ? <p className="muted">Sedang mencari lirik lagu...</p> : lyrics.length ? <div className="lyrics-lines">{lyrics.map((line,index)=><p key={index}>{line}</p>)}</div> : <p className="muted">Lirik untuk lagu ini belum ditemukan. Video tetap bisa dinikmati di atas.</p>}</div></section></div>}

      {showQueue && (
        <aside className="queue-panel">
          <div className="queue-head"><div><strong>Antrean berikutnya</strong><small>{queue.length} lagu{activeRoomId ? " · antrean room" : ""}</small></div><button className="icon-btn" onClick={() => setShowQueue(false)} aria-label="Tutup antrean"><X /></button></div>
          {queue.length === 0 ? <div className="queue-empty">Antrean masih kosong. Tambahkan lagu dari Explore.</div> : queue.map((track, index) => (
            <div className="queue-item" key={track.videoId}>
              <img src={track.thumbnail} alt="" />
              <div className="queue-copy"><strong>{track.title}</strong><small>{track.channelTitle}</small></div>
              <div className="queue-order">
                <button className="icon-btn" onClick={() => moveQueueItem(index, -1)} disabled={index === 0} aria-label="Naikkan"><ChevronUp size={16} /></button>
                <button className="icon-btn" onClick={() => moveQueueItem(index, 1)} disabled={index === queue.length - 1} aria-label="Turunkan"><ChevronDown size={16} /></button>
                <button className="icon-btn" onClick={() => setQueue((items) => items.filter((item) => item.videoId !== track.videoId))} aria-label="Hapus"><X size={15} /></button>
              </div>
            </div>
          ))}
          {queue.length > 0 && <button className="queue-play-next" onClick={playNext}>Putar berikutnya</button>}
        </aside>
      )}

      <div className="playerbar">
        <button className="track-info track-info-click" onClick={() => setShowNowPlaying(true)} aria-label="Buka pemutar lagu">
          <div className="track-cover">{currentTrack ? <img src={currentTrack.thumbnail} alt="" /> : <Music2 size={21} />}</div>
          <div className="track-meta">
            <strong>{localAudioName || currentTrack?.title || "Belum ada lagu diputar"}</strong>
            <small>{localAudioName ? "File lokal · perangkat ini" : currentTrack?.channelTitle || "Mulai jelajahi musik"}</small>
          </div>
          <span className="icon-btn" aria-hidden="true"><Heart size={16} /></span>
        </button>
        <div className="player-controls">
          <button className="icon-btn skip" aria-label="Sebelumnya" onClick={() => setIsPlaying(false)}><SkipBack size={17} /></button>
          <button className="play-btn" aria-label={isPlaying ? "Pause" : "Play"} onClick={togglePlayback} disabled={!currentTrack && !localAudioUrl}>{isPlaying ? <Pause size={17} /> : <Play size={17} fill="currentColor" />}</button>
          <button className="icon-btn skip" aria-label="Berikutnya" onClick={playNext}><SkipForward size={17} /></button>
        </div>
        <div className="player-actions">
          <button className={`icon-btn ${showQueue ? "selected" : ""}`} onClick={() => setShowQueue(!showQueue)} aria-label="Buka antrean"><ListMusic size={19} /><span>{queue.length}</span></button>
        </div>

      </div>

      <nav className="mobile-nav">
        {navItems.map(({ name, icon: Icon }) => <button key={name} className={activeTab === name ? "active" : ""} onClick={() => setActiveTab(name)}><Icon /><span>{name}</span></button>)}
      </nav>
    </div>
  );
}
