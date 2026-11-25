-- LNMUSIK: grant SQL privileges required by the authenticated Supabase client.
-- RLS policies still control which rows each Listener may access.
grant usage on schema public to authenticated;

grant select on table public.rooms to authenticated;

grant select, delete on table public.room_members to authenticated;

grant select, insert, update, delete on table public.room_queue to authenticated;

grant select, insert, update, delete on table public.room_playback to authenticated;

-- Allow authenticated clients to receive realtime change events for room membership.
do $$
begin
  alter publication supabase_realtime add table public.room_members;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
