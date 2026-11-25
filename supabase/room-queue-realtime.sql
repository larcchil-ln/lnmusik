-- Enable realtime changes for the shared listening-room queue.
-- Run this once in Supabase SQL Editor after the base room schema.
alter table public.room_queue replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.room_queue;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

grant select, insert, update, delete on table public.room_queue to authenticated;
