// Sends Expo push to a user's group peers when they log a solve.
// Invoked via Postgres trigger -> net.http_post (see migration 0003).
// Honors profiles.notification_prefs: squad_solves (off = no push) and
// hard_only (only push for hard solves).

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

  // find peers: members of the actor's groups, minus self
  // (previously this notified every user in the app — see git history)
  const { data: myGroups } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', body.user_id);
  const groupIds = [...new Set((myGroups ?? []).map((r) => r.group_id))];
  if (groupIds.length === 0) return Response.json({ sent: 0 });

  const { data: peers } = await supabase
    .from('group_members')
    .select('user_id')
    .in('group_id', groupIds)
    .neq('user_id', body.user_id);
  const peerIds = [...new Set((peers ?? []).map((r) => r.user_id))];

  if (peerIds.length === 0) return Response.json({ sent: 0 });

  // Honor per-user notification preferences
  const { data: peerProfiles } = await supabase
    .from('profiles')
    .select('id, notification_prefs')
    .in('id', peerIds);

  const isHard = body.difficulty?.toLowerCase() === 'hard';
  const wantsPush = new Set(
    (peerProfiles ?? [])
      .filter((p) => {
        const prefs = p.notification_prefs ?? {};
        if (prefs.squad_solves === false) return false;
        if (prefs.hard_only === true && !isHard) return false;
        return true;
      })
      .map((p) => p.id),
  );
  const recipientIds = peerIds.filter((id) => wantsPush.has(id));
  if (recipientIds.length === 0) return Response.json({ sent: 0 });

  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('expo_token')
    .in('user_id', recipientIds);

  const messages = (tokens ?? []).map((t) => ({
    to: t.expo_token,
    sound: 'default',
    title: isHard ? `${name} solved a Hard 💀` : `${name} just locked in`,
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
