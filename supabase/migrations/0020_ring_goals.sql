-- Ring model, part 1: personal ring goals on profiles.
-- Three rings reset every Monday: Volume, Difficulty (medium-or-harder), Streak (distinct days).
-- Goals are STORED, not only derived, so a user can override any single ring.

alter table profiles
  add column if not exists volume_goal     int not null default 10,
  add column if not exists difficulty_goal int not null default 3,
  add column if not exists days_goal       int not null default 5;

alter table profiles
  drop constraint if exists valid_volume_goal,
  add  constraint valid_volume_goal     check (volume_goal >= 3 and volume_goal <= 21);

alter table profiles
  drop constraint if exists valid_difficulty_goal,
  add  constraint valid_difficulty_goal check (difficulty_goal >= 0 and difficulty_goal <= 21);

alter table profiles
  drop constraint if exists valid_days_goal,
  add  constraint valid_days_goal       check (days_goal >= 1 and days_goal <= 7);

-- Canonical derivations (same formulas the onboarding stepper shows live).
--   difficulty = round(volume * 0.30)
--   days       = min(7, max(2, round(volume * 0.45)))
create or replace function derive_difficulty_goal(p_volume int) returns int
language sql immutable as $$
  select greatest(0, round(p_volume * 0.30)::int)
$$;

create or replace function derive_days_goal(p_volume int) returns int
language sql immutable as $$
  select least(7, greatest(2, round(p_volume * 0.45)::int))
$$;

-- RPC used by onboarding step 2 and the settings sheet: set the volume goal and
-- re-derive the other two in one round trip. To override a single ring instead,
-- update the column directly (RLS "profiles self update" already allows it).
create or replace function set_volume_goal(p_volume int) returns profiles
language plpgsql security definer set search_path = public as $$
declare r profiles;
begin
  if p_volume is null or p_volume < 3 or p_volume > 21 then
    raise exception 'volume goal must be between 3 and 21';
  end if;
  update profiles set
    volume_goal     = p_volume,
    difficulty_goal = derive_difficulty_goal(p_volume),
    days_goal       = derive_days_goal(p_volume)
  where id = auth.uid()
  returning * into r;
  if r is null then raise exception 'no profile for current user'; end if;
  return r;
end;
$$;

-- Backfill: only touch rows still sitting on the untouched defaults, so re-running
-- this migration never clobbers a user's deliberate per-ring override.
update profiles set
  difficulty_goal = derive_difficulty_goal(volume_goal),
  days_goal       = derive_days_goal(volume_goal)
where difficulty_goal = 3 and days_goal = 5 and volume_goal <> 10;
