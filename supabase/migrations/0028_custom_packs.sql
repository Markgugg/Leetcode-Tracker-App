-- ---------------------------------------------------------------------------
-- 0028 — Custom packs
--
-- The durable mirror behind src/screens/practice/packs.ts. A "pack" is a user's
-- own list of problems: imported from a LeetCode study plan or problem list,
-- added from the NeetCode lists we bundle in the app, or pasted by hand.
--
-- Two things this schema deliberately does NOT do:
--
--   1. It stores no progress. A pack is a list of slugs; completion is the
--      intersection with `solves`, recomputed on every render by the same
--      `resolveTrack` the three built-in tracks go through (0027). There is
--      nothing here to keep in sync and nothing to backfill.
--
--   2. It does not reference `problems(slug)`. `track_problems` does, because
--      those lists are ours and we seed the catalog to match. A user can import
--      any list on leetcode.com, most of which is not seeded — an FK would make
--      the import fail instead of degrade. `user_pack_problems` therefore keeps
--      the slug as plain text plus the title/difficulty LeetCode returned, and
--      the client filters to the catalog at read time (rows outside it are
--      counted in neither numerator nor denominator, and the sheet says how
--      many were dropped). `pending_pack_problems` at the bottom exposes that
--      gap so the catalog can be grown from real demand.
--
-- Ids are client-generated text (`pack_<base36 time>_<random>`), matching
-- `tracks.id`. There is no uuid generator on the client and a pack id only has
-- to be unique per user.
--
-- Apply after 0027. Not applied by this change — the app works without it
-- (AsyncStorage is the rendering tier; every remote call is best-effort).
-- ---------------------------------------------------------------------------

create table if not exists user_packs (
  id          text primary key,
  user_id     uuid not null references profiles(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 120),
  blurb       text not null default '',
  -- how the pack got here; mirrors PackSourceKind in leetcodeImport.ts
  source      text not null default 'manual'
                check (source in ('leetcode-studyplan','leetcode-list','neetcode','manual')),
  -- study-plan / list slug, or the bundled pack's id. Not unique: re-importing
  -- the same list into a second pack is legitimate.
  source_ref  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists user_packs_user_idx
  on user_packs (user_id, created_at);

create table if not exists user_pack_problems (
  pack_id      text not null references user_packs(id) on delete cascade,
  problem_slug text not null check (length(problem_slug) between 1 and 200),
  -- the list's own grouping (a study plan's sub-group); 'Problems' when flat
  section      text not null default 'Problems',
  -- position across the whole pack, sections included, so order round-trips
  position     int  not null,
  -- as imported. The seeded catalog wins wherever it has the row; these are
  -- what lets the UI show a title for a problem the catalog has never heard of.
  title        text,
  difficulty   text check (difficulty is null or difficulty in ('easy','medium','hard')),
  primary key (pack_id, problem_slug)
);

create index if not exists user_pack_problems_pack_pos_idx
  on user_pack_problems (pack_id, position);

alter table user_packs         enable row level security;
alter table user_pack_problems enable row level security;

-- Owner-only, all four verbs. Unlike `tracks` / `track_problems` (catalog data,
-- readable by every signed-in user) a pack is private: nothing about it is
-- shared with crew mates, so there is no group-visibility clause here.
do $$ begin
  if not exists (select 1 from pg_policies where tablename='user_packs' and policyname='own packs select') then
    create policy "own packs select" on user_packs
      for select to authenticated using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where tablename='user_packs' and policyname='own packs insert') then
    create policy "own packs insert" on user_packs
      for insert to authenticated with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where tablename='user_packs' and policyname='own packs update') then
    create policy "own packs update" on user_packs
      for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where tablename='user_packs' and policyname='own packs delete') then
    create policy "own packs delete" on user_packs
      for delete to authenticated using (user_id = auth.uid());
  end if;
end $$;

-- Membership inherits ownership through the parent pack. `exists` against
-- user_packs is the whole check; a row can never outlive its pack because of
-- the cascading FK.
do $$ begin
  if not exists (select 1 from pg_policies where tablename='user_pack_problems' and policyname='own pack problems select') then
    create policy "own pack problems select" on user_pack_problems
      for select to authenticated using (
        exists (select 1 from user_packs p
                 where p.id = user_pack_problems.pack_id and p.user_id = auth.uid())
      );
  end if;
  if not exists (select 1 from pg_policies where tablename='user_pack_problems' and policyname='own pack problems insert') then
    create policy "own pack problems insert" on user_pack_problems
      for insert to authenticated with check (
        exists (select 1 from user_packs p
                 where p.id = user_pack_problems.pack_id and p.user_id = auth.uid())
      );
  end if;
  if not exists (select 1 from pg_policies where tablename='user_pack_problems' and policyname='own pack problems update') then
    create policy "own pack problems update" on user_pack_problems
      for update to authenticated using (
        exists (select 1 from user_packs p
                 where p.id = user_pack_problems.pack_id and p.user_id = auth.uid())
      ) with check (
        exists (select 1 from user_packs p
                 where p.id = user_pack_problems.pack_id and p.user_id = auth.uid())
      );
  end if;
  if not exists (select 1 from pg_policies where tablename='user_pack_problems' and policyname='own pack problems delete') then
    create policy "own pack problems delete" on user_pack_problems
      for delete to authenticated using (
        exists (select 1 from user_packs p
                 where p.id = user_pack_problems.pack_id and p.user_id = auth.uid())
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Derived progress, for parity with 0027's `track_progress`.
--
-- The client already computes this from `problems` + `solves` in one round trip
-- it makes anyway; the view exists so anything server-side (notifications, the
-- crew feed) can ask "how far into their pack is this user" without repeating
-- the join. `total` counts only slugs the catalog has, because a slug outside
-- it can never be solved — `solves.problem_slug` is FK'd to `problems.slug`.
-- ---------------------------------------------------------------------------

create or replace view user_pack_progress
with (security_invoker = true) as
select
  p.user_id,
  p.id                                                        as pack_id,
  p.name,
  count(*) filter (where pr.slug is not null)::int             as total,
  count(*) filter (where s.problem_slug is not null)::int      as done,
  count(*)::int                                                as listed
from user_packs p
join user_pack_problems upp on upp.pack_id = p.id
left join problems pr on pr.slug = upp.problem_slug
left join solves s on s.problem_slug = upp.problem_slug and s.user_id = p.user_id
group by p.user_id, p.id, p.name;

grant select on user_pack_progress to authenticated;

-- ---------------------------------------------------------------------------
-- Catalog demand.
--
-- Every slug in an imported pack that we have never seeded. This is the input
-- to growing `problems`: the exact set of rows that would turn a "142 of 150
-- tracked" pack into a whole one.
--
-- `security_invoker` on purpose, so RLS still applies: a signed-in user sees
-- only their own gaps. The service role bypasses RLS, so an ops query over this
-- view still gets the global, demand-ranked picture — without publishing one
-- user's imported lists to every other user.
-- ---------------------------------------------------------------------------

create or replace view pending_pack_problems
with (security_invoker = true) as
select
  upp.problem_slug,
  max(upp.title)      as title,
  max(upp.difficulty) as difficulty,
  count(distinct upp.pack_id)::int as packs
from user_pack_problems upp
left join problems pr on pr.slug = upp.problem_slug
where pr.slug is null
group by upp.problem_slug
order by packs desc, upp.problem_slug;

grant select on pending_pack_problems to authenticated;
