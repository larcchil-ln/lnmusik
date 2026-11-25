"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Copy, Loader2, Plus, Radio, Users, LogIn, DoorOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import RoomChat from "@/components/room-chat";

type Room = { id: string; code: string; name: string; host_id: string; max_members: number; is_public: boolean; created_at: string };
type Member = { user_id: string; display_name: string; joined_at: string };
type Seat = { room_id: string; seat_number: number; user_id: string };
type Moderator = { room_id: string; user_id: string };

const ACTIVE_ROOM_STORAGE_KEY = "lnmusik-active-room-id";

export default function RoomsPanel() {
  const [supabase, setSupabase] = useState<ReturnType<typeof createClient> | null>(null);
  const [userId, setUserId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roomName, setRoomName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [moderators, setModerators] = useState<Moderator[]>([]);
  const [mutedIds, setMutedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showRoomSettings, setShowRoomSettings] = useState(false);
  const [settingsName, setSettingsName] = useState("");
  const [settingsPublic, setSettingsPublic] = useState(true);
  const [settingsMaxMembers, setSettingsMaxMembers] = useState("10");

  const loadRooms = useCallback(async () => {
    if (!supabase) return;
    const { data, error: loadError } = await supabase.from("rooms").select("id,code,name,host_id,max_members,is_public,created_at").eq("is_public", true).order("created_at", { ascending: false }).limit(30);
    if (loadError) setError(loadError.message);
    else setRooms(data ?? []);
  }, [supabase]);

  const loadSeats = useCallback(async (roomId: string) => {
    if (!supabase) return;
    const { data, error: seatError } = await supabase.from("room_seats").select("room_id,seat_number,user_id").eq("room_id", roomId).order("seat_number");
    if (seatError) setError(seatError.message); else setSeats(data ?? []);
  }, [supabase]);

  const loadMembers = useCallback(async (roomId: string) => {
    if (!supabase) return;
    const { data, error: memberError } = await supabase.from("room_members").select("user_id,display_name,joined_at").eq("room_id", roomId).order("joined_at");
    if (memberError) setError(memberError.message);
    else setMembers(data ?? []);
  }, [supabase]);

  useEffect(() => {
    try {
      setSupabase(createClient());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Konfigurasi Supabase tidak valid.");
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const start = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      let user = sessionData.session?.user;
      if (!user) {
        const { data, error: authError } = await supabase.auth.signInAnonymously();
        if (authError) throw authError;
        user = data.user ?? undefined;
      }
      if (!user) throw new Error("Identitas Listener belum tersedia.");
      if (alive) {
        setUserId(user.id);
        const savedName = window.localStorage.getItem("lnmusik-listener-name") || "Listener";
        setDisplayName(savedName);
      }
    };
    start().catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Gagal menghubungkan akun Listener."); });
    return () => { alive = false; };
  }, [supabase]);

  useEffect(() => { if (userId) void loadRooms(); }, [userId, loadRooms]);

  // RoomsPanel unmounts when the user switches tabs. Restore the room from
  // local storage, but only if this anonymous user is still a member.
  useEffect(() => {
    if (!supabase || !userId) return;
    let alive = true;
    const restoreRoom = async () => {
      const savedRoomId = window.localStorage.getItem(ACTIVE_ROOM_STORAGE_KEY);
      if (!savedRoomId) return;
      const [{ data: room, error: roomError }, { data: membership, error: membershipError }] = await Promise.all([
        supabase.from("rooms").select("id,code,name,host_id,max_members,is_public,created_at").eq("id", savedRoomId).maybeSingle(),
        supabase.from("room_members").select("room_id").eq("room_id", savedRoomId).eq("user_id", userId).maybeSingle()
      ]);
      if (!alive) return;
      if (roomError || membershipError) {
        setError(roomError?.message || membershipError?.message || "Gagal memulihkan room.");
        return;
      }
      if (room && membership) {
        setActiveRoom(room);
        notifyRoomPlayback(room.id);
        setMessage("Room sebelumnya berhasil dipulihkan.");
      } else {
        window.localStorage.removeItem(ACTIVE_ROOM_STORAGE_KEY);
        setActiveRoom(null);
        notifyRoomPlayback(null);
      }
    };
    void restoreRoom();
    return () => { alive = false; };
  }, [supabase, userId]);

  useEffect(() => {\n    if (!supabase || !activeRoom || !userId) return;\n    const touch = () => { void supabase.from("room_members").update({ last_seen_at: new Date().toISOString() }).eq("room_id", activeRoom.id).eq("user_id", userId); };\n    touch();\n    const timer = window.setInterval(touch, 30000);\n    const onVisible = () => { if (document.visibilityState === "visible") touch(); };\n    document.addEventListener("visibilitychange", onVisible);\n    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };\n  }, [supabase, activeRoom?.id, userId]);\n\n  const loadModeration = useCallback(async (roomId: string) => {
    if (!supabase) return;
    const [{ data: mods, error: modError }, { data: mutes, error: muteError }] = await Promise.all([
      supabase.from("room_moderators").select("room_id,user_id").eq("room_id", roomId),
      supabase.from("room_chat_mutes").select("user_id").eq("room_id", roomId)
    ]);
    if (modError || muteError) setError(modError?.message || muteError?.message || "Gagal memuat status moderasi.");
    else { setModerators(mods ?? []); setMutedIds((mutes ?? []).map(item => item.user_id)); }
  }, [supabase]);

  const manageModerator = async (memberId: string, makeModerator: boolean) => {
    if (!activeRoom || !supabase || userId !== activeRoom.host_id) return;
    setError("");
    const { error: actionError } = await supabase.rpc("set_room_moderator", { p_room_id: activeRoom.id, p_user_id: memberId, p_make_moderator: makeModerator });
    if (actionError) setError(actionError.message);
    else setMessage(makeModerator ? "Moderator berhasil diangkat." : "Jabatan moderator dicopot.");
    await loadModeration(activeRoom.id);
  };

  const moderateMember = async (memberId: string, action: "mute" | "unmute" | "kick") => {
    if (!activeRoom || !supabase) return;
    const person = members.find(member => member.user_id === memberId);
    const actionLabel = action === "kick" ? "dikeluarkan" : action === "mute" ? "dibisukan" : "mute dibuka";
    if (action === "kick" && !window.confirm(`Keluarkan ${person?.display_name || "anggota"} dari room?`)) return;
    setError("");
    const { error: actionError } = await supabase.rpc("moderate_room_member", { p_room_id: activeRoom.id, p_user_id: memberId, p_action: action });
    if (actionError) setError(actionError.message);
    else setMessage(`${person?.display_name || "Anggota"} berhasil ${actionLabel}.`);
    await Promise.all([loadMembers(activeRoom.id), loadSeats(activeRoom.id), loadModeration(activeRoom.id)]);
  };

  useEffect(() => {
    if (!activeRoom || !supabase) return;
    void loadMembers(activeRoom.id);
    void loadSeats(activeRoom.id);
    void loadModeration(activeRoom.id);
    const channel = supabase.channel(`room-lounge-${activeRoom.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${activeRoom.id}` }, (payload) => {
        const updated = payload.new as Room;
        if (updated?.id) setActiveRoom(current => current?.id === updated.id ? { ...current, ...updated } : current);
        void loadRooms();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "room_members", filter: `room_id=eq.${activeRoom.id}` }, (payload) => {
        void loadMembers(activeRoom.id);
        void loadRooms();
        const removed = payload.eventType === "DELETE" ? payload.old as { user_id?: string } : null;
        if (removed?.user_id === userId) {
          window.localStorage.removeItem(ACTIVE_ROOM_STORAGE_KEY);
          setActiveRoom(null);
          notifyRoomPlayback(null);
          setMessage("Kamu dikeluarkan dari room oleh pengelola.");
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "room_seats", filter: `room_id=eq.${activeRoom.id}` }, () => { void loadSeats(activeRoom.id); })
      .on("postgres_changes", { event: "*", schema: "public", table: "room_moderators", filter: `room_id=eq.${activeRoom.id}` }, () => { void loadModeration(activeRoom.id); })
      .on("postgres_changes", { event: "*", schema: "public", table: "room_chat_mutes", filter: `room_id=eq.${activeRoom.id}` }, () => { void loadModeration(activeRoom.id); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activeRoom, loadMembers, loadModeration, loadRooms, loadSeats, supabase]);

  const notifyRoomPlayback = (roomId: string | null) => {
    window.dispatchEvent(new CustomEvent("lnmusik:room", { detail: { roomId } }));
  };

  const saveName = (value: string) => {
    setDisplayName(value);
    window.localStorage.setItem("lnmusik-listener-name", value);
  };

  const createRoom = async (event: FormEvent) => {
    event.preventDefault();
    if (!displayName.trim() || !roomName.trim()) { setError("Isi nama Listener dan nama room."); return; }
    if (!supabase) { setError("Koneksi Supabase belum siap."); return; }
    setBusy(true); setError(""); setMessage("");
    const { data, error: rpcError } = await supabase.rpc("create_listening_room", { room_name: roomName.trim(), listener_name: displayName.trim() });
    if (rpcError) setError(rpcError.message);
    else {
      const created = Array.isArray(data) ? data[0] : data;
      if (created?.room_id) {
        const { data: room } = await supabase.from("rooms").select("id,code,name,host_id,max_members,is_public,created_at").eq("id", created.room_id).single();
        if (room) {
          window.localStorage.setItem(ACTIVE_ROOM_STORAGE_KEY, room.id);
          setActiveRoom(room);
          notifyRoomPlayback(room.id);
          setMessage("Room berhasil dibuat. Bagikan kode undangan ke temanmu.");
          setRoomName("");
        }
      }
      await loadRooms();
    }
    setBusy(false);
  };

  const joinRoom = async (event: FormEvent) => {
    event.preventDefault();
    if (!displayName.trim() || !roomCode.trim()) { setError("Isi nama Listener dan kode room."); return; }
    if (!supabase) { setError("Koneksi Supabase belum siap."); return; }
    setBusy(true); setError(""); setMessage("");
    const { data: joinedId, error: rpcError } = await supabase.rpc("join_listening_room", { room_code: roomCode.trim(), listener_name: displayName.trim() });
    if (rpcError) setError(rpcError.message);
    else if (joinedId) {
      const { data: room, error: roomError } = await supabase.from("rooms").select("id,code,name,host_id,max_members,is_public,created_at").eq("id", joinedId).single();
      if (roomError) setError(roomError.message);
      else if (room) {
        window.localStorage.setItem(ACTIVE_ROOM_STORAGE_KEY, room.id);
        setActiveRoom(room);
        notifyRoomPlayback(room.id);
        setMessage("Berhasil bergabung ke room.");
        setRoomCode("");
      }
    }
    setBusy(false);
  };

  const takeSeat = async (seatNumber: number) => {
    if (!activeRoom || !supabase || !userId) return;
    setError("");
    const { error: clearError } = await supabase.from("room_seats").delete().eq("room_id", activeRoom.id).eq("user_id", userId);
    if (clearError) { setError(clearError.message); return; }
    const { error: seatError } = await supabase.from("room_seats").insert({ room_id: activeRoom.id, seat_number: seatNumber, user_id: userId });
    if (seatError) setError(seatError.code === "23505" ? "Kursi itu baru saja ditempati. Pilih kursi lain." : seatError.message);
    else setMessage(`Kamu duduk di kursi ${seatNumber}.`);
    await loadSeats(activeRoom.id);
  };

  const hostSeatMember = async (memberId: string) => {
    if (!activeRoom || !supabase || userId !== activeRoom.host_id) return;
    const occupied = new Set(seats.map(seat => seat.seat_number));
    const freeSeat = Array.from({ length: 10 }, (_, i) => i + 1).find(number => !occupied.has(number));
    if (!freeSeat) { setError("Semua kursi sudah terisi."); return; }
    setError("");
    const { error: seatError } = await supabase.from("room_seats").insert({ room_id: activeRoom.id, seat_number: freeSeat, user_id: memberId });
    if (seatError) setError(seatError.code === "23505" ? "Anggota atau kursi itu baru saja ditempatkan." : seatError.message);
    else setMessage(`${members.find(member => member.user_id === memberId)?.display_name || "Listener"} dinaikkan ke kursi ${freeSeat}.`);
    await loadSeats(activeRoom.id);
  };

  const standUp = async () => {
    if (!activeRoom || !supabase || !userId) return;
    const { error: seatError } = await supabase.from("room_seats").delete().eq("room_id", activeRoom.id).eq("user_id", userId);
    if (seatError) setError(seatError.message); else setMessage("Kamu berdiri dari kursi.");
    await loadSeats(activeRoom.id);
  };

  const leaveRoom = async () => {
    if (!activeRoom || !userId || !supabase) return;
    await supabase.from("room_seats").delete().eq("room_id", activeRoom.id).eq("user_id", userId);
    const { error: leaveError } = await supabase.from("room_members").delete().eq("room_id", activeRoom.id).eq("user_id", userId);
    if (leaveError) setError(leaveError.message);
    else {
      window.localStorage.removeItem(ACTIVE_ROOM_STORAGE_KEY);
      setActiveRoom(null);
      notifyRoomPlayback(null);
      setMembers([]);
      setMessage("Kamu sudah keluar dari room.");
      await loadRooms();
    }
  };

  const saveRoomSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeRoom || !supabase || userId !== activeRoom.host_id) return;
    const cleanName = settingsName.trim();
    const maxMembers = Number(settingsMaxMembers);
    if (cleanName.length < 2 || cleanName.length > 60) { setError("Nama room harus 2–60 karakter."); return; }
    if (!Number.isInteger(maxMembers) || maxMembers < 2 || maxMembers > 10 || maxMembers < members.length) { setError(`Kapasitas harus 2–10 dan tidak boleh di bawah jumlah anggota (${members.length}).`); return; }
    setBusy(true); setError(""); setMessage("");
    const { data, error: updateError } = await supabase.from("rooms").update({ name: cleanName, is_public: settingsPublic, max_members: maxMembers }).eq("id", activeRoom.id).eq("host_id", userId).select("id,code,name,host_id,max_members,is_public,created_at").single();
    if (updateError) setError(updateError.message);
    else { setActiveRoom(data); setMessage("Pengaturan room berhasil disimpan."); setShowRoomSettings(false); void loadRooms(); }
    setBusy(false);
  };

  const copyCode = async () => {
    if (!activeRoom) return;
    try { await navigator.clipboard.writeText(activeRoom.code); setMessage("Kode room berhasil disalin."); }
    catch { setMessage(`Kode room: ${activeRoom.code}`); }
  };

  if (!supabase || !userId) return <section className="section"><div className="loading-state"><Loader2 className="spin" /> Menghubungkan Listener ke Supabase...</div>{error && <div className="notice">{error}</div>}</section>;

  if (activeRoom) {
    const isHost = userId === activeRoom.host_id;
    const isModerator = moderators.some(item => item.user_id === userId);
    const isStaff = isHost || isModerator;
    const isMuted = mutedIds.includes(userId);
    const seatedIds = new Set(seats.map(seat => seat.user_id));
    const waitingMembers = members.filter(member => !seatedIds.has(member.user_id));
    return <section className="section lounge-page">
      {error && <div className="notice">{error}</div>}
      {message && <div className="room-feedback">{message}</div>}
      <div className="active-room room-card lounge-room">
        <div className="room-top"><span className="live">● LNMUSIK LOUNGE · LIVE</span><div className="room-head-actions">{isHost && <button className="join-btn" onClick={() => { setSettingsName(activeRoom.name); setSettingsPublic(activeRoom.is_public); setSettingsMaxMembers(String(activeRoom.max_members)); setShowRoomSettings(value => !value); }}>⚙ Pengaturan</button>}<button className="join-btn" onClick={leaveRoom}><DoorOpen size={13} /> Keluar room</button></div></div>
        <h3>{activeRoom.name}</h3>
        <p>Kode undangan: <strong className="room-code">{activeRoom.code}</strong> <button className="copy-code" onClick={copyCode}><Copy size={13} /> Salin</button><span className="room-visibility">{activeRoom.is_public ? "● Publik" : "● Privat"}</span></p>
        {showRoomSettings && isHost && <form className="room-settings" onSubmit={saveRoomSettings}>
          <div className="lounge-seats-head"><strong>Pengaturan room</strong><span>Hanya host</span></div>
          <label>Nama room<input value={settingsName} maxLength={60} onChange={event => setSettingsName(event.target.value)} /></label>
          <label>Visibilitas<select value={settingsPublic ? "public" : "private"} onChange={event => setSettingsPublic(event.target.value === "public")}><option value="public">Publik · tampil di daftar room</option><option value="private">Privat · hanya lewat kode undangan</option></select></label>
          <label>Kapasitas anggota<select value={settingsMaxMembers} onChange={event => setSettingsMaxMembers(event.target.value)}>{Array.from({ length: 9 }, (_, index) => index + 2).map(value => <option key={value} value={value}>{value} orang</option>)}</select></label>
          <div className="room-settings-actions"><button type="button" className="join-btn" onClick={() => setShowRoomSettings(false)}>Batal</button><button className="primary-btn" disabled={busy}>Simpan pengaturan</button></div>
        </form>}
        <div className="member-heading"><Users size={15} /> Anggota ({members.length}/{activeRoom.max_members})</div>
        <div className="member-list">{members.map(member => <div className="member-chip" key={member.user_id}><span className="member-dot" />{member.display_name}{member.user_id === activeRoom.host_id ? <small>HOST</small> : moderators.some(item => item.user_id === member.user_id) ? <small>MOD</small> : null}</div>)}</div>
        {(isHost || isStaff) && <div className="waiting-members">
          <div className="lounge-seats-head"><strong>Panel pengelola</strong><span>{isHost ? "HOST" : "MODERATOR"}</span></div>
          <div className="waiting-list">{members.filter(member => member.user_id !== activeRoom.host_id && (isHost || !moderators.some(mod => mod.user_id === member.user_id))).map(member => {
            const isMod = moderators.some(mod => mod.user_id === member.user_id);
            const memberMuted = mutedIds.includes(member.user_id);
            return <div className="waiting-member" key={member.user_id}>
              <span>{member.display_name}{isMod ? " · Moderator" : ""}{memberMuted ? " · Dibisukan" : ""}</span>
              <div className="moderation-actions">
                {isHost && <button className="join-btn" onClick={() => void manageModerator(member.user_id, !isMod)}>{isMod ? "Copot MOD" : "Jadikan MOD"}</button>}
                <button className="join-btn" onClick={() => void moderateMember(member.user_id, memberMuted ? "unmute" : "mute")}>{memberMuted ? "Buka mute" : "Mute"}</button>
                <button className="join-btn" onClick={() => void moderateMember(member.user_id, "kick")}>Keluarkan</button>
              </div>
            </div>;
          })}</div>
        </div>}
        <div className="lounge-seats">
          <div className="lounge-seats-head"><strong>Tempat duduk</strong><span>{seats.length}/10 terisi</span></div>
          <div className="seat-grid">{Array.from({ length: 10 }, (_, index) => {
            const number = index + 1;
            const seat = seats.find(item => item.seat_number === number);
            const person = members.find(item => item.user_id === seat?.user_id);
            const mine = seat?.user_id === userId;
            return <button type="button" key={number} className={`seat-tile ${seat ? "occupied" : "empty"} ${mine ? "mine" : ""}`} disabled={!!seat && !mine} onClick={() => mine ? void standUp() : void takeSeat(number)}>
              <span className="seat-emoji">{seat ? (mine ? "😎" : "🎧") : "＋"}</span>
              <strong>{seat ? (person?.display_name || "Listener") : "Kursi kosong"}</strong>
              <small>{seat ? (mine ? "Kamu · berdiri" : `Kursi ${number}`) : `Kursi ${number} · pilih`}</small>
            </button>;
          })}</div>
          <p className="seat-hint">Pilih kursi kosong untuk duduk. Tekan kursimu lagi untuk berdiri.</p>
        </div>
        {isHost && <div className="waiting-members">
          <div className="lounge-seats-head"><strong>Anggota menunggu kursi</strong><span>{waitingMembers.length} belum duduk</span></div>
          {waitingMembers.length ? <div className="waiting-list">{waitingMembers.map(member => <div className="waiting-member" key={member.user_id}><span><i className="member-dot" />{member.display_name}{member.user_id === activeRoom.host_id ? " · Host" : ""}</span><button className="join-btn" disabled={seats.length >= 10 || member.user_id === userId} onClick={() => void hostSeatMember(member.user_id)}>Naikkan ke kursi</button></div>)}</div> : <p className="seat-hint">Semua anggota sudah mendapat kursi.</p>}
        </div>}
      </div>
      <RoomChat roomId={activeRoom.id} userId={userId} displayName={displayName} isStaff={isStaff} isMuted={isMuted} />
    </section>;
  }

  return <section className="section">
    <div className="section-head"><h2>Listening rooms</h2><span>Maksimal 10 orang per room</span></div>
    {error && <div className="notice">{error}</div>}
    {message && <div className="room-feedback">{message}</div>}
    <div className="room-forms">
      <form className="room-form room-card" onSubmit={createRoom}>
        <div className="room-form-icon"><Plus /></div><h3>Buat room baru</h3><p>Mulai sesi dengar dan undang temanmu.</p>
        <label>Nama Listener<input value={displayName} maxLength={32} onChange={e => saveName(e.target.value)} placeholder="Nama panggilan" /></label>
        <label>Nama room<input value={roomName} maxLength={60} onChange={e => setRoomName(e.target.value)} placeholder="Contoh: Late Night Sessions" /></label>
        <button className="primary-btn" disabled={busy || !roomName.trim()}><Plus size={15} /> Buat room</button>
      </form>
      <form className="room-form room-card" onSubmit={joinRoom}>
        <div className="room-form-icon"><LogIn /></div><h3>Gabung dengan kode</h3><p>Masukkan kode undangan dari temanmu.</p>
        <label>Nama Listener<input value={displayName} maxLength={32} onChange={e => saveName(e.target.value)} placeholder="Nama panggilan" /></label>
        <label>Kode room<input value={roomCode} maxLength={8} onChange={e => setRoomCode(e.target.value.toUpperCase())} placeholder="Contoh: A1B2C3D4" /></label>
        <button className="join-btn join-submit" disabled={busy || !roomCode.trim()}><LogIn size={14} /> Gabung room</button>
      </form>
    </div>
    <div className="section-head room-list-heading"><h2>Room publik</h2><span>{rooms.length} room ditemukan</span></div>
    {rooms.length ? <div className="room-grid">{rooms.map(room => <article className="room-card" key={room.id}><div className="room-top"><span className="live">● TERSEDIA</span><Radio size={16} /></div><h3>{room.name}</h3><p>Kode: {room.code}</p><div className="room-foot"><span><Users size={13} /> Room publik</span><button className="join-btn" disabled={busy} onClick={() => setRoomCode(room.code)}>Pakai kode</button></div></article>)}</div> : <div className="empty-state"><div className="empty-icon"><Radio /></div><h3>Belum ada room publik</h3><p>Buat room pertama dan undang temanmu dengan kode room.</p></div>}
  </section>;
}
