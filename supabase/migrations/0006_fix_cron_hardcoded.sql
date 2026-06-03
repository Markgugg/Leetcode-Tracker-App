-- Replace call_edge() config approach with hardcoded URLs (Supabase blocks custom GUCs).
-- Run after 0003_cron_and_webhooks.sql.

create extension if not exists pg_net with schema extensions;

-- Hardcoded config
create or replace function call_edge(p_function text, p_payload jsonb default '{}'::jsonb)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare
  v_url text := 'https://thitiplojaobtcimatfi.supabase.co/functions/v1/' || p_function;
  v_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoaXRpcGxvamFvYnRjaW1hdGZpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTIyNjcwMSwiZXhwIjoyMDk0ODAyNzAxfQ.cfKRQJC1Qi9D2YhgvzcxfvIRUoBR3JEa2gHjbx6jeMg';
begin
  return (
    select net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_key,
        'Content-Type', 'application/json'
      ),
      body := p_payload
    )
  );
end;
$$;

-- Drop old cron jobs and recreate
select cron.unschedule('leetcode-sync-poll');
select cron.unschedule('weekly-streaks');
select cron.unschedule('daily-decay');

select cron.schedule('leetcode-sync-poll', '*/30 * * * *',
  $$select public.call_edge('leetcode-sync')$$);

select cron.schedule('weekly-streaks', '5 0 * * 1',
  $$select public.recompute_weekly_streaks()$$);

select cron.schedule('daily-decay', '5 0 * * *',
  $$select public.decay_daily_streaks()$$);

select cron.schedule('streak-warning', '0 20 * * 0',
  $$select public.call_edge('notify-streak-warning')$$);
