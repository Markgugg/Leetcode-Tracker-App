-- Restore group-based feed: users see only their own solves + group peers.
drop policy if exists "solves readable by all authed" on solves;
create policy "solves readable by group peers" on solves
  for select to authenticated using (
    user_id = auth.uid() or exists (
      select 1 from group_members me
      join group_members them on them.group_id = me.group_id
      where me.user_id = auth.uid() and them.user_id = solves.user_id
    )
  );

drop policy if exists "streaks readable by all authed" on streaks;
create policy "streaks readable by group peers" on streaks
  for select to authenticated using (
    user_id = auth.uid() or exists (
      select 1 from group_members me
      join group_members them on them.group_id = me.group_id
      where me.user_id = auth.uid() and them.user_id = streaks.user_id
    )
  );
