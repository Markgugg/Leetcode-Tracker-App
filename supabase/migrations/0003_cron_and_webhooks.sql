-- Webhooks + scheduled HTTP calls to edge functions
-- Requires the `pg_net` and `pg_cron` extensions (Supabase has these available).

create extension if not exists pg_net with schema extensions;

-- Helper to call our edge functions with the service-role key.
-- Replace YOUR_PROJECT_REF with your project ref before running, OR set as DB-level params.
-- These params can be set via: alter database postgres set app.functions_url = '...';
-- Then read here. For now they are placeholders meant to be edited.

create or replace function call_edge(p_function text, p_payload jsonb default '{}'::jsonb)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare
  v_url text := current_setting('app.functions_url', true) || '/' || p_function;
  v_key text := current_setting('app.service_role_key', true);
begin
  return (
    select net.http_post(
      url := v_url,
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
      body := p_payload
    )
  );
end;
$$;

-- Trigger: notify peers on every new solve
create or replace function on_solve_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_title text; v_diff text;
begin
  select title, difficulty into v_title, v_diff from problems where slug = new.problem_slug;
  perform call_edge('notify-friend-solved', jsonb_build_object(
    'solve_id', new.id,
    'user_id', new.user_id,
    'problem_title', coalesce(v_title, new.problem_slug),
    'difficulty', coalesce(v_diff, 'easy')
  ));
  return new;
end;
$$;

drop trigger if exists solves_after_insert_notify on solves;
create trigger solves_after_insert_notify after insert on solves
  for each row execute function on_solve_notify();

-- Schedule LeetCode sync every 30 min
select cron.schedule(
  'leetcode-sync-poll',
  '*/30 * * * *',
  $$select call_edge('leetcode-sync')$$
);
