-- Fix: groups and group_members were missing INSERT policies.
-- Users could read groups but not create them.

create policy "groups insert by authed" on groups
  for insert to authenticated with check (created_by = auth.uid());

create policy "groups update by admin" on groups
  for update to authenticated using (
    exists (
      select 1 from group_members
      where group_id = groups.id and user_id = auth.uid() and role = 'admin'
    )
  );

create policy "group_members insert self" on group_members
  for insert to authenticated with check (user_id = auth.uid());

create policy "group_members delete self" on group_members
  for delete to authenticated using (user_id = auth.uid());
