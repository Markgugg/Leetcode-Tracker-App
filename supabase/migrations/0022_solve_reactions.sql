-- Reactions on milestone solves (🔥 💀 👏) — the Crew feed's missing loop.
-- One row per (solve, user, emoji); tapping an active chip deletes the row.

-- Helper: does the current user share a crew with p_user? (security definer so the
-- group_members lookup does not re-enter group_members RLS — same pattern as 0007.)
create or replace function shares_group_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user = auth.uid() or exists (
    select 1
      from group_members me
      join group_members them on them.group_id = me.group_id
     where me.user_id = auth.uid() and them.user_id = p_user
  );
$$;

-- Helper: owner of a solve, without depending on solves RLS inside a policy.
create or replace function solve_owner(p_solve uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select user_id from solves where id = p_solve;
$$;

create table if not exists solve_reactions (
  id         uuid primary key default gen_random_uuid(),
  solve_id   uuid not null references solves(id)   on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  emoji      text not null check (emoji in ('🔥', '💀', '👏')),
  created_at timestamptz not null default now(),
  unique (solve_id, user_id, emoji)
);

create index if not exists solve_reactions_solve_idx on solve_reactions (solve_id);
create index if not exists solve_reactions_user_idx  on solve_reactions (user_id);

alter table solve_reactions enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='solve_reactions' and policyname='solve_reactions readable by crew peers') then
    create policy "solve_reactions readable by crew peers" on solve_reactions
      for select to authenticated
      using (shares_group_with(solve_owner(solve_id)));
  end if;

  -- You may only react to a solve by someone in one of your crews (or your own).
  if not exists (select 1 from pg_policies where tablename='solve_reactions' and policyname='solve_reactions insert by crew peers') then
    create policy "solve_reactions insert by crew peers" on solve_reactions
      for insert to authenticated
      with check (
        user_id = auth.uid()
        and shares_group_with(solve_owner(solve_id))
      );
  end if;

  if not exists (select 1 from pg_policies where tablename='solve_reactions' and policyname='solve_reactions delete own') then
    create policy "solve_reactions delete own" on solve_reactions
      for delete to authenticated
      using (user_id = auth.uid());
  end if;
end $$;

-- Aggregated counts for the feed, plus whether the caller has that chip lit.
-- security_invoker so the table's crew-peer RLS still applies through the view.
create or replace view solve_reaction_counts with (security_invoker = true) as
select
  solve_id,
  emoji,
  count(*)::int as count,
  bool_or(user_id = auth.uid()) as reacted_by_me
from solve_reactions
group by solve_id, emoji;

grant select on solve_reaction_counts to authenticated;
