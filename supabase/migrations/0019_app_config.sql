-- App config table: stores values that call_edge needs.
-- No superuser required. Insert your keys once via SQL editor:
--
--   INSERT INTO _app_config VALUES ('anon_key',      'sb_publishable_xxxx')
--     ON CONFLICT (key) DO UPDATE SET value = excluded.value;
--   INSERT INTO _app_config VALUES ('supabase_url',  'https://thitiplojaobtcimatfi.supabase.co')
--     ON CONFLICT (key) DO UPDATE SET value = excluded.value;

create table if not exists _app_config (
  key   text primary key,
  value text not null
);

-- Only the service role can read/write this table
alter table _app_config enable row level security;
-- No RLS policies = only service_role (edge functions) can access it

-- Update call_edge to read from _app_config instead of current_setting
create or replace function call_edge(p_function text, p_payload jsonb default '{}'::jsonb)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare
  v_url text;
  v_key text;
begin
  select value into v_key from _app_config where key = 'anon_key';
  select value into v_url from _app_config where key = 'supabase_url';

  if v_key is null then
    raise exception '_app_config missing anon_key. Run the INSERT statements from migration 0019.';
  end if;
  if v_url is null then
    raise exception '_app_config missing supabase_url. Run the INSERT statements from migration 0019.';
  end if;

  return (
    select net.http_post(
      url     := v_url || '/functions/v1/' || p_function,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_key,
        'Content-Type',  'application/json'
      ),
      body    := p_payload
    )
  );
end;
$$;
