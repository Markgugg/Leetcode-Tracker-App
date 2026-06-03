-- Streak engine + weekly stats recompute
-- Run after 0001_init.sql. Schedules pg_cron jobs (requires pg_cron extension enabled in Supabase).

create extension if not exists pg_cron with schema extensions;

create table if not exists weekly_stats (
  user_id uuid not null references profiles(id) on delete cascade,
  week_start date not null,
  problem_count int not null default 0,
  points int not null default 0,
  hit_quota boolean not null default false,
  primary key (user_id, week_start)
);
alter table weekly_stats enable row level security;
create policy "weekly_stats readable by group peers" on weekly_stats for select to authenticated using (
  user_id = auth.uid() or exists (
    select 1 from group_members me
    join group_members them on them.group_id = me.group_id
    where me.user_id = auth.uid() and them.user_id = weekly_stats.user_id
  )
);

-- Trigger: maintain weekly_stats + daily streak on every solve
create or replace function on_solve_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_week_start date := date_trunc('week', new.solved_at)::date;
  v_solve_day date := new.solved_at::date;
  v_quota int;
  v_prev_day date;
  v_cur_day int;
begin
  -- aggregate weekly stats
  insert into weekly_stats (user_id, week_start, problem_count, points)
    values (new.user_id, v_week_start, 1, new.points)
    on conflict (user_id, week_start)
    do update set problem_count = weekly_stats.problem_count + 1,
                  points = weekly_stats.points + excluded.points;

  -- mark quota hit (use 5 as default if user has no group)
  select coalesce(min(g.weekly_quota), 5) into v_quota
    from group_members gm join groups g on g.id = gm.group_id
    where gm.user_id = new.user_id;
  update weekly_stats
    set hit_quota = (problem_count >= v_quota)
    where user_id = new.user_id and week_start = v_week_start;

  -- daily streak
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
      current_days = v_cur_day,
      longest_days = greatest(longest_days, v_cur_day),
      last_active_day = v_solve_day
      where user_id = new.user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists solves_after_insert on solves;
create trigger solves_after_insert after insert on solves
  for each row execute function on_solve_insert();

-- Weekly streak recompute (Mondays 00:05 UTC)
create or replace function recompute_weekly_streaks() returns void
language plpgsql security definer set search_path = public as $$
declare r record; v_prev_week date := (date_trunc('week', now()) - interval '1 week')::date;
begin
  for r in select user_id, hit_quota from weekly_stats where week_start = v_prev_week loop
    if r.hit_quota then
      update streaks set
        current_weeks = current_weeks + 1,
        longest_weeks = greatest(longest_weeks, current_weeks + 1),
        last_qualifying_week = v_prev_week
        where user_id = r.user_id;
    else
      -- consume a freeze if available, else reset
      update streaks set
        freezes_available = freezes_available - 1
        where user_id = r.user_id and freezes_available > 0;
      if not found then
        update streaks set current_weeks = 0 where user_id = r.user_id;
      end if;
    end if;
  end loop;
  -- monthly freeze grant on first of month
  if extract(day from now()) = 1 then
    update streaks set freezes_available = least(freezes_available + 1, 2);
  end if;
end;
$$;

-- Daily streak decay (resets if user didn't solve yesterday)
create or replace function decay_daily_streaks() returns void
language plpgsql security definer set search_path = public as $$
begin
  update streaks
    set current_days = 0
    where last_active_day is not null
      and last_active_day < (current_date - 1)
      and current_days > 0;
end;
$$;

-- Schedule via pg_cron
select cron.schedule('weekly-streaks', '5 0 * * 1', $$select public.recompute_weekly_streaks()$$);
select cron.schedule('daily-decay', '5 0 * * *', $$select public.decay_daily_streaks()$$);
