-- LNMUSIK: live room presence and stale-member cleanup
alter table public.room_members
  add column if not exists last_seen_at timestamptz not null default now();

create index if not exists room_members_last_seen_idx
  on public.room_members(last_seen_at);

create or replace function public.cleanup_stale_room_members()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed_count integer;
begin
  delete from public.room_seats s
  where exists (
    select 1 from public.room_members m
    where m.room_id = s.room_id
      and m.user_id = s.user_id
      and m.last_seen_at < now() - interval '90 seconds'
  );

  delete from public.room_members
  where last_seen_at < now() - interval '90 seconds';

  get diagnostics removed_count = row_count;
  return removed_count;
end;
$$;

drop policy if exists "Users heartbeat own room membership" on public.room_members;\ncreate policy "Users heartbeat own room membership" on public.room_members\nfor update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());\n\ngrant execute on function public.cleanup_stale_room_members() to authenticated;
grant update (last_seen_at) on public.room_members to authenticated;

create or replace function public.get_active_public_room_ids()
returns table(room_id uuid)
language sql
security definer
set search_path = public
as $$
  select r.id
  from public.rooms r
  where r.is_public = true
    and exists (
      select 1 from public.room_members m
      where m.room_id = r.id
        and m.last_seen_at >= now() - interval '90 seconds'
    );
$$;

grant execute on function public.get_active_public_room_ids() to authenticated;
