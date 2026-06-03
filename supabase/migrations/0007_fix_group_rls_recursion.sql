-- Fix infinite recursion in group_members and groups SELECT policies.
-- The old policy queried group_members to check membership, which triggered
-- the same policy again — infinite loop. Fix: use a SECURITY DEFINER function
-- that bypasses RLS and can safely query the table directly.

create or replace function is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

drop policy if exists "group_members readable by members" on group_members;
drop policy if exists "groups readable by members" on groups;

create policy "group_members readable by members" on group_members
  for select to authenticated
  using (is_group_member(group_id));

create policy "groups readable by members" on groups
  for select to authenticated
  using (is_group_member(id));
