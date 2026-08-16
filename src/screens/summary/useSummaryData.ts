/**
 * Summary tab data layer (§3.6, §4, §2).
 *
 * Everything the home tab renders is derived here from five queries:
 *   problems catalog · my profile (ring goals) · my solves · user_trends · crew
 *
 * NOTE on typing: `src/types/database.ts` is a hand-written `Database` type that
 * predates migrations 0020–0026 (ring goals on `profiles`, the `user_trends`
 * view, `profiles.active_group_id`). That file is shared with every other
 * screen, so rather than edit it here the new columns/views are read through
 * `sb`, an untyped handle onto the same client, and hand-typed on the way out.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { clamp, deriveGoals } from '@/theme';

const sb = supabase as unknown as SupabaseClient;

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface ProblemRow {
  slug: string;
  title: string;
  difficulty: Difficulty;
  tags: string[];
  is_premium: boolean;
}

export interface SolveRow {
  id: string;
  problem_slug: string;
  solved_date: string;
  points: number;
}

export interface TrendRow {
  metric: string;
  label: string;
  unit: 'count' | 'pct';
  current_value: number;
  baseline_value: number;
  direction: 'up' | 'down';
  sort_order: number;
}

export interface Goals {
  volume: number;
  difficulty: number;
  streak: number;
}

export interface DayCell {
  /** `YYYY-MM-DD` */
  date: string;
  /** M T W T F S S */
  letter: string;
  solves: number;
  medPlus: number;
  isToday: boolean;
  isFuture: boolean;
}

export interface TopicStat {
  /** Seeded catalog tag, e.g. `Array / String`. */
  tag: string;
  solved: number;
  total: number;
  /** solved / total, 0..1 */
  pct: number;
}

export type TopicRange = 'week' | 'month' | 'all';

export interface RadarAxisStat {
  /** Short display label, e.g. `Hash Map`. */
  label: string;
  /** Seeded catalog tag it maps to. */
  tag: string;
  solved: number;
  total: number;
  /** raw coverage 0..1 */
  pct: number;
  /** plotted value: clamp(pct / 0.55, 0.04, 1) */
  value: number;
}

export interface CrewMemberStat {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  volume: number;
  goal: number;
  isMe: boolean;
}

export interface NextUpPick {
  problem: ProblemRow;
  /** Seeded tag the pick was chosen for. */
  tag: string;
  /** Short radar label for that tag, when it is one of the eight. */
  topicLabel: string;
  /** Coverage of that topic, 0..1. */
  coverage: number;
  /** Minutes. */
  estimate: number;
  reason: string;
}

