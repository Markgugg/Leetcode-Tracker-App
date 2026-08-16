-- Open-crew discovery: the "OPEN CREWS NEAR YOUR LEVEL" list in onboarding step 3.

alter table groups
  add column if not exists is_open boolean not null default false;

create index if not exists groups_is_open_idx on groups (is_open) where is_open;

-- Non-members must be able to see an open crew's row to join it. Members keep the
-- existing is_group_member() policy from 0007; this only widens SELECT to open crews.
do $$ begin
  if not exists (select 1 from pg_policies where tablename='groups' and policyname='open groups readable by authed') then
    create policy "open groups readable by authed" on groups
      for select to authenticated
      using (is_open);
  end if;
end $$;

-- Discovery list: member count + average lifetime points per member.
-- Deliberately a SECURITY DEFINER (default) view: it aggregates weekly_stats for users
-- the caller does not share a crew with, which their own RLS would hide. It exposes
-- only aggregates and never the invite_code.
create or replace view open_crews as
select
  g.id                                                as group_id,
  g.name                                              as name,
  g.weekly_quota                                      as weekly_quota,
  g.created_at                                        as created_at,
  count(gm.user_id)::int                              as member_count,
  coalesce(round(avg(coalesce(mp.total_points, 0))), 0)::int as avg_points
from groups g
left join group_members gm on gm.group_id = g.id
left join (
  select user_id, sum(points)::numeric as total_points
    from weekly_stats
   group by user_id
) mp on mp.user_id = gm.user_id
where g.is_open
group by g.id, g.name, g.weekly_quota, g.created_at;

revoke all on open_crews from anon;
grant select on open_crews to authenticated;

-- Join an open crew without an invite code (the discovery rows have no code to type).
create or replace function join_open_group(p_group_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from groups where id = p_group_id and is_open) then
    raise exception 'crew is not open to join';
  end if;
  insert into group_members (group_id, user_id) values (p_group_id, auth.uid())
    on conflict do nothing;
  update profiles set active_group_id = p_group_id where id = auth.uid();
  return p_group_id;
end;
$$;
