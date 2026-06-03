-- Grind: initial schema (idempotent)

create extension if not exists "pgcrypto";

-- ============ profiles ============
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  avatar_url text,
  leetcode_username text,
  leetcode_last_synced_at timestamptz,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now()
);
alter table profiles enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='profiles' and policyname='profiles readable by authed') then
    create policy "profiles readable by authed" on profiles for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='profiles' and policyname='profiles self update') then
    create policy "profiles self update" on profiles for update to authenticated using (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where tablename='profiles' and policyname='profiles self insert') then
    create policy "profiles self insert" on profiles for insert to authenticated with check (auth.uid() = id);
  end if;
end $$;

-- ============ groups ============
create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null,
  weekly_quota int not null default 5,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);
alter table groups enable row level security;

create table if not exists group_members (
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('admin','member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
alter table group_members enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='groups' and policyname='groups readable by members') then
    create policy "groups readable by members" on groups for select to authenticated using (
      exists (select 1 from group_members gm where gm.group_id = groups.id and gm.user_id = auth.uid())
    );
  end if;
  if not exists (select 1 from pg_policies where tablename='group_members' and policyname='group_members readable by members') then
    create policy "group_members readable by members" on group_members for select to authenticated using (
      exists (select 1 from group_members gm where gm.group_id = group_members.group_id and gm.user_id = auth.uid())
    );
  end if;
end $$;

-- ============ problems catalog ============
create table if not exists problems (
  slug text primary key,
  title text not null,
  difficulty text not null check (difficulty in ('easy','medium','hard')),
  tags text[] not null default '{}',
  is_premium boolean not null default false
);
alter table problems enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='problems' and policyname='problems public read') then
    create policy "problems public read" on problems for select to authenticated using (true);
  end if;
end $$;

-- ============ solves ============
-- solved_date is an explicit date column (UTC) to avoid non-immutable functional index issues
create table if not exists solves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  problem_slug text not null references problems(slug),
  solved_at timestamptz not null default now(),
  solved_date date not null,           -- set to solved_at::date (UTC) by caller
  source text not null check (source in ('manual','leetcode_sync')),
  language text,
  note text,
  points int not null,
  created_at timestamptz not null default now(),
  unique (user_id, problem_slug, solved_date)
);
create index if not exists solves_user_solved_at_idx on solves (user_id, solved_at desc);
create index if not exists solves_solved_at_idx on solves (solved_at desc);
alter table solves enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='solves' and policyname='solves readable by group peers') then
    create policy "solves readable by group peers" on solves for select to authenticated using (
      user_id = auth.uid() or exists (
        select 1 from group_members me
        join group_members them on them.group_id = me.group_id
        where me.user_id = auth.uid() and them.user_id = solves.user_id
      )
    );
  end if;
  if not exists (select 1 from pg_policies where tablename='solves' and policyname='solves self insert') then
    create policy "solves self insert" on solves for insert to authenticated with check (user_id = auth.uid());
  end if;
end $$;

-- ============ streaks ============
create table if not exists streaks (
  user_id uuid primary key references profiles(id) on delete cascade,
  current_weeks int not null default 0,
  longest_weeks int not null default 0,
  last_qualifying_week date,
  freezes_available int not null default 1,
  current_days int not null default 0,
  longest_days int not null default 0,
  last_active_day date
);
alter table streaks enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='streaks' and policyname='streaks readable by group peers') then
    create policy "streaks readable by group peers" on streaks for select to authenticated using (
      user_id = auth.uid() or exists (
        select 1 from group_members me
        join group_members them on them.group_id = me.group_id
        where me.user_id = auth.uid() and them.user_id = streaks.user_id
      )
    );
  end if;
end $$;

-- ============ push tokens ============
create table if not exists push_tokens (
  expo_token text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  platform text,
  updated_at timestamptz not null default now()
);
alter table push_tokens enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='push_tokens' and policyname='push_tokens self') then
    create policy "push_tokens self" on push_tokens for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

-- ============ helpers ============
create or replace function points_for_difficulty(d text) returns int
language sql immutable as $$
  select case d when 'easy' then 1 when 'medium' then 3 when 'hard' then 5 else 1 end
$$;

create or replace function join_group_by_code(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare g_id uuid;
begin
  select id into g_id from groups where invite_code = upper(p_code);
  if g_id is null then raise exception 'invalid invite code'; end if;
  insert into group_members (group_id, user_id) values (g_id, auth.uid())
    on conflict do nothing;
  return g_id;
end;
$$;
