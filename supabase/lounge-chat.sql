-- LNMUSIK Lounge: realtime chat and emote feed
create table if not exists public.room_chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 32),
  content text not null check (char_length(content) between 1 and 500),
  message_type text not null default 'text' check (message_type in ('text','emote')),
  created_at timestamptz not null default now()
);
create index if not exists room_chat_messages_room_created_idx on public.room_chat_messages(room_id, created_at);
alter table public.room_chat_messages enable row level security;
drop policy if exists "Room members read chat" on public.room_chat_messages;
create policy "Room members read chat" on public.room_chat_messages for select to authenticated using (
  exists (select 1 from public.room_members m where m.room_id=room_chat_messages.room_id and m.user_id=auth.uid())
);
drop policy if exists "Room members send chat" on public.room_chat_messages;
create policy "Room members send chat" on public.room_chat_messages for insert to authenticated with check (
  user_id=auth.uid() and exists (select 1 from public.room_members m where m.room_id=room_chat_messages.room_id and m.user_id=auth.uid())
);
drop policy if exists "Authors delete own chat" on public.room_chat_messages;
create policy "Authors delete own chat" on public.room_chat_messages for delete to authenticated using (user_id=auth.uid());
grant select, insert, delete on public.room_chat_messages to authenticated;
do $$
begin
  alter publication supabase_realtime add table public.room_chat_messages;
exception when duplicate_object then null; when undefined_object then null;
end $$;
