-- Phase 1 redesign: personal weekly goal (onboarding commitment), serious mode
-- (hides meme titles), and per-category notification preferences honored by the
-- notify-* edge functions.

alter table profiles
  add column if not exists weekly_goal int not null default 5
    check (weekly_goal between 1 and 21),
  add column if not exists serious_mode boolean not null default false,
  add column if not exists notification_prefs jsonb not null default
    '{"squad_solves": true, "hard_only": false, "streak_warnings": true, "rank_changes": true}'::jsonb;

comment on column profiles.weekly_goal is 'Personal problems-per-week commitment chosen in onboarding; drives the Today goal ring.';
comment on column profiles.serious_mode is 'When true, clients hide meme tier titles (recruiter-safe).';
comment on column profiles.notification_prefs is 'Per-category push preferences: squad_solves, hard_only, streak_warnings, rank_changes.';

-- Used by the delete-account edge function: removes groups orphaned by the
-- auth.users → profiles → group_members cascade. Service-role only.
create or replace function cleanup_empty_groups() returns void
language sql
security definer
set search_path = public
as $$
  delete from groups g
  where not exists (select 1 from group_members m where m.group_id = g.id);
$$;

revoke execute on function cleanup_empty_groups() from public, anon, authenticated;
