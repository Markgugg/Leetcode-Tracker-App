-- Trends card (Summary): this week vs. the trailing 90-day average.
-- Long format — one row per metric per user, ordered by sort_order, so the card
-- renders straight off the result set.
--
-- Note: current_value for the volume metrics is the week SO FAR, compared against a
-- full-week average. That is the intended reading ("am I ahead of my usual pace"),
-- and it is what the prototype shows.

create or replace view user_trends with (security_invoker = true) as
with base as (
  select s.user_id, s.solved_date, p.difficulty
    from solves s
    join problems p on p.slug = s.problem_slug
   where s.solved_date >= current_date - 89
),
wk as (
  select user_id,
         count(*)::numeric                                      as c,
         count(*) filter (where difficulty = 'medium')::numeric  as m,
         count(*) filter (where difficulty = 'hard')::numeric    as h,
         count(distinct solved_date)::numeric                    as d
    from base
   where solved_date >= date_trunc('week', current_date)::date
   group by user_id
),
tr as (
  select user_id,
         count(*)::numeric                                      as c,
         count(*) filter (where difficulty = 'medium')::numeric  as m,
         count(*) filter (where difficulty = 'hard')::numeric    as h,
         count(distinct solved_date)::numeric                    as d
    from base
   group by user_id
),
visible as (
  select p.id as user_id from profiles p
   where p.id = auth.uid() or shares_group_with(p.id)
),
j as (
  select v.user_id,
         coalesce(wk.c, 0) as wc, coalesce(wk.m, 0) as wm,
         coalesce(wk.h, 0) as wh, coalesce(wk.d, 0) as wd,
         coalesce(tr.c, 0) as tc, coalesce(tr.m, 0) as tm,
         coalesce(tr.h, 0) as th, coalesce(tr.d, 0) as td
    from visible v
    left join wk on wk.user_id = v.user_id
    left join tr on tr.user_id = v.user_id
)
select
  j.user_id,
  t.metric,
  t.label,
  t.unit,
  round(t.current_value,  1) as current_value,
  round(t.baseline_value, 1) as baseline_value,
  case when t.current_value >= t.baseline_value then 'up' else 'down' end as direction,
  t.sort_order
from j
cross join lateral (
  values
    ('solves_week',  'Solves/week',  'count', j.wc,                                        j.tc * 7.0 / 90, 1),
    ('medium_share', 'Medium share', 'pct',   coalesce(100 * j.wm / nullif(j.wc, 0), 0),   coalesce(100 * j.tm / nullif(j.tc, 0), 0), 2),
    ('hard_share',   'Hard share',   'pct',   coalesce(100 * j.wh / nullif(j.wc, 0), 0),   coalesce(100 * j.th / nullif(j.tc, 0), 0), 3),
    ('active_days',  'Active days',  'count', j.wd,                                        j.td * 7.0 / 90, 4)
) as t(metric, label, unit, current_value, baseline_value, sort_order);

grant select on user_trends to authenticated;
