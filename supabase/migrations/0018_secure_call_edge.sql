-- Remove hardcoded anon key from call_edge.
-- Store your anon key once via Supabase SQL editor:
--   ALTER DATABASE postgres SET app.anon_key = 'your-supabase-anon-key';
-- (Find it: Dashboard → Project Settings → API → anon / public key)

create or replace function call_edge(p_function text, p_payload jsonb default '{}'::jsonb)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare
  v_url text := current_setting('app.supabase_url', true) || '/functions/v1/' || p_function;
  v_key text := current_setting('app.anon_key', true);
begin
  if v_key is null or v_key = '' then
    raise exception 'app.anon_key not set. Run: ALTER DATABASE postgres SET app.anon_key = ''<your-anon-key>'';';
  end if;
  if v_url is null or v_url like '/functions/v1/%' then
    raise exception 'app.supabase_url not set. Run: ALTER DATABASE postgres SET app.supabase_url = ''https://<project>.supabase.co'';';
  end if;
  return (
    select net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_key,
        'Content-Type',  'application/json'
      ),
      body    := p_payload
    )
  );
end;
$$;
