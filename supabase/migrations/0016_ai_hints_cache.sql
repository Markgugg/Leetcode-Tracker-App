alter table profiles
  add column if not exists ai_hints jsonb,
  add column if not exists ai_hints_refreshed_at timestamptz;
