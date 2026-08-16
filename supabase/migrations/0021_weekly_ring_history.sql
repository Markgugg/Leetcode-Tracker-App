-- Ring model, part 2: per-week ring history on weekly_stats.
-- The 12-week ring grid ("Weeks closed · last 12") and "9 of 12 weeks closed" become
-- a single indexed query instead of a recomputation over every solve the user ever made.
-- The goals IN FORCE that week are stored alongside, so raising your goal today does not
-- retroactively un-close last month.

alter table weekly_stats
  add column if not exists volume          int     not null default 0,
  add column if not exists med_plus        int     not null default 0,
  add column if not exists active_days     int     not null default 0,
  add column if not exists volume_goal     int     not null default 10,
  add column if not exists difficulty_goal int     not null default 3,
  add column if not exists days_goal       int     not null default 5,
  add column if not exists rings_closed    boolean not null default false;

create index if not exists weekly_stats_user_week_idx
  on weekly_stats (user_id, week_start desc);

-- ── Maintain the ring columns on every solve ─────────────────────────────────
-- Replaces on_solve_insert() from 0002. Changes vs. the old body:
--   * tracks volume / med_plus / active_days
--   * snapshots the user's three ring goals onto the week row
--   * hit_quota now means "volume ring closed" (personal goal) instead of the
--     group weekly_quota — the group quota is no longer the unit of progress
--   * rings_closed = all three rings closed
-- Daily-streak maintenance is unchanged.
create or replace function on_solve_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_week_start date := date_trunc('week', new.solved_at)::date;
  v_solve_day  date := new.solved_date;
  v_difficulty text;
  v_med_plus   int;
  v_vg int; v_dg int; v_dayg int;
  v_active     int;
  v_prev_day   date;
  v_cur_day    int;
begin
  select difficulty into v_difficulty from problems where slug = new.problem_slug;
  v_med_plus := case when v_difficulty in ('medium','hard') then 1 else 0 end;

  select volume_goal, difficulty_goal, days_goal
    into v_vg, v_dg, v_dayg
    from profiles where id = new.user_id;
  v_vg   := coalesce(v_vg, 10);
  v_dg   := coalesce(v_dg, 3);
  v_dayg := coalesce(v_dayg, 5);

  insert into weekly_stats (
    user_id, week_start, problem_count, points,
    volume, med_plus, volume_goal, difficulty_goal, days_goal
  ) values (
    new.user_id, v_week_start, 1, new.points,
    1, v_med_plus, v_vg, v_dg, v_dayg
  )
  on conflict (user_id, week_start) do update set
    problem_count   = weekly_stats.problem_count + 1,
    points          = weekly_stats.points + excluded.points,
    volume          = weekly_stats.volume + 1,
    med_plus        = weekly_stats.med_plus + excluded.med_plus,
    volume_goal     = excluded.volume_goal,
    difficulty_goal = excluded.difficulty_goal,
    days_goal       = excluded.days_goal;

  select count(distinct solved_date) into v_active
    from solves
    where user_id = new.user_id
      and solved_date >= v_week_start
      and solved_date <  v_week_start + 7;

  update weekly_stats set
    active_days  = v_active,
    hit_quota    = (volume >= v_vg),
    rings_closed = (volume >= v_vg and med_plus >= v_dg and v_active >= v_dayg)
    where user_id = new.user_id and week_start = v_week_start;

  -- daily streak (unchanged from 0002)
  insert into streaks (user_id) values (new.user_id)
    on conflict (user_id) do nothing;
  select last_active_day, current_days into v_prev_day, v_cur_day
    from streaks where user_id = new.user_id;
  if v_prev_day is null or v_prev_day < v_solve_day then
    if v_prev_day = v_solve_day - 1 then
      v_cur_day := v_cur_day + 1;
    else
      v_cur_day := 1;
    end if;
    update streaks set
      current_days    = v_cur_day,
      longest_days    = greatest(longest_days, v_cur_day),
      last_active_day = v_solve_day
      where user_id = new.user_id;
  end if;

  return new;
end;
$$;

-- ── One-shot / repairable backfill ───────────────────────────────────────────
-- Safe to call again at any time (e.g. after a bulk leetcode-sync import).
create or replace function recompute_weekly_ring_stats(p_user uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into weekly_stats (user_id, week_start, problem_count, points, volume, med_plus, active_days)
  select s.user_id,
         date_trunc('week', s.solved_at)::date,
         count(*)::int,
         coalesce(sum(s.points), 0)::int,
         count(*)::int,
         count(*) filter (where p.difficulty in ('medium','hard'))::int,
         count(distinct s.solved_date)::int
    from solves s
    join problems p on p.slug = s.problem_slug
   where p_user is null or s.user_id = p_user
   group by 1, 2
  on conflict (user_id, week_start) do update set
    problem_count = excluded.problem_count,
    points        = excluded.points,
    volume        = excluded.volume,
    med_plus      = excluded.med_plus,
    active_days   = excluded.active_days;

  update weekly_stats ws set
    volume_goal     = coalesce(pr.volume_goal, 10),
    difficulty_goal = coalesce(pr.difficulty_goal, 3),
    days_goal       = coalesce(pr.days_goal, 5)
    from profiles pr
   where pr.id = ws.user_id
     and (p_user is null or ws.user_id = p_user);

  update weekly_stats set
    hit_quota    = (volume >= volume_goal),
    rings_closed = (volume >= volume_goal and med_plus >= difficulty_goal and active_days >= days_goal)
   where p_user is null or user_id = p_user;
end;
$$;

select recompute_weekly_ring_stats();
