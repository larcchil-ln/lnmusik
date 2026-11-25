-- LNMUSIK fix: generate room codes without pgcrypto.gen_random_bytes().
-- On some Supabase projects pgcrypto functions are installed in the extensions
-- schema, so an unqualified gen_random_bytes() call cannot be resolved.
create or replace function public.create_listening_room(room_name text, listener_name text)
returns table(room_id uuid, room_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_room_id uuid;
  new_code text;
  clean_name text := trim(room_name);
  clean_listener text := trim(listener_name);
begin
  if auth.uid() is null then
    raise exception 'Silakan masuk sebagai Listener terlebih dahulu.';
  end if;

  if char_length(clean_name) < 2 or char_length(clean_name) > 60 then
    raise exception 'Nama room harus 2–60 karakter.';
  end if;

  if char_length(clean_listener) < 1 or char_length(clean_listener) > 32 then
    raise exception 'Nama Listener harus 1–32 karakter.';
  end if;

  -- gen_random_uuid() is built into supported PostgreSQL versions.
  new_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.rooms(code, name, host_id, is_public, max_members)
  values (new_code, clean_name, auth.uid(), true, 10)
  returning id into new_room_id;

  insert into public.room_members(room_id, user_id, display_name)
  values (new_room_id, auth.uid(), clean_listener);

  return query select new_room_id, new_code;
end;
$$;

revoke all on function public.create_listening_room(text, text) from public, anon;
grant execute on function public.create_listening_room(text, text) to authenticated;
