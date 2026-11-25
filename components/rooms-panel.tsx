"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Copy, Loader2, Plus, Radio, Users, LogIn, DoorOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Room = { id: string; code: string; name: string; host_id: string; max_members: number; created_at: string };
type Member = { user_id: string; display_name: string; joined_at: string };

export default function RoomsPanel() {
  const [supabase, setSupabase] = useState<ReturnType<typeof createClient> | null>(null);
  const [userId, setUserId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roomName, setRoomName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadRooms = useCallback(async () => {
    if (!supabase) return;
    const { data, error: loadError } = await supabase.from("rooms").select("id,code,name,host_id,max_members,created_at").eq("is_public", true).order("created_at", { ascending: false }).limit(30);
    if (loadError) setError(loadError.message);
    else setRooms(data ?? []);
  }, [supabase]);

  const loadMembers = useCallback(async (roomId: string) => {
    if (!supabase) return;
    const { data, error: memberError } = await supabase.from("room_members").select("user_id,display_name,joined_at").eq("room_id", roomId).order("joined_at");
    if (memberError) setError(memberError.message);
    else setMembers(data ?? []);
  }, [supabase]);

  useEffect(() => {
    let alive = true;
    try {
      setSupabase(createClient());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Konfigurasi Supabase tidak valid.");
    }
    return () => { alive = false; };
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

  useEffect(() => {
    if (!activeRoom || !supabase) return;
    void loadMembers(activeRoom.id);
    const channel = supabase.channel(`room-members-${activeRoom.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_members", filter: `room_id=eq.${activeRoom.id}` }, () => { void loadMembers(activeRoom.id); void loadRooms(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activeRoom, loadMembers, loadRooms, supabase]);

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
        const { data: room } = await supabase.from("rooms").select("id,code,name,host_id,max_members,created_at").eq("id", created.room_id).single();
        if (room) { setActiveRoom(room); setMessage("Room berhasil dibuat. Bagikan kode undangan ke temanmu."); setRoomName(""); }
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
      const { data: room, error: roomError } = await supabase.from("rooms").select("id,code,name,host_id,max_members,created_at").eq("id", joinedId).single();
      if (roomError) setError(roomError.message);
      else if (room) { setActiveRoom(room); setMessage("Berhasil bergabung ke room."); setRoomCode(""); }
    }
    setBusy(false);
  };

  const leaveRoom = async () => {
    if (!activeRoom || !userId || !supabase) return;
    const { error: leaveError } = await supabase.from("room_members").delete().eq("room_id", activeRoom.id).eq("user_id", userId);
    if (leaveError) setError(leaveError.message);
    else { setActiveRoom(null); setMembers([]); setMessage("Kamu sudah keluar dari room."); await loadRooms(); }
  };

  const copyCode = async () => {
    if (!activeRoom) return;
    try { await navigator.clipboard.writeText(activeRoom.code); setMessage("Kode room berhasil disalin."); }
    catch { setMessage(`Kode room: ${activeRoom.code}`); }
  };

  if (!supabase || !userId) return <section className="section"><div className="loading-state"><Loader2 className="spin" /> Menghubungkan Listener ke Supabase...</div>{error && <div className="notice">{error}</div>}</section>;

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
    {activeRoom && <div className="active-room room-card">
      <div className="room-top"><span className="live">● ROOM AKTIF</span><button className="join-btn" onClick={leaveRoom}><DoorOpen size={13} /> Keluar</button></div>
      <h3>{activeRoom.name}</h3><p>Kode undangan: <strong className="room-code">{activeRoom.code}</strong> <button className="copy-code" onClick={copyCode}><Copy size={13} /> Salin</button></p>
      <div className="member-heading"><Users size={15} /> Anggota ({members.length}/{activeRoom.max_members})</div>
      <div className="member-list">{members.map(member => <div className="member-chip" key={member.user_id}><span className="member-dot" />{member.display_name}{member.user_id === activeRoom.host_id ? <small>HOST</small> : null}</div>)}</div>
    </div>}
    <div className="section-head room-list-heading"><h2>Room publik</h2><span>{rooms.length} room ditemukan</span></div>
    {rooms.length ? <div className="room-grid">{rooms.map(room => <article className="room-card" key={room.id}><div className="room-top"><span className="live">● TERSEDIA</span><Radio size={16} /></div><h3>{room.name}</h3><p>Kode: {room.code}</p><div className="room-foot"><span><Users size={13} /> Room publik</span><button className="join-btn" disabled={busy || room.id === activeRoom?.id} onClick={() => setRoomCode(room.code)}>Pakai kode</button></div></article>)}</div> : <div className="empty-state"><div className="empty-icon"><Radio /></div><h3>Belum ada room publik</h3><p>Buat room pertama dan undang temanmu dengan kode room.</p></div>}
  </section>;
}
