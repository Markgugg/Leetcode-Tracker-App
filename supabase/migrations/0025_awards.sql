-- Awards (You → Awards card, "4 of 6").
-- Derived in a view from weekly_stats + streaks + solves — nothing here is authored
-- by hand, so there is no awards table to keep in sync and no backfill to run.
--
-- Six awards, stable sort_order 1–6, matching the 3-column grid:
--   1 Day streak   2 Weeks closed  3 Problems solved
--   4 Hard solved  5 Perfect weeks 6 Points

create or replace view user_awards with (security_invoker = true) as
with agg as (
  select
    p.id as user_id,
    coalesce(st.longest_days, 0)                                            as longest_days,
    coalesce(st.current_days, 0)                                            as current_days,
    (select count(*) from weekly_stats w
      where w.user_id = p.id and w.rings_closed)::int                       as weeks_closed,
    (select coalesce(sum(w.volume), 0) from weekly_stats w
      where w.user_id = p.id)::int                                          as total_solves,
    (select coalesce(sum(w.points), 0) from weekly_stats w
      where w.user_id = p.id)::int                                          as total_points,
    (select count(*) from solves s
       join problems pr on pr.slug = s.problem_slug
      where s.user_id = p.id and pr.difficulty = 'hard')::int               as hard_solves
  from profiles p
  left join streaks st on st.user_id = p.id
  where p.id = auth.uid() or shares_group_with(p.id)
)
select
  agg.user_id,
  a.key,
  a.label,
  a.value,
  a.target,
  (a.value >= a.target)                                        as unlocked,
  least(1.0, a.value::numeric / nullif(a.target, 0))           as progress,
  a.color,
  a.sort_order
from agg
cross join lateral (
  values
    ('day_streak',    'Day streak',      agg.longest_days, 7,   '#FF9F0A', 1),
    ('weeks_closed',  'Weeks closed',    agg.weeks_closed, 4,   '#A2F73D', 2),
    ('solved',        'Problems solved', agg.total_solves, 100, '#7B61FF', 3),
    ('hard_solved',   'Hard solved',     agg.hard_solves,  10,  '#FA114F', 4),
    ('perfect_weeks', 'Perfect weeks',   agg.weeks_closed, 1,   '#00D3F2', 5),
    ('points',        'Points',          agg.total_points, 500, '#FFD426', 6)
) as a(key, label, value, target, color, sort_order);

grant select on user_awards to authenticated;
