-- LNMUSIK Lounge: realtime message reactions
create table if not exists public.room_chat_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.room_chat_messages(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('💚','😂','🔥','🎧','🫶','✨','🥹','👏')),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);
create index if not exists room_chat_reactions_message_idx on public.room_chat_reactions(message_id);
alter table public.room_chat_reactions enable row level security;

drop policy if exists "Room members read chat reactions" on public.room_chat_reactions;
create policy "Room members read chat reactions" on public.room_chat_reactions
for select to authenticated using (
  exists (select 1 from public.room_members m where m.room_id=room_chat_reactions.room_id and m.user_id=auth.uid())
);

drop policy if exists "Room members add own chat reactions" on public.room_chat_reactions;
create policy "Room members add own chat reactions" on public.room_chat_reactions
for insert to authenticated with check (
  user_id=auth.uid()
  and exists (select 1 from public.room_members m where m.room_id=room_chat_reactions.room_id and m.user_id=auth.uid())
  and exists (select 1 from public.room_chat_messages c where c.id=room_chat_reactions.message_id and c.room_id=room_chat_reactions.room_id)
  and not exists (select 1 from public.room_chat_mutes x where x.room_id=room_chat_reactions.room_id and x.user_id=auth.uid())
);

drop policy if exists "Members remove own chat reactions" on public.room_chat_reactions;
create policy "Members remove own chat reactions" on public.room_chat_reactions
for delete to authenticated using (user_id=auth.uid());

grant select, insert, delete on public.room_chat_reactions to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.room_chat_reactions;
exception when duplicate_object then null; when undefined_object then null;
end $$;
