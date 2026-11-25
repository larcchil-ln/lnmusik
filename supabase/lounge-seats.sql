-- LNMUSIK Lounge: virtual seating
create table if not exists public.room_seats (
  room_id uuid not null references public.rooms(id) on delete cascade,
  seat_number integer not null check (seat_number between 1 and 10),
  user_id uuid not null references auth.users(id) on delete cascade,
  seated_at timestamptz not null default now(),
  primary key (room_id, seat_number),
  unique (room_id, user_id)
);

alter table public.room_seats enable row level security;

drop policy if exists "Room members view seats" on public.room_seats;
create policy "Room members view seats" on public.room_seats
for select to authenticated using (
  exists (select 1 from public.room_members m where m.room_id=room_seats.room_id and m.user_id=auth.uid())
);

drop policy if exists "Members take own empty seat" on public.room_seats;
drop policy if exists "Members and host assign seats" on public.room_seats;
create policy "Members and host assign seats" on public.room_seats
for insert to authenticated with check (
  exists (
    select 1 from public.room_members m
    where m.room_id=room_seats.room_id and m.user_id=room_seats.user_id
  )
  and (
    user_id=auth.uid()
    or exists (
      select 1 from public.rooms r
      where r.id=room_seats.room_id and r.host_id=auth.uid()
    )
  )
);

drop policy if exists "Members move or leave own seat" on public.room_seats;
drop policy if exists "Members and host manage seats" on public.room_seats;
create policy "Members and host manage seats" on public.room_seats
for delete to authenticated using (
  user_id=auth.uid()
  or exists (
    select 1 from public.rooms r
    where r.id=room_seats.room_id and r.host_id=auth.uid()
  )
);

grant select, insert, delete on public.room_seats to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.room_seats;
exception when duplicate_object then null; when undefined_object then null;
end $$;
