// Sunday streak warning: fires at 8pm local (approximated as 8pm UTC for MVP).
// Sends push to every user who hasn't hit their weekly quota yet.
// Schedule: pg_cron `0 20 * * 0` (Sundays 20:00 UTC)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Get current week start (Monday)
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  weekStart.setHours(0, 0, 0, 0);

  // Count solves per user this week
  const { data: solves } = await supabase
    .from('solves')
    .select('user_id')
    .gte('solved_at', weekStart.toISOString());

  const counts = new Map<string, number>();
  for (const r of solves ?? []) {
    counts.set(r.user_id, (counts.get(r.user_id) ?? 0) + 1);
  }

  // Get all users + their group quota
  const { data: members } = await supabase
    .from('group_members')
    .select('user_id, groups(weekly_quota)');

  const quotas = new Map<string, number>();
  for (const m of members ?? [] as any[]) {
    const q = m.groups?.weekly_quota ?? 5;
    quotas.set(m.user_id, Math.max(quotas.get(m.user_id) ?? 0, q));
  }

  // Find users who haven't hit quota. Personal weekly_goal (onboarding
  // commitment) is the floor; a stricter group quota overrides it upward.
  // Users who turned off streak warnings are skipped.
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, weekly_goal, notification_prefs');
  const behind: string[] = [];
  for (const p of (allProfiles ?? []) as any[]) {
    if (p.notification_prefs?.streak_warnings === false) continue;
    const done = counts.get(p.id) ?? 0;
    const quota = Math.max(quotas.get(p.id) ?? 0, p.weekly_goal ?? 5);
    quotas.set(p.id, quota);
    if (done < quota) behind.push(p.id);
  }

  if (behind.length === 0) return Response.json({ sent: 0 });

  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('expo_token, user_id')
    .in('user_id', behind);

  const messages = (tokens ?? []).map((t) => {
    const done = counts.get(t.user_id) ?? 0;
    const quota = quotas.get(t.user_id) ?? 5;
    const need = quota - done;
    return {
      to: t.expo_token,
      sound: 'default',
      title: need === 1 ? '1 problem to save your streak 🔥' : `${need} problems to save your streak 🔥`,
      body: 'Streak resets at midnight. Lock in.',
      data: { type: 'streak_warning' },
    };
  });

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });

  return Response.json({ sent: messages.length });
});
