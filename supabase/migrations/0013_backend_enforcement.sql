-- Move business rules from frontend to database.

-- ── 1. Enforce one group per user ─────────────────────────────────────────────
create or replace function enforce_single_group()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from group_members
    where user_id = NEW.user_id
      and group_id != NEW.group_id
  ) then
    raise exception 'user is already in a group';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_enforce_single_group on group_members;
create trigger trg_enforce_single_group
  before insert on group_members
  for each row execute function enforce_single_group();


-- ── 2. Auto-compute points from problem difficulty (client value overridden) ───
create or replace function auto_set_solve_points()
returns trigger language plpgsql as $$
begin
  select points_for_difficulty(difficulty) into NEW.points
  from problems where slug = NEW.problem_slug;
  if NEW.points is null then
    raise exception 'unknown problem slug: %', NEW.problem_slug;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_auto_solve_points on solves;
create trigger trg_auto_solve_points
  before insert on solves
  for each row execute function auto_set_solve_points();


-- ── 3. Auto-derive solved_date from solved_at (client value overridden) ────────
create or replace function auto_set_solved_date()
returns trigger language plpgsql as $$
begin
  NEW.solved_date := (NEW.solved_at at time zone 'UTC')::date;
  return NEW;
end;
$$;

drop trigger if exists trg_auto_solved_date on solves;
create trigger trg_auto_solved_date
  before insert on solves
  for each row execute function auto_set_solved_date();


-- ── 4. Restrict manual inserts to source = 'manual' only ─────────────────────
--    The leetcode_sync edge function uses service_role key → bypasses RLS,
--    so it can still insert source = 'leetcode_sync'.
drop policy if exists "solves self insert" on solves;
create policy "solves self insert" on solves
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and source = 'manual'
  );


-- ── 5. Username format constraint ─────────────────────────────────────────────
alter table profiles
  drop constraint if exists valid_username,
  add  constraint valid_username
    check (username ~ '^[a-z0-9_]{2,20}$');


-- ── 6. LeetCode username format constraint ────────────────────────────────────
alter table profiles
  drop constraint if exists valid_leetcode_username,
  add  constraint valid_leetcode_username
    check (leetcode_username is null or leetcode_username ~ '^[a-zA-Z0-9_-]{1,40}$');


-- ── 7. weekly_quota bounds ────────────────────────────────────────────────────
alter table groups
  drop constraint if exists valid_weekly_quota,
  add  constraint valid_weekly_quota
    check (weekly_quota >= 1 and weekly_quota <= 52);


-- ── 8. invite_code format constraint ─────────────────────────────────────────
alter table groups
  drop constraint if exists valid_invite_code,
  add  constraint valid_invite_code
    check (invite_code ~ '^[A-Z0-9]{6}$');
