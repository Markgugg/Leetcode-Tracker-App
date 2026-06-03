// Sends Expo push to a user's group peers when they log a solve.
// Invoked via Postgres trigger -> net.http_post (see migration 0003).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

interface Payload {
  solve_id: string;
  user_id: string;
  problem_title: string;
  difficulty: string;
}

Deno.serve(async (req) => {
  const body: Payload = await req.json();
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // who's the actor
  const { data: actor } = await supabase
    .from('profiles')
    .select('username, display_name')
    .eq('id', body.user_id)
    .maybeSingle();
  const name = actor?.display_name ?? actor?.username ?? 'A friend';

  // find peers: anyone sharing a group, minus self
  const { data: peers } = await supabase
    .from('group_members')
    .select('user_id, group_id')
    .neq('user_id', body.user_id);
  const peerIds = [...new Set((peers ?? []).map((r) => r.user_id))];

  if (peerIds.length === 0) return Response.json({ sent: 0 });

  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('expo_token')
    .in('user_id', peerIds);

  const messages = (tokens ?? []).map((t) => ({
    to: t.expo_token,
    sound: 'default',
    title: `${name} just locked in`,
    body: `solved ${body.problem_title} (${body.difficulty})`,
    data: { solve_id: body.solve_id },
  }));

  if (messages.length === 0) return Response.json({ sent: 0 });

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });

  return Response.json({ sent: messages.length });
});