/* ------------------------------------------------------------------ */
/* Date helpers — weeks start Monday, in the device's local timezone.  */
/* `solves.solved_date` is a plain `date` column, so all comparisons    */
/* are string comparisons on `YYYY-MM-DD`.                              */
/* ------------------------------------------------------------------ */

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function mondayOf(ref: Date = new Date()): Date {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const dow = (d.getDay() + 6) % 7; // 0 = Monday … 6 = Sunday
  d.setDate(d.getDate() - dow);
  return d;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

/** ISO week number — the "Week 12" in the ring sheet header. */
export function isoWeekNumber(ref: Date = new Date()): number {
  const d = new Date(Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/* ------------------------------------------------------------------ */
/* §4 — the eight radar axes and the seeded tags they map to           */
/* ------------------------------------------------------------------ */

export const RADAR_AXES: { label: string; tag: string }[] = [
  { label: 'Arrays', tag: 'Array / String' },
  { label: 'Hash Map', tag: 'Hash Map / Set' },
  { label: 'Trees', tag: 'Binary Tree - DFS' },
  { label: 'Graphs', tag: 'Graphs - DFS' },
  { label: 'Dyn Prog', tag: 'DP - 1D' },
  { label: 'Bin Search', tag: 'Binary Search' },
  { label: 'Stack', tag: 'Stack' },
  { label: '2 Ptr', tag: 'Two Pointers' },
];

/** "55% coverage of a topic is a full axis" (§4). */
export const AXIS_DIVISOR = 0.55;

export const axisValue = (pct: number) => clamp(pct / AXIS_DIVISOR, 0.04, 1);

/** Rough time estimate by difficulty — the third chip on the Next-up card. */
export const ESTIMATE_MIN: Record<Difficulty, number> = { easy: 15, medium: 25, hard: 40 };

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

async function fetchProblems(): Promise<ProblemRow[]> {
  const { data, error } = await sb
    .from('problems')
    .select('slug, title, difficulty, tags, is_premium');
  if (error) throw error;
  return (data ?? []) as ProblemRow[];
}

export interface ProfileRow {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  volume_goal: number | null;
  difficulty_goal: number | null;
  days_goal: number | null;
  active_group_id: string | null;
}

async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await sb
    .from('profiles')
    .select(
      'id, username, display_name, avatar_url, volume_goal, difficulty_goal, days_goal, active_group_id',
    )
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as ProfileRow) ?? null;
}

async function fetchSolves(userId: string): Promise<SolveRow[]> {
  const { data, error } = await sb
    .from('solves')
    .select('id, problem_slug, solved_date, points')
    .eq('user_id', userId)
    .order('solved_date', { ascending: false })
    .limit(5000);
  if (error) throw error;
  return (data ?? []) as SolveRow[];
}

async function fetchTrends(userId: string): Promise<TrendRow[]> {
  const { data, error } = await sb
    .from('user_trends')
    .select('metric, label, unit, current_value, baseline_value, direction, sort_order')
    .eq('user_id', userId)
    .order('sort_order');
  // The view ships in migration 0026; if it is not applied yet the card just
  // does not render rather than taking the screen down.
  if (error) return [];
  return (data ?? []) as TrendRow[];
}

export interface CrewPayload {
  groupId: string | null;
  groupName: string | null;
  members: CrewMemberStat[];
  /** Every crew member's solved slugs, all time — feeds the radar median. */
  peerSlugs: Record<string, string[]>;
}

async function fetchCrew(userId: string, weekStart: string): Promise<CrewPayload> {
  const empty: CrewPayload = { groupId: null, groupName: null, members: [], peerSlugs: {} };

  const { data: memberships } = await sb
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId);
  const groupIds: string[] = (memberships ?? []).map((m: any) => m.group_id);
  if (groupIds.length === 0) return empty;

  // Multi-crew (migration 0023): open on `profiles.active_group_id` when it
  // points at a crew we are actually in, else the first membership.
  const { data: prof } = await sb
    .from('profiles')
    .select('active_group_id')
    .eq('id', userId)
    .maybeSingle();
  const active: string | null = (prof as any)?.active_group_id ?? null;
  const groupId = active && groupIds.includes(active) ? active : groupIds[0];

  const { data: group } = await sb.from('groups').select('id, name').eq('id', groupId).maybeSingle();

  const { data: peers } = await sb
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId);
  const peerIds: string[] = Array.from(
    new Set([userId, ...((peers ?? []).map((p: any) => p.user_id) as string[])]),
  );

  const { data: profiles } = await sb
    .from('profiles')
    .select('id, username, display_name, avatar_url, volume_goal')
    .in('id', peerIds);

  const { data: solves } = await sb
    .from('solves')
    .select('user_id, problem_slug, solved_date')
    .in('user_id', peerIds)
    .limit(8000);

  const weekCount = new Map<string, number>();
  const slugs: Record<string, string[]> = {};
  for (const row of (solves ?? []) as any[]) {
    if (row.solved_date >= weekStart) weekCount.set(row.user_id, (weekCount.get(row.user_id) ?? 0) + 1);
    (slugs[row.user_id] ??= []).push(row.problem_slug);
  }

  const members: CrewMemberStat[] = ((profiles ?? []) as any[])
    .map((p) => ({
      id: p.id as string,
      name: (p.display_name as string | null) ?? (p.username as string),
      username: p.username as string,
      avatarUrl: (p.avatar_url as string | null) ?? null,
      volume: weekCount.get(p.id) ?? 0,
      goal: (p.volume_goal as number | null) ?? 10,
      isMe: p.id === userId,
    }))
    .sort((a, b) => (a.isMe ? -1 : b.isMe ? 1 : b.volume / b.goal - a.volume / a.goal));

  return {
    groupId,
    groupName: (group as any)?.name ?? null,
    members,
    peerSlugs: slugs,
  };
}

/* ------------------------------------------------------------------ */
/* The hook                                                            */
/* ------------------------------------------------------------------ */

export interface SummaryData {
  isLoading: boolean;
  refetch: () => void;
  isRefetching: boolean;

  profile: ProfileRow | null;
  displayName: string;

  goals: Goals;
  /** This week's totals. */
  week: { volume: number; medPlus: number; days: number; points: number; attempts: number };
  weekStart: string;
  weekNumber: number;
  /** Seven cells, Monday → Sunday. */
  weekDays: DayCell[];

