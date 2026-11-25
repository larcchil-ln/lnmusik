-- LNMUSIK listening room schema
-- Run this script in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null check (char_length(name) between 2 and 60),
  host_id uuid not null references auth.users(id) on delete cascade,
  is_public boolean not null default true,
  max_members integer not null default 10 check (max_members between 2 and 10),
  created_at timestamptz not null default now()
);

create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 32),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.room_queue (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  video_id text not null,
  title text not null,
  channel_title text not null default '',
  thumbnail text not null default '',
  position integer not null default 0,
  added_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.room_playback (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  video_id text,
  title text,
  channel_title text,
  thumbnail text,
  is_playing boolean not null default false,
  position_seconds double precision not null default 0 check (position_seconds >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists room_members_user_id_idx on public.room_members(user_id);
create index if not exists room_queue_room_position_idx on public.room_queue(room_id, position);

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_queue enable row level security;
alter table public.room_playback enable row level security;

drop policy if exists "Members can view rooms" on public.rooms;
create policy "Members can view rooms" on public.rooms
for select to authenticated
using (is_public or host_id = auth.uid() or exists (
  select 1 from public.room_members m where m.room_id = rooms.id and m.user_id = auth.uid()
));

drop policy if exists "Authenticated users create own rooms" on public.rooms;
create policy "Authenticated users create own rooms" on public.rooms
for insert to authenticated with check (host_id = auth.uid());

drop policy if exists "Hosts update own rooms" on public.rooms;
create policy "Hosts update own rooms" on public.rooms
for update to authenticated using (host_id = auth.uid()) with check (host_id = auth.uid());

drop policy if exists "Hosts delete own rooms" on public.rooms;
create policy "Hosts delete own rooms" on public.rooms
for delete to authenticated using (host_id = auth.uid());

drop policy if exists "Room members can view members" on public.room_members;
create policy "Room members can view members" on public.room_members
for select to authenticated using (
  user_id = auth.uid() or exists (
    select 1 from public.room_members mine where mine.room_id = room_members.room_id and mine.user_id = auth.uid()
  ) or exists (
    select 1 from public.rooms r where r.id = room_members.room_id and r.host_id = auth.uid()
  )
);

drop policy if exists "Users join as themselves" on public.room_members;
create policy "Users join as themselves" on public.room_members
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "Users leave themselves" on public.room_members;
create policy "Users leave themselves" on public.room_members
for delete to authenticated using (user_id = auth.uid());

drop policy if exists "Room members view queue" on public.room_queue;
create policy "Room members view queue" on public.room_queue
for select to authenticated using (exists (
  select 1 from public.room_members m where m.room_id = room_queue.room_id and m.user_id = auth.uid()
));

drop policy if exists "Room members add queue items" on public.room_queue;
create policy "Room members add queue items" on public.room_queue
for insert to authenticated with check (
  added_by = auth.uid() and exists (
    select 1 from public.room_members m where m.room_id = room_queue.room_id and m.user_id = auth.uid()
  )
);

drop policy if exists "Room members manage queue" on public.room_queue;
create policy "Room members manage queue" on public.room_queue
for update to authenticated using (exists (
  select 1 from public.room_members m where m.room_id = room_queue.room_id and m.user_id = auth.uid()
));

drop policy if exists "Room members remove queue items" on public.room_queue;
create policy "Room members remove queue items" on public.room_queue
for delete to authenticated using (exists (
  select 1 from public.room_members m where m.room_id = room_queue.room_id and m.user_id = auth.uid()
));

drop policy if exists "Room members view playback" on public.room_playback;
create policy "Room members view playback" on public.room_playback
for select to authenticated using (exists (
  select 1 from public.room_members m where m.room_id = room_playback.room_id and m.user_id = auth.uid()
));

drop policy if exists "Room members update playback" on public.room_playback;
create policy "Room members update playback" on public.room_playback
for all to authenticated using (exists (
  select 1 from public.room_members m where m.room_id = room_playback.room_id and m.user_id = auth.uid()
)) with check (exists (
  select 1 from public.room_members m where m.room_id = room_playback.room_id and m.user_id = auth.uid()
));
