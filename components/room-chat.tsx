"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Send, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type ChatMessage = { id: string; room_id: string; user_id: string; display_name: string; content: string; message_type: "text" | "emote"; created_at: string };
const EMOTES = ["💚", "😂", "🔥", "🎧", "🫶", "✨", "🥹", "👏"];

export default function RoomChat({ roomId, userId, displayName }: { roomId: string; userId: string; displayName: string }) {
  const [supabase] = useState(() => createClient());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    const { data, error: loadError } = await supabase.from("room_chat_messages").select("id,room_id,user_id,display_name,content,message_type,created_at").eq("room_id", roomId).order("created_at", { ascending: false }).limit(60);
    if (loadError) setError(loadError.message);
    else setMessages((data ?? []).reverse() as ChatMessage[]);
  }, [roomId, supabase]);

  useEffect(() => {
    void loadMessages();
    const channel = supabase.channel("room-chat-" + roomId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "room_chat_messages", filter: "room_id=eq." + roomId }, (payload) => {
        const incoming = payload.new as ChatMessage;
        setMessages((current) => current.some((item) => item.id === incoming.id) ? current : [...current, incoming].slice(-80));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "room_chat_messages", filter: "room_id=eq." + roomId }, (payload) => {
        const old = payload.old as { id?: string };
        if (old.id) setMessages((current) => current.filter((item) => item.id !== old.id));
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadMessages, roomId, supabase]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const send = async (event: FormEvent, type: "text" | "emote" = "text", value?: string) => {
    event.preventDefault();
    const content = (value ?? draft).trim();
    if (!content || sending) return;
    setSending(true); setError("");
    const { error: sendError } = await supabase.from("room_chat_messages").insert({ room_id: roomId, user_id: userId, display_name: displayName.trim().slice(0, 32) || "Listener", content, message_type: type });
    if (sendError) setError(sendError.message);
    else if (type === "text") setDraft("");
    setSending(false);
  };

  return <section className="lounge-chat">
    <div className="lounge-chat-head"><div><MessageCircle size={16} /><strong>Ruang obrolan</strong></div><span>LIVE CHAT</span></div>
    <div className="lounge-chat-messages" ref={listRef}>
      {messages.length ? messages.map((item) => <div className={"chat-message " + (item.user_id === userId ? "mine " : "") + (item.message_type === "emote" ? "chat-emote" : "")} key={item.id}>
        {item.message_type === "emote" ? <><strong>{item.display_name}</strong><span>{item.content}</span></> : <><div className="chat-message-meta"><strong>{item.display_name}</strong><time>{new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div><p>{item.content}</p></>}
      </div>) : <div className="chat-empty">Belum ada obrolan. Sapa teman dengarmu 👋</div>}
    </div>
    {error && <p className="chat-error">{error}</p>}
    <div className="lounge-emotes">{EMOTES.map((emoji) => <button type="button" key={emoji} disabled={sending} onClick={(event) => void send(event, "emote", emoji)} aria-label={"Kirim " + emoji}>{emoji}</button>)}</div>
    <form className="lounge-chat-form" onSubmit={(event) => void send(event)}>
      <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={500} placeholder="Tulis sesuatu ke room..." aria-label="Pesan chat" />
      <button type="submit" disabled={!draft.trim() || sending} aria-label="Kirim pesan"><Send size={16} /></button>
    </form>
  </section>;
}