  /** All 24 seeded topics, sorted by coverage descending. */
  topics: TopicStat[];
  /** Same list scoped to the topic sheet's three ranges. */
  topicsByRange: Record<TopicRange, TopicStat[]>;
  totalSolved: number;
  totalProblems: number;
  /** The eight §4 axes. */
  radar: RadarAxisStat[];
  /** Crew median per axis, same order — `null` when there is no crew. */
  radarMedian: number[] | null;
  /** Lowest-value axis. */
  thinnest: RadarAxisStat | null;

  trends: TrendRow[];
  crew: CrewPayload;

  /** Ranked recommendations; the Next-up card walks this with the reroll button. */
  picks: NextUpPick[];
}

export function useSummaryData(userId: string): SummaryData {
  const today = useMemo(() => new Date(), []);
  const monday = useMemo(() => mondayOf(today), [today]);
  const weekStart = isoDate(monday);

  const problemsQ = useQuery({
    queryKey: ['problems-catalog'],
    queryFn: fetchProblems,
    staleTime: Infinity,
  });
  const profileQ = useQuery({
    queryKey: ['summary-profile', userId],
    queryFn: () => fetchProfile(userId),
    enabled: !!userId,
  });
  const solvesQ = useQuery({
    queryKey: ['summary-solves', userId],
    queryFn: () => fetchSolves(userId),
    enabled: !!userId,
  });
  const trendsQ = useQuery({
    queryKey: ['summary-trends', userId],
    queryFn: () => fetchTrends(userId),
    enabled: !!userId,
  });
  const crewQ = useQuery({
    queryKey: ['summary-crew', userId, weekStart],
    queryFn: () => fetchCrew(userId, weekStart),
    enabled: !!userId,
  });

  const problems = problemsQ.data ?? [];
  const solves = solvesQ.data ?? [];
  const profile = profileQ.data ?? null;

  const derived = useMemo(() => {
    const bySlug = new Map<string, ProblemRow>();
    for (const p of problems) bySlug.set(p.slug, p);

    const todayIso = isoDate(today);

    /* --- goals (§2) — stored on profiles, with the derivation as fallback --- */
    const volumeGoal = profile?.volume_goal ?? 10;
    const fallback = deriveGoals(volumeGoal);
    const goals: Goals = {
      volume: volumeGoal,
      difficulty: profile?.difficulty_goal ?? fallback.difficulty,
      streak: profile?.days_goal ?? fallback.streak,
    };

    /* --- this week --- */
    const perDay = new Map<string, { solves: number; medPlus: number }>();
    let volume = 0;
    let medPlus = 0;
    let points = 0;
    const solvedSlugs = new Set<string>();
    const tagSolved = new Map<string, number>();
    const tagSolvedWeek = new Map<string, number>();
    const tagSolvedMonth = new Map<string, number>();
    const monthStart = isoDate(new Date(today.getFullYear(), today.getMonth(), 1));

    for (const s of solves) {
      solvedSlugs.add(s.problem_slug);
      const p = bySlug.get(s.problem_slug);
      if (p) {
        for (const t of p.tags) {
          tagSolved.set(t, (tagSolved.get(t) ?? 0) + 1);
          if (s.solved_date >= monthStart)
            tagSolvedMonth.set(t, (tagSolvedMonth.get(t) ?? 0) + 1);
          if (s.solved_date >= weekStart) tagSolvedWeek.set(t, (tagSolvedWeek.get(t) ?? 0) + 1);
        }
      }

      if (s.solved_date >= weekStart) {
        const isMedPlus = p ? p.difficulty !== 'easy' : false;
        volume += 1;
        points += s.points ?? 0;
        if (isMedPlus) medPlus += 1;
        const cell = perDay.get(s.solved_date) ?? { solves: 0, medPlus: 0 };
        cell.solves += 1;
        if (isMedPlus) cell.medPlus += 1;
        perDay.set(s.solved_date, cell);
      }
    }

    const weekDays: DayCell[] = Array.from({ length: 7 }, (_, i) => {
      const date = isoDate(addDays(monday, i));
      const cell = perDay.get(date) ?? { solves: 0, medPlus: 0 };
      return {
        date,
        letter: DAY_LETTERS[i],
        solves: cell.solves,
        medPlus: cell.medPlus,
        isToday: date === todayIso,
        isFuture: date > todayIso,
      };
    });

    const days = weekDays.filter((d) => d.solves > 0).length;

    /* --- topic coverage over the seeded catalog --- */
    const tagTotal = new Map<string, number>();
    for (const p of problems) for (const t of p.tags) tagTotal.set(t, (tagTotal.get(t) ?? 0) + 1);

    const topicsFrom = (counts: Map<string, number>): TopicStat[] =>
      Array.from(tagTotal.entries())
        .map(([tag, total]) => {
          const solved = counts.get(tag) ?? 0;
          return { tag, solved, total, pct: total > 0 ? solved / total : 0 };
        })
        .sort((a, b) => b.pct - a.pct || a.tag.localeCompare(b.tag));

    const topics = topicsFrom(tagSolved);
    const topicsByRange: Record<TopicRange, TopicStat[]> = {
      week: topicsFrom(tagSolvedWeek),
      month: topicsFrom(tagSolvedMonth),
      all: topics,
    };

    /* --- §4 radar --- */
    const radar: RadarAxisStat[] = RADAR_AXES.map(({ label, tag }) => {
      const total = tagTotal.get(tag) ?? 0;
      const solved = tagSolved.get(tag) ?? 0;
      const pct = total > 0 ? solved / total : 0;
      return { label, tag, solved, total, pct, value: axisValue(pct) };
    });

    const thinnest = radar.length
      ? radar.reduce((lo, a) => (a.value < lo.value ? a : lo), radar[0])
      : null;

    /* --- crew median polygon --- */
    const peerSlugs = crewQ.data?.peerSlugs ?? {};
    const peerIds = Object.keys(peerSlugs).filter((id) => id !== userId);
    let radarMedian: number[] | null = null;
    if (peerIds.length > 0) {
      radarMedian = RADAR_AXES.map(({ tag }) => {
        const total = tagTotal.get(tag) ?? 0;
        if (total === 0) return 0.04;
        const vals = peerIds.map((id) => {
          const seen = new Set(peerSlugs[id]);
          let n = 0;
          for (const slug of seen) {
            const p = bySlug.get(slug);
            if (p && p.tags.includes(tag)) n += 1;
          }
          return axisValue(n / total);
        });
        vals.sort((a, b) => a - b);
        const mid = Math.floor(vals.length / 2);
        return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
      });
    }

    /* --- Next up: unsolved problems in the thinnest topics first --- */
    const coverageOf = new Map(topics.map((t) => [t.tag, t.pct]));
    const axisLabel = new Map(RADAR_AXES.map((a) => [a.tag, a.label]));
    const DIFF_RANK: Record<Difficulty, number> = { medium: 0, easy: 1, hard: 2 };

    const picks: NextUpPick[] = problems
      .filter((p) => !p.is_premium && !solvedSlugs.has(p.slug) && p.tags.length > 0)
      .map((p) => {
        const tag = p.tags.reduce((lo, t) =>
          (coverageOf.get(t) ?? 1) < (coverageOf.get(lo) ?? 1) ? t : lo,
        );
        const coverage = coverageOf.get(tag) ?? 0;
        const label = axisLabel.get(tag) ?? tag;
        return {
          problem: p,
          tag,
          topicLabel: label,
          coverage,
          estimate: ESTIMATE_MIN[p.difficulty],
          reason: `${label} is your thinnest area at ${Math.round(coverage * 100)}% — this is the next one you haven't touched.`,
        };
      })
      .sort(
        (a, b) =>
          a.coverage - b.coverage ||
          DIFF_RANK[a.problem.difficulty] - DIFF_RANK[b.problem.difficulty] ||
          a.problem.title.localeCompare(b.problem.title),
      )
      .slice(0, 24);

    return {
      goals,
      week: { volume, medPlus, days, points, attempts: volume },
      weekDays,
      topics,
      topicsByRange,
      totalSolved: solvedSlugs.size,
      totalProblems: problems.length,
      radar,
      radarMedian,
      thinnest,
      picks,
    };
  }, [problems, solves, profile, crewQ.data, weekStart, monday, today, userId]);

  return {
    isLoading: problemsQ.isLoading || solvesQ.isLoading || profileQ.isLoading,
    isRefetching: solvesQ.isRefetching || crewQ.isRefetching,
    refetch: () => {
      void solvesQ.refetch();
      void profileQ.refetch();
      void trendsQ.refetch();
      void crewQ.refetch();
    },
    profile,
    displayName: profile?.display_name ?? profile?.username ?? '',
    weekStart,
    weekNumber: isoWeekNumber(today),
    trends: trendsQ.data ?? [],
    crew: crewQ.data ?? { groupId: null, groupName: null, members: [], peerSlugs: {} },
    ...derived,
  };
}
