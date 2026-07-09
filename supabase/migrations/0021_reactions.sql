-- Phase 2: emoji reactions on squad chat messages and solves.
-- One row per (user, target, emoji); toggling off deletes the row.

create table if not exists reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  target_type text not null check (target_type in ('message', 'solve')),
  target_id uuid not null,
  emoji text not null check (emoji in ('🔥', '👑', '💀', '🎉')),
  created_at timestamptz not null default now(),
  unique (user_id, target_type, target_id, emoji)
);

create index if not exists reactions_target_idx on reactions (target_type, target_id);

alter table reactions enable row level security;

-- Readable by any signed-in user (solves/feed are already open — see 0004).
create policy "reactions_select" on reactions
  for select to authenticated using (true);

-- Users manage only their own reactions.
create policy "reactions_insert" on reactions
  for insert to authenticated with check (auth.uid() = user_id);

create policy "reactions_delete" on reactions
  for delete to authenticated using (auth.uid() = user_id);

-- Realtime for live chips in chat/feed.
alter publication supabase_realtime add table reactions;
