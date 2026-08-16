-- 0029 — Trophies (You → Arena card, crew standings).
--
-- The trophy total is DERIVED, never stored. There is no counter column and no
-- trigger that increments one, because a counter drifts the moment a solve is
-- deleted, backfilled, or synced twice. `user_trophies` recomputes the number
-- from `solves` ⋈ `problems` on every read.
--
-- This view is the server-side twin of `src/lib/trophies.ts`. The two implement
-- the SAME formula; if you edit one you must edit the other, or a user's own
-- card will disagree with their row in the crew table.
--
-- ── Earn table (design_handoff/trophy-explorer.html, variant 3 "Arena card") ──
--   Easy solved                    +8
--   Medium solved                 +20
--   Hard solved                   +45
--   Streak multiplier  7d  ×1.25   applied to the base value above
--                     30d  ×1.5
--   First solve of the day         +5   flat, never multiplied
--
--   Not computed here (they are not visible to a view over `solves`, and the
--   client adds them from ring/crew data as `WeeklyLedger` rows):
--     any ring closed +25 · all three rings +60 · crew member beaten +40
--     inactive week −150
--   So `user_trophies.trophies` is the *base* total: the client's number equals
--   this one plus its ledger, never a different earn rate.
--
-- ── Formula, exactly ─────────────────────────────────────────────────────────
--   1. One payout per problem. Only the earliest solve of a given
--      `problem_slug` pays; a re-solve on a later date pays 0. (`solves` is
--      unique on (user_id, problem_slug, solved_date), so without this rule one
--      Hard could be farmed for 45 a day.) Ties inside a day break on `slug`,
--      matching the client's stable sort.
--   2. Every solve day is an active day. Streak runs are measured over all
--      distinct `solved_date` values, re-solves included — a review day keeps
--      the streak alive even though it earns nothing.
--   3. streak(d) = length of the run of consecutive active days ending at d,
--      computed gaps-and-islands: `d - row_number() over (order by d)` is
--      constant inside a run.
--   4. first_of_day = the earliest *paying* solve of that date.
--   5. amount = round(base * multiplier) + 5 if first_of_day else 0.
--      Rounding happens BEFORE the flat bonus: a Hard on a 30-day streak that
--      opens the day is round(45 * 1.5) + 5 = 73, not round((45 + 5) * 1.5).
--   6. trophies = sum(amount), floored at 0.
--
-- ── Leagues (client-side only, listed here so the economy reads in one place) ─
--   Bronze Sandbox 0 · Silver Scratchpad 400 · Gold Whiteboard 1000
--   Jade Terminal 2000 · Sapphire Compiler 3400 · Amethyst Debugger 5000
--   Ruby Runtime 7000 · Diamond Kernel 9200 · Grandmaster Singularity 12000
--   (recalibrated 2026-08-16 to the catalog-capped economy; comment-only
--   change, view logic untouched — leagues live client-side in trophies.ts)
--
-- security_invoker so `solves`' own RLS still applies through the view: a user
-- sees their own row and their crew peers' rows, and nothing else.

create or replace view user_trophies with (security_invoker = true) as
with first_solves as (
  -- Rule 1: earliest solve per (user, problem).
  select distinct on (s.user_id, s.problem_slug)
    s.user_id,
    s.problem_slug,
    s.solved_date,
    p.difficulty
  from solves s
  join problems p on p.slug = s.problem_slug
  order by s.user_id, s.problem_slug, s.solved_date
),
active_days as (
  -- Rule 2: every distinct solve date, paying or not.
  select distinct user_id, solved_date from solves
),
runs as (
  -- Rule 3: consecutive dates share `grp`, so the run length is a count
  -- over the rows of that group up to and including the current date.
  select
    user_id,
    solved_date,
    -- date minus an offset: constant (a date) for every row of one run.
    solved_date - (row_number() over (partition by user_id order by solved_date))::int as grp
  from active_days
),
streaks_by_day as (
  select
    user_id,
    solved_date,
    (solved_date - min(solved_date) over (partition by user_id, grp order by solved_date) + 1)::int
      as streak_days
  from runs
),
priced as (
  select
    fs.user_id,
    fs.solved_date,
    fs.difficulty,
    sd.streak_days,
    case
      when sd.streak_days >= 30 then 1.50
      when sd.streak_days >= 7  then 1.25
      else 1.00
    end as multiplier,
    -- Rule 4: first *paying* solve of the date.
    (row_number() over (
       partition by fs.user_id, fs.solved_date order by fs.problem_slug
     ) = 1) as first_of_day
  from first_solves fs
  join streaks_by_day sd
    on sd.user_id = fs.user_id and sd.solved_date = fs.solved_date
),
earned as (
  select
    user_id,
    solved_date,
    difficulty,
    -- Rule 5.
    round(
      (case difficulty
         when 'easy'   then 8
         when 'medium' then 20
         when 'hard'   then 45
         else 20                      -- unreachable: difficulty is CHECKed
       end)::numeric * multiplier
    )::int + (case when first_of_day then 5 else 0 end) as amount
  from priced
)
select
  user_id,
  -- Rule 6.
  greatest(0, coalesce(sum(amount), 0))::int                                     as trophies,
  coalesce(sum(amount) filter (where difficulty = 'easy'), 0)::int               as easy_trophies,
  coalesce(sum(amount) filter (where difficulty = 'medium'), 0)::int             as medium_trophies,
  coalesce(sum(amount) filter (where difficulty = 'hard'), 0)::int               as hard_trophies,
  coalesce(sum(amount) filter (
    where solved_date >= date_trunc('week', current_date)::date), 0)::int        as week_trophies,
  count(*)::int                                                                  as counted_solves,
  max(solved_date)                                                               as last_earned_on
from earned
group by user_id;

comment on view user_trophies is
  'Derived trophy totals per user: 8/20/45 by difficulty, x1.25 at a 7-day '
  'streak and x1.5 at 30, +5 for the first solve of a day, one payout per '
  'problem. Never stored — recomputed from solves on every read. Must stay '
  'identical to src/lib/trophies.ts. Ring/crew/decay bonuses are added client '
  'side; this is the base total.';

grant select on user_trophies to authenticated;

-- The view scans a user's whole solve history, so keep the join key covered.
create index if not exists solves_user_slug_date_idx
  on solves (user_id, problem_slug, solved_date);
