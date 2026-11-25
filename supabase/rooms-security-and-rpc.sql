-- LNMUSIK secure room RPCs and non-recursive RLS helpers
create or replace function public.is_room_member(target_room uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_members
    where room_id = target_room and user_id = auth.uid()
  );
$$;

revoke all on function public.is_room_member(uuid) from public;
grant execute on function public.is_room_member(uuid) to authenticated;

drop policy if exists "Members can view rooms" on public.rooms;
create policy "Members can view rooms" on public.rooms
for select to authenticated
using (is_public or host_id = auth.uid() or public.is_room_member(id));

drop policy if exists "Room members can view members" on public.room_members;
create policy "Room members can view members" on public.room_members
for select to authenticated
using (user_id = auth.uid() or public.is_room_member(room_id));

drop policy if exists "Users join as themselves" on public.room_members;
create policy "Users join as themselves" on public.room_members
for insert to authenticated with check (false);

drop policy if exists "Room members view queue" on public.room_queue;
create policy "Room members view queue" on public.room_queue
for select to authenticated using (public.is_room_member(room_id));

drop policy if exists "Room members add queue items" on public.room_queue;
create policy "Room members add queue items" on public.room_queue
for insert to authenticated with check (added_by = auth.uid() and public.is_room_member(room_id));

drop policy if exists "Room members manage queue" on public.room_queue;
create policy "Room members manage queue" on public.room_queue
for update to authenticated using (public.is_room_member(room_id))
with check (public.is_room_member(room_id));

drop policy if exists "Room members remove queue items" on public.room_queue;
create policy "Room members remove queue items" on public.room_queue
for delete to authenticated using (public.is_room_member(room_id));

drop policy if exists "Room members view playback" on public.room_playback;
create policy "Room members view playback" on public.room_playback
for select to authenticated using (public.is_room_member(room_id));

drop policy if exists "Room members update playback" on public.room_playback;
create policy "Room members update playback" on public.room_playback
for all to authenticated using (public.is_room_member(room_id))
with check (public.is_room_member(room_id));

create or replace function public.create_listening_room(room_name text, listener_name text)
returns table(room_id uuid, room_code text)
language plpgsql security definer
set search_path = public
as $$
declare
  new_room_id uuid;
  new_code text;
  clean_name text := trim(room_name);
  clean_listener text := trim(listener_name);
begin
  if auth.uid() is null then raise exception 'Silakan masuk sebagai Listener terlebih dahulu.'; end if;
  if char_length(clean_name) < 2 or char_length(clean_name) > 60 then raise exception 'Nama room harus 2–60 karakter.'; end if;
  if char_length(clean_listener) < 1 or char_length(clean_listener) > 32 then raise exception 'Nama Listener harus 1–32 karakter.'; end if;
  new_code := upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 8));
  insert into public.rooms(code, name, host_id, is_public, max_members)
  values (new_code, clean_name, auth.uid(), true, 10)
  returning id into new_room_id;
  insert into public.room_members(room_id, user_id, display_name)
  values (new_room_id, auth.uid(), clean_listener);
  return query select new_room_id, new_code;
end;
$$;

create or replace function public.join_listening_room(room_code text, listener_name text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  target public.rooms%rowtype;
  member_count integer;
begin
  if auth.uid() is null then raise exception 'Silakan masuk sebagai Listener terlebih dahulu.'; end if;
  if char_length(trim(listener_name)) < 1 or char_length(trim(listener_name)) > 32 then raise exception 'Nama Listener harus 1–32 karakter.'; end if;
  select * into target from public.rooms r
  where upper(r.code) = upper(trim(room_code)) and r.is_public = true
  for update;
  if target.id is null then raise exception 'Kode room tidak ditemukan.'; end if;
  if exists(select 1 from public.room_members m where m.room_id = target.id and m.user_id = auth.uid()) then
    return target.id;
  end if;
  select count(*) into member_count from public.room_members m where m.room_id = target.id;
  if member_count >= target.max_members then raise exception 'Room sudah penuh.'; end if;
  insert into public.room_members(room_id, user_id, display_name)
  values(target.id, auth.uid(), trim(listener_name));
  return target.id;
end;
$$;

grant execute on function public.create_listening_room(text, text) to authenticated;
grant execute on function public.join_listening_room(text, text) to authenticated;
