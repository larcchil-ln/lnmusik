"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Send, MessageCircle, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type ChatMessage = { id: string; room_id: string; user_id: string; display_name: string; content: string; message_type: "text" | "emote"; created_at: string };
type ChatReaction = { id: string; message_id: string; room_id: string; user_id: string; emoji: string };
type FloatingEmote = { id: number; emoji: string; name: string };
const EMOTES = ["💚", "😂", "🔥", "🎧", "🫶", "✨", "🥹", "👏"];

export default function RoomChat({ roomId, userId, displayName, isStaff, isMuted }: { roomId: string; userId: string; displayName: string; isStaff: boolean; isMuted: boolean }) {
  const [supabase] = useState(() => createClient());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<ChatReaction[]>([]);
  const [floatingEmotes, setFloatingEmotes] = useState<FloatingEmote[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const floatingId = useRef(0);

  const addFloatingEmote = useCallback((emoji: string, name: string) => {
    const id = ++floatingId.current;
    setFloatingEmotes((current) => [...current.slice(-7), { id, emoji, name }]);
    window.setTimeout(() => setFloatingEmotes((current) => current.filter((item) => item.id !== id)), 2800);
  }, []);

  const loadMessages = useCallback(async () => {
    const { data, error: loadError } = await supabase.from("room_chat_messages").select("id,room_id,user_id,display_name,content,message_type,created_at").eq("room_id", roomId).order("created_at", { ascending: false }).limit(60);
    if (loadError) setError(loadError.message);
    else setMessages((data ?? []).reverse() as ChatMessage[]);
  }, [roomId, supabase]);

  const loadReactions = useCallback(async () => {
    const { data, error: reactionError } = await supabase.from("room_chat_reactions").select("id,message_id,room_id,user_id,emoji").eq("room_id", roomId);
    if (reactionError) setError(reactionError.message);
    else setReactions((data ?? []) as ChatReaction[]);
  }, [roomId, supabase]);

  useEffect(() => {
    void loadMessages();
    void loadReactions();
    const channel = supabase.channel("room-chat-" + roomId, { config: { presence: { key: userId } } })
      .on("presence", { event: "sync" }, () => { setOnlineCount(Object.keys(channel.presenceState()).length); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "room_chat_messages", filter: "room_id=eq." + roomId }, (payload) => {
        const incoming = payload.new as ChatMessage;
        setMessages((current) => current.some((item) => item.id === incoming.id) ? current : [...current, incoming].slice(-80));
        if (incoming.message_type === "emote") addFloatingEmote(incoming.content, incoming.display_name);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "room_chat_messages", filter: "room_id=eq." + roomId }, (payload) => {
        const old = payload.old as { id?: string };
        if (old.id) {
          setMessages((current) => current.filter((item) => item.id !== old.id));
          setReactions((current) => current.filter((item) => item.message_id !== old.id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "room_chat_reactions", filter: "room_id=eq." + roomId }, () => { void loadReactions(); })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ display_name: displayName, online_at: new Date().toISOString() });
        }
      });
    return () => { void supabase.removeChannel(channel); };
  }, [addFloatingEmote, displayName, loadMessages, loadReactions, roomId, supabase, userId]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const deleteMessage = async (messageId: string) => {
    setError("");
    const { error: deleteError } = await supabase.rpc("delete_room_chat_message", { p_message_id: messageId });
    if (deleteError) setError(deleteError.message);
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (isMuted) return;
    setError("");
    const existing = reactions.find((item) => item.message_id === messageId && item.user_id === userId && item.emoji === emoji);
    const result = existing
      ? await supabase.from("room_chat_reactions").delete().eq("id", existing.id)
      : await supabase.from("room_chat_reactions").insert({ message_id: messageId, room_id: roomId, user_id: userId, emoji });
    if (result.error) setError(result.error.message);
    else await loadReactions();
  };

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
    <div className="lounge-chat-head"><div><MessageCircle size={16} /><strong>Ruang obrolan</strong></div><span><i className="chat-live-dot" /> {onlineCount} ONLINE · LIVE CHAT</span></div>
    <div className="lounge-chat-messages" ref={listRef}>
      {messages.length ? messages.map((item) => {
        const messageReactions = EMOTES.map((emoji) => {
          const matching = reactions.filter((reaction) => reaction.message_id === item.id && reaction.emoji === emoji);
          return { emoji, count: matching.length, mine: matching.some((reaction) => reaction.user_id === userId) };
        }).filter((reaction) => reaction.count > 0);
        return <div className={"chat-message " + (item.user_id === userId ? "mine " : "") + (item.message_type === "emote" ? "chat-emote" : "")} key={item.id}>
          <div className="chat-message-body">
            {item.message_type === "emote" ? <><strong>{item.display_name}</strong><span>{item.content}</span></> : <><div className="chat-message-meta"><strong>{item.display_name}</strong><time>{new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div><p>{item.content}</p></>}
            {item.message_type === "text" && <div className="message-reactions">
              {messageReactions.map((reaction) => <button type="button" key={reaction.emoji} className={reaction.mine ? "active" : ""} onClick={() => void toggleReaction(item.id, reaction.emoji)}>{reaction.emoji} {reaction.count}</button>)}
              {!isMuted && <div className="reaction-picker">{EMOTES.slice(0, 5).map((emoji) => <button type="button" key={emoji} aria-label={"Reaksi " + emoji} onClick={() => void toggleReaction(item.id, emoji)}>{emoji}</button>)}</div>}
            </div>}
          </div>
          {(isStaff || item.user_id === userId) && <button type="button" className="chat-delete" onClick={() => void deleteMessage(item.id)} aria-label="Hapus pesan"><Trash2 size={13} /></button>}
        </div>;
      }) : <div className="chat-empty">Belum ada obrolan. Sapa teman dengarmu 👋</div>}
    </div>
    <div className="floating-emote-layer" aria-live="polite" aria-atomic="false">
      {floatingEmotes.map((item) => <div className="floating-emote" key={item.id}><span>{item.emoji}</span><small>{item.name}</small></div>)}
    </div>
    {error && <p className="chat-error">{error}</p>}
    {isMuted ? <p className="chat-muted-notice">Kamu sedang dibisukan oleh pengelola room.</p> : <>
      <div className="lounge-emotes">{EMOTES.map((emoji) => <button type="button" key={emoji} disabled={sending} onClick={(event) => void send(event, "emote", emoji)} aria-label={"Kirim " + emoji}>{emoji}</button>)}</div>
      <form className="lounge-chat-form" onSubmit={(event) => void send(event)}>
        <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={500} placeholder="Tulis sesuatu ke room..." aria-label="Pesan chat" />
        <button type="submit" disabled={!draft.trim() || sending} aria-label="Kirim pesan"><Send size={16} /></button>
      </form>
    </>}
  </section>;
}
