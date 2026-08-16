-- Multi-crew support.
-- 0013 added a trigger enforcing one group per user; the redesign's crew switcher
-- requires dropping it. profiles.active_group_id records which crew the Crew tab opens on.

drop trigger if exists trg_enforce_single_group on group_members;
drop function if exists enforce_single_group();

alter table profiles
  add column if not exists active_group_id uuid references groups(id) on delete set null;

-- Keep active_group_id pointing at a crew the user is actually in.
create or replace function sync_active_group_on_join() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles
     set active_group_id = new.group_id
   where id = new.user_id
     and active_group_id is null;
  return new;
end;
$$;

drop trigger if exists trg_sync_active_group_join on group_members;
create trigger trg_sync_active_group_join
  after insert on group_members
  for each row execute function sync_active_group_on_join();

create or replace function sync_active_group_on_leave() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles p
     set active_group_id = (
       select gm.group_id from group_members gm
        where gm.user_id = old.user_id
        order by gm.joined_at
        limit 1
     )
   where p.id = old.user_id
     and p.active_group_id = old.group_id;
  return old;
end;
$$;

drop trigger if exists trg_sync_active_group_leave on group_members;
create trigger trg_sync_active_group_leave
  after delete on group_members
  for each row execute function sync_active_group_on_leave();

-- Backfill for users who already have exactly one crew.
update profiles p set active_group_id = (
  select gm.group_id from group_members gm
   where gm.user_id = p.id
   order by gm.joined_at
   limit 1
)
where p.active_group_id is null;

-- Explicit setter for the crew switcher (validates membership).
create or replace function set_active_group(p_group_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_group_id is not null and not exists (
    select 1 from group_members where group_id = p_group_id and user_id = auth.uid()
  ) then
    raise exception 'not a member of this group';
  end if;
  update profiles set active_group_id = p_group_id where id = auth.uid();
end;
$$;
