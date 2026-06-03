-- Make feed global: any authenticated user can see all solves and streaks.
-- Groups become optional social rooms, not required for core functionality.

drop policy if exists "solves readable by group peers" on solves;
create policy "solves readable by all authed" on solves
  for select to authenticated using (true);

drop policy if exists "streaks readable by group peers" on streaks;
create policy "streaks readable by all authed" on streaks
  for select to authenticated using (true);

-- Profiles already readable by all authed — no change needed.
