-- 1. Allow group creator to see their own group row immediately after insert
--    (fixes the .select() after INSERT failing due to is_group_member returning false
--    before the member row is inserted)
create policy "groups readable by creator" on groups
  for select to authenticated
  using (created_by = auth.uid());

-- 2. Harden group_members insert: verify the group actually exists
drop policy if exists "group_members insert self" on group_members;
create policy "group_members insert self" on group_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from groups where id = group_id)
  );

-- 3. Harden leave_group: explicit member check before delete
create or replace function leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from group_members
    where group_id = p_group_id and user_id = auth.uid()
  ) then
    raise exception 'not a member of this group';
  end if;

  delete from group_members
    where group_id = p_group_id and user_id = auth.uid();

  delete from groups
    where id = p_group_id
      and not exists (
        select 1 from group_members where group_id = p_group_id
      );
end;
$$;

-- 4. Harden join_group_by_code: validate invite code format
create or replace function join_group_by_code(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare g_id uuid;
begin
  if p_code is null or length(p_code) != 6 or upper(p_code) !~ '^[A-Z0-9]+$' then
    raise exception 'invalid invite code format';
  end if;
  select id into g_id from groups where invite_code = upper(p_code);
  if g_id is null then raise exception 'invalid invite code'; end if;
  insert into group_members (group_id, user_id) values (g_id, auth.uid())
    on conflict do nothing;
  return g_id;
end;
$$;
