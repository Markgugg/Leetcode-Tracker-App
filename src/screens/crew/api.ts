/** Crew data access + the pure helpers the screen renders from (§3.8). */

import { supabase } from '@/lib/supabase';
import { clamp } from '@/theme';
import type { Crew, CrewData, Member, RawMessage, RawSolve, ReactionRow } from './types';

/** Messages fetched per page. Small enough that a cold open is one round trip. */
export const PAGE_SIZE = 30;

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

/** Monday of the current week as `YYYY-MM-DD` (matches date_trunc('week')). */
export function mondayISO(d = new Date()) {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7; // Mon = 0
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

export function weekNumber(createdAt: string) {
  const ms = Date.now() - new Date(createdAt).getTime();
  return Math.max(1, Math.floor(ms / (7 * 24 * 3600 * 1000)) + 1);
}

export function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.max(0, s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** `14:32` in the user's locale, for the tail of a message group. */
export function clockTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** `Today` / `Yesterday` / `Mar 4` — the day-divider label. */
export function dayLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const today = startOf(new Date());
  const diff = Math.round((today - startOf(d)) / 86_400_000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString([], { weekday: 'long' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** `YYYY-M-D` bucket key, used to decide where a day divider goes. */
export function dayKey(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'x';
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export const frac = (v: number, goal: number) => (goal > 0 ? clamp(v / goal) : 1);

/** The status line under a standings name — §3.8 / screenshot 12. */
export function statusLine(m: Member) {
  const closed =
    m.volume >= m.volumeGoal && m.medPlus >= m.difficultyGoal && m.days >= m.daysGoal;
  if (closed) return `Rings closed · ${m.volume} solved`;
  if (m.volume === 0) return 'Quiet this week';
  const medBehind = m.difficultyGoal - m.medPlus;
  const dayBehind = m.daysGoal - m.days;
  if (medBehind > 0 && m.completion >= 0.5) {
    return `${medBehind} medium${medBehind === 1 ? '' : 's'} behind`;
  }
  if (dayBehind > 0 && m.completion < 0.4) return 'Streak at risk';
  if (m.completion >= 0.6) return 'On pace';
  const left = Math.max(0, m.volumeGoal - m.volume);
  return `${left} solve${left === 1 ? '' : 's'} to go`;
}

export const nameOf = (
  p: { username?: string | null; display_name?: string | null } | null | undefined,
) => p?.display_name ?? p?.username ?? '?';

/* ------------------------------------------------------------------ */
/* Fetchers                                                            */
/* ------------------------------------------------------------------ */

export async function fetchCrew(userId: string): Promise<CrewData | null> {
  const [{ data: memberships }, { data: me }] = await Promise.all([
    supabase
      .from('group_members')
      .select('group_id, groups(id, name, invite_code, created_at)')
      .eq('user_id', userId),
    supabase.from('profiles').select('active_group_id').eq('id', userId).maybeSingle(),
  ]);

  const crews: Crew[] = ((memberships ?? []) as any[])
    .map((r) => r.groups)
    .filter(Boolean)
    .map((g: any) => ({
      id: g.id,
      name: g.name,
      invite_code: g.invite_code,
      created_at: g.created_at,
    }));
  if (!crews.length) return null;

  const activeId = (me as any)?.active_group_id as string | null | undefined;
  const active = crews.find((c) => c.id === activeId) ?? crews[0];

  const { data: rows } = await supabase
    .from('group_members')
    .select(
      'user_id, role, profiles(username, display_name, avatar_url, volume_goal, difficulty_goal, days_goal)',
    )
    .eq('group_id', active.id);

  const memberIds = ((rows ?? []) as any[]).map((r) => r.user_id);

  const { data: stats } = memberIds.length
    ? await supabase
        .from('weekly_stats')
        .select('user_id, volume, med_plus, active_days, volume_goal, difficulty_goal, days_goal')
        .in('user_id', memberIds)
        .eq('week_start', mondayISO())
    : { data: [] as any[] };

  const byUser = new Map<string, any>();
  for (const r of (stats ?? []) as any[]) byUser.set(r.user_id, r);

  const members: Member[] = ((rows ?? []) as any[]).map((r) => {
    const p = r.profiles ?? {};
    const w = byUser.get(r.user_id);
    const volumeGoal = w?.volume_goal ?? p.volume_goal ?? 10;
    const difficultyGoal = w?.difficulty_goal ?? p.difficulty_goal ?? 3;
    const daysGoal = w?.days_goal ?? p.days_goal ?? 5;
    const volume = w?.volume ?? 0;
    const medPlus = w?.med_plus ?? 0;
    const days = w?.active_days ?? 0;
    const completion =
      (frac(volume, volumeGoal) + frac(medPlus, difficultyGoal) + frac(days, daysGoal)) / 3;
    return {
      user_id: r.user_id,
      role: r.role,
      username: p.username ?? '—',
      display_name: p.display_name ?? null,
      avatar_url: p.avatar_url ?? null,
      volume,
      medPlus,
      days,
      volumeGoal,
      difficultyGoal,
      daysGoal,
      completion,
    };
  });

  // ⚠️ Ranked on ring completion, not points (§3.8).
  members.sort((a, b) => b.completion - a.completion || b.volume - a.volume);

  return { crews, active, members };
}

/**
 * One page of chat, newest first. `before` is the `created_at` of the oldest
 * row already loaded — keyset pagination, so inserts arriving mid-scroll can't
 * shift a window the way OFFSET would.
 */
export async function fetchMessagePage(
  groupId: string,
  before?: string | null,
): Promise<RawMessage[]> {
  let q = supabase
    .from('group_messages')
    .select('id, user_id, content, created_at, profiles(username, display_name, avatar_url)')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as RawMessage[];
}

export async function fetchMilestones(memberIds: string[]): Promise<RawSolve[]> {
  if (!memberIds.length) return [];
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from('solves')
    .select(
      'id, user_id, solved_at, points, problems(title, difficulty), profiles(username, display_name, avatar_url)',
    )
    .in('user_id', memberIds)
    .gte('solved_at', since)
    .order('solved_at', { ascending: false })
    .limit(50);
  return ((data ?? []) as unknown as RawSolve[]).filter(
    (s) => (s.problems?.difficulty ?? '').toLowerCase() === 'hard',
  );
}

export async function fetchReactions(solveIds: string[]): Promise<ReactionRow[]> {
  if (!solveIds.length) return [];
  const { data } = await supabase
    .from('solve_reaction_counts')
    .select('solve_id, emoji, count, reacted_by_me')
    .in('solve_id', solveIds);
  return (data ?? []) as unknown as ReactionRow[];
}
