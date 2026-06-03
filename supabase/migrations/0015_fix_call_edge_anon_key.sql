-- Switch call_edge to use anon key instead of service_role key.
-- Edge functions use Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') internally
-- for their own Supabase client — the caller only needs anon-level auth.
-- This removes the service_role key from the database entirely.

create or replace function call_edge(p_function text, p_payload jsonb default '{}'::jsonb)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare
  v_url text := 'https://thitiplojaobtcimatfi.supabase.co/functions/v1/' || p_function;
  v_key text := 'sb_publishable_a2hDjTv1KNyeKO6auiPE6g_mwFRWLI7';
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
