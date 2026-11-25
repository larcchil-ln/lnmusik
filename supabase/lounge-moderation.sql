-- LNMUSIK Lounge: Host & Moderator controls
-- Run after lounge-chat.sql and lounge-seats.sql in Supabase SQL Editor.

create table if not exists public.room_moderators (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  appointed_by uuid not null references auth.users(id),
  appointed_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.room_chat_mutes (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  muted_by uuid not null references auth.users(id),
  muted_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

alter table public.room_moderators enable row level security;
alter table public.room_chat_mutes enable row level security;

drop policy if exists "Room members view moderators" on public.room_moderators;
create policy "Room members view moderators" on public.room_moderators
for select to authenticated using (
  exists (select 1 from public.room_members m where m.room_id=room_moderators.room_id and m.user_id=auth.uid())
);

drop policy if exists "Room members view chat mutes" on public.room_chat_mutes;
create policy "Room members view chat mutes" on public.room_chat_mutes
for select to authenticated using (
  exists (select 1 from public.room_members m where m.room_id=room_chat_mutes.room_id and m.user_id=auth.uid())
);

grant select on public.room_moderators, public.room_chat_mutes to authenticated;

-- Only the room host can appoint or remove moderators.
create or replace function public.set_room_moderator(p_room_id uuid, p_user_id uuid, p_make_moderator boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_host uuid;
begin
  select host_id into v_host from public.rooms where id=p_room_id;
  if v_host is null or v_host <> auth.uid() then raise exception 'Hanya host yang dapat mengatur moderator.'; end if;
  if p_user_id = v_host then raise exception 'Host tidak perlu dijadikan moderator.'; end if;
  if not exists (select 1 from public.room_members where room_id=p_room_id and user_id=p_user_id) then
    raise exception 'Anggota tidak ditemukan di room ini.';
  end if;
  if p_make_moderator then
    insert into public.room_moderators(room_id,user_id,appointed_by)
    values (p_room_id,p_user_id,auth.uid())
    on conflict (room_id,user_id) do nothing;
  else
    delete from public.room_moderators where room_id=p_room_id and user_id=p_user_id;
  end if;
end;
$$;

-- Host has full member moderation. Moderators can act only on ordinary members.
create or replace function public.moderate_room_member(p_room_id uuid, p_user_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_host uuid; v_is_host boolean; v_is_mod boolean; v_target_mod boolean;
begin
  select host_id into v_host from public.rooms where id=p_room_id;
  v_is_host := v_host = auth.uid();
  select exists(select 1 from public.room_moderators where room_id=p_room_id and user_id=auth.uid()) into v_is_mod;
  if not v_is_host and not v_is_mod then raise exception 'Kamu tidak punya izin moderasi.'; end if;
  if p_user_id = v_host then raise exception 'Host tidak dapat dimoderasi.'; end if;
  select exists(select 1 from public.room_moderators where room_id=p_room_id and user_id=p_user_id) into v_target_mod;
  if v_target_mod and not v_is_host then raise exception 'Moderator hanya dapat mengatur anggota biasa.'; end if;
  if not exists(select 1 from public.room_members where room_id=p_room_id and user_id=p_user_id) then
    raise exception 'Anggota tidak ditemukan di room ini.';
  end if;
  if p_action = 'mute' then
    insert into public.room_chat_mutes(room_id,user_id,muted_by)
    values(p_room_id,p_user_id,auth.uid())
    on conflict(room_id,user_id) do update set muted_by=excluded.muted_by, muted_at=now();
  elsif p_action = 'unmute' then
    delete from public.room_chat_mutes where room_id=p_room_id and user_id=p_user_id;
  elsif p_action = 'kick' then
    delete from public.room_seats where room_id=p_room_id and user_id=p_user_id;
    delete from public.room_chat_mutes where room_id=p_room_id and user_id=p_user_id;
    delete from public.room_moderators where room_id=p_room_id and user_id=p_user_id;
    delete from public.room_members where room_id=p_room_id and user_id=p_user_id;
  else
    raise exception 'Aksi moderasi tidak dikenal.';
  end if;
end;
$$;

-- Host/moderator may delete any message in their room.
create or replace function public.delete_room_chat_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_room_id uuid; v_author uuid; v_is_staff boolean;
begin
  select room_id,user_id into v_room_id,v_author from public.room_chat_messages where id=p_message_id;
  if v_room_id is null then return; end if;
  select (r.host_id=auth.uid()) or exists(
    select 1 from public.room_moderators rm where rm.room_id=v_room_id and rm.user_id=auth.uid()
  ) into v_is_staff from public.rooms r where r.id=v_room_id;
  if v_author <> auth.uid() and not coalesce(v_is_staff,false) then
    raise exception 'Kamu tidak punya izin menghapus pesan ini.';
  end if;
  delete from public.room_chat_messages where id=p_message_id;
end;
$$;

-- Replace the chat insert policy so muted members cannot send messages or emotes.
drop policy if exists "Room members send chat" on public.room_chat_messages;
create policy "Room members send chat" on public.room_chat_messages
for insert to authenticated with check (
  user_id=auth.uid()
  and exists (select 1 from public.room_members m where m.room_id=room_chat_messages.room_id and m.user_id=auth.uid())
  and not exists (select 1 from public.room_chat_mutes x where x.room_id=room_chat_messages.room_id and x.user_id=auth.uid())
);

-- Preserve self-delete while allowing staff moderation via the RPC above.
grant execute on function public.set_room_moderator(uuid,uuid,boolean) to authenticated;
grant execute on function public.moderate_room_member(uuid,uuid,text) to authenticated;
grant execute on function public.delete_room_chat_message(uuid) to authenticated;
