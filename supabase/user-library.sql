-- Personal library: liked songs and listening history per (anonymous) user.
create table if not exists public.user_library (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('liked', 'history')),
  video_id text not null,
  title text not null default '',
  channel_title text not null default '',
  thumbnail text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, kind, video_id)
);

create index if not exists user_library_recent_idx on public.user_library (user_id, kind, created_at desc);

alter table public.user_library enable row level security;

drop policy if exists "user_library_select_own" on public.user_library;
create policy "user_library_select_own" on public.user_library for select using (auth.uid() = user_id);

drop policy if exists "user_library_insert_own" on public.user_library;
create policy "user_library_insert_own" on public.user_library for insert with check (auth.uid() = user_id);

drop policy if exists "user_library_update_own" on public.user_library;
create policy "user_library_update_own" on public.user_library for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_library_delete_own" on public.user_library;
create policy "user_library_delete_own" on public.user_library for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_library to authenticated;
