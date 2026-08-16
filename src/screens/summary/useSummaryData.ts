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
  // PostgREST caps an unbounded select at 1000 rows; the catalog is larger than
  // that once the full problem set is seeded, and a truncated catalog would
  // quietly deflate every coverage percentage on this screen.
  const { data, error } = await sb
    .from('problems')
    .select('slug, title, difficulty, tags, is_premium')
    .range(0, 9999);
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

export interface PeerSolve {
  slug: string;
  /** `YYYY-MM-DD` — needed so the median follows the radar's range control. */
  date: string;
}

export interface CrewPayload {
  groupId: string | null;
  groupName: string | null;
  members: CrewMemberStat[];
  /** Every crew member's solves, all time — feeds the radar median. */
  peerSolves: Record<string, PeerSolve[]>;
}

async function fetchCrew(userId: string, weekStart: string): Promise<CrewPayload> {
  const empty: CrewPayload = { groupId: null, groupName: null, members: [], peerSolves: {} };

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
  const peerSolves: Record<string, PeerSolve[]> = {};
  for (const row of (solves ?? []) as any[]) {
    if (row.solved_date >= weekStart) weekCount.set(row.user_id, (weekCount.get(row.user_id) ?? 0) + 1);
    (peerSolves[row.user_id] ??= []).push({ slug: row.problem_slug, date: row.solved_date });
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
    peerSolves,
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
  /** Number of distinct seeded tags in the catalog. */
  topicCount: number;
  /** Distinct catalog problems solved, per range (the radar card's subtitle). */
  solvedByRange: Record<TopicRange, number>;
  /** The eight §4 axes (all time). */
  radar: RadarAxisStat[];
  /** The same eight axes per range — the radar card morphs between them. */
  radarByRange: Record<TopicRange, RadarAxisStat[]>;
  /** Crew median per axis, same order — `null` when there is no crew. */
  radarMedian: number[] | null;
  /** Crew median per range, same order. */
  medianByRange: Record<TopicRange, number[] | null>;
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
    const slugsWeek = new Set<string>();
    const slugsMonth = new Set<string>();
    const monthStart = isoDate(new Date(today.getFullYear(), today.getMonth(), 1));

    /* trailing 90 days — the Trends baseline (mirrors the `user_trends` view). */
    const windowStart = isoDate(addDays(today, -89));
    const tr = { c: 0, m: 0, h: 0, days: new Set<string>() };
    const wk = { c: 0, m: 0, h: 0, days: new Set<string>() };

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
        if (s.solved_date >= windowStart) {
          tr.c += 1;
          if (p.difficulty === 'medium') tr.m += 1;
          if (p.difficulty === 'hard') tr.h += 1;
          tr.days.add(s.solved_date);
          if (s.solved_date >= weekStart) {
            wk.c += 1;
            if (p.difficulty === 'medium') wk.m += 1;
            if (p.difficulty === 'hard') wk.h += 1;
            wk.days.add(s.solved_date);
          }
        }
      }
      if (s.solved_date >= monthStart) slugsMonth.add(s.problem_slug);

      if (s.solved_date >= weekStart) {
        slugsWeek.add(s.problem_slug);
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

    /* --- §4 radar, per range (the card's segmented control morphs between
           these three polygons) --- */
    const radarFrom = (counts: Map<string, number>): RadarAxisStat[] =>
      RADAR_AXES.map(({ label, tag }) => {
        const total = tagTotal.get(tag) ?? 0;
        const solved = counts.get(tag) ?? 0;
        const pct = total > 0 ? solved / total : 0;
        return { label, tag, solved, total, pct, value: axisValue(pct) };
      });

    const radar = radarFrom(tagSolved);
    const radarByRange: Record<TopicRange, RadarAxisStat[]> = {
      week: radarFrom(tagSolvedWeek),
      month: radarFrom(tagSolvedMonth),
      all: radar,
    };

    const thinnestOf = (axes: RadarAxisStat[]) =>
      axes.length ? axes.reduce((lo, a) => (a.value < lo.value ? a : lo), axes[0]) : null;
    const thinnest = thinnestOf(radar);

    /* --- crew median polygon, also per range --- */
    const peerSolves = crewQ.data?.peerSolves ?? {};
    const peerIds = Object.keys(peerSolves).filter((id) => id !== userId);

    const medianFor = (since: string | null): number[] | null => {
      if (peerIds.length === 0) return null;
      return RADAR_AXES.map(({ tag }) => {
        const total = tagTotal.get(tag) ?? 0;
        if (total === 0) return 0.04;
        const vals = peerIds.map((id) => {
          const seen = new Set<string>();
          for (const r of peerSolves[id]) if (!since || r.date >= since) seen.add(r.slug);
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
    };

    const radarMedian = medianFor(null);
    const medianByRange: Record<TopicRange, number[] | null> = {
      week: medianFor(weekStart),
      month: medianFor(monthStart),
      all: radarMedian,
    };

    const solvedByRange: Record<TopicRange, number> = {
      week: slugsWeek.size,
      month: slugsMonth.size,
      all: solvedSlugs.size,
    };

    /* --- Trends fallback (§3.6.6) ------------------------------------- *
     * `user_trends` is the source of truth, but it only exists once
     * migration 0026 is applied and it is empty for a brand-new account.
     * The same four metrics are cheap to compute from the solves we already
     * hold, so the card is never blank when there IS data to show.        */
    const round1 = (v: number) => Math.round(v * 10) / 10;
    const localTrends: TrendRow[] =
      tr.c === 0
        ? []
        : (
            [
              ['solves_week', 'Solves/week', 'count', wk.c, (tr.c * 7) / 90, 1],
              [
                'medium_share',
                'Medium share',
                'pct',
                wk.c ? (100 * wk.m) / wk.c : 0,
                tr.c ? (100 * tr.m) / tr.c : 0,
                2,
              ],
              [
                'hard_share',
                'Hard share',
                'pct',
                wk.c ? (100 * wk.h) / wk.c : 0,
                tr.c ? (100 * tr.h) / tr.c : 0,
                3,
              ],
              ['active_days', 'Active days', 'count', wk.days.size, (tr.days.size * 7) / 90, 4],
            ] as const
          ).map(([metric, label, unit, cur, base, order]) => ({
            metric: metric as string,
            label: label as string,
            unit: unit as 'count' | 'pct',
            current_value: round1(cur as number),
            baseline_value: round1(base as number),
            direction: (cur as number) >= (base as number) ? ('up' as const) : ('down' as const),
            sort_order: order as number,
          }));

    /* --- Next up (§3.6.5) ---------------------------------------------- *
     * A real recommendation: an unsolved, non-premium catalog problem in the
     * weakest topic the user has. Two guards learned from the data:
     *   • topics with fewer than 4 catalog problems are ignored as "weakest"
     *     (a 1-problem tag is 0% forever and would win every time);
     *   • picks round-robin across the weakest topics, so the reroll button
     *     offers a different area rather than 24 problems from one tag.      */
    const MIN_TOPIC_SIZE = 4;
    const coverageOf = new Map(
      topics.filter((t) => t.total >= MIN_TOPIC_SIZE).map((t) => [t.tag, t.pct] as const),
    );
    const axisLabel = new Map(RADAR_AXES.map((a) => [a.tag, a.label]));
    const DIFF_RANK: Record<Difficulty, number> = { medium: 0, easy: 1, hard: 2 };

    const candidates = problems
      .filter((p) => !p.is_premium && !solvedSlugs.has(p.slug) && p.tags.length > 0)
      .map((p) => {
        // the problem's own weakest tag — what solving it would actually grow
        const tag = p.tags.reduce((lo, t) =>
          (coverageOf.get(t) ?? 1) < (coverageOf.get(lo) ?? 1) ? t : lo,
        );
        return {
          problem: p,
          tag,
          topicLabel: axisLabel.get(tag) ?? tag,
          coverage: coverageOf.get(tag) ?? 1,
          estimate: ESTIMATE_MIN[p.difficulty],
        };
      })
      .sort(
        (a, b) =>
          a.coverage - b.coverage ||
          DIFF_RANK[a.problem.difficulty] - DIFF_RANK[b.problem.difficulty] ||
          a.problem.title.localeCompare(b.problem.title),
      );

    const byTag = new Map<string, typeof candidates>();
    for (const c of candidates) {
      const list = byTag.get(c.tag);
      if (list) list.push(c);
      else byTag.set(c.tag, [c]);
    }
    // Map preserves insertion order, and `candidates` is already weakest-first,
    // so the tag order below is weakest topic first.
    const groups = Array.from(byTag.values());
    const ordered: typeof candidates = [];
    for (let round = 0; ordered.length < 24 && round < 24; round++) {
      let added = false;
      for (const g of groups) {
        if (round < g.length) {
          ordered.push(g[round]);
          added = true;
          if (ordered.length >= 24) break;
        }
      }
      if (!added) break;
    }

    const picks: NextUpPick[] = ordered.map((c, i) => ({
      ...c,
      reason:
        i === 0
          ? `${c.topicLabel} is your thinnest area at ${Math.round(c.coverage * 100)}% — this is the next one you haven't touched.`
          : `Grows ${c.topicLabel}, where you're at ${Math.round(c.coverage * 100)}%. You haven't solved this one yet.`,
    }));

    return {
      goals,
      week: { volume, medPlus, days, points, attempts: volume },
      weekDays,
      topics,
      topicsByRange,
      totalSolved: solvedSlugs.size,
      totalProblems: problems.length,
      topicCount: tagTotal.size,
      solvedByRange,
      radar,
      radarByRange,
      radarMedian,
      medianByRange,
      thinnest,
      localTrends,
      picks,
    };
  }, [problems, solves, profile, crewQ.data, weekStart, monday, today, userId]);

  const { localTrends, ...summary } = derived;
  const viewTrends = trendsQ.data ?? [];
  // The view wins when it has rows; the local computation is the fallback for
  // "migration 0026 not applied yet" and for the first render after sign-in.
  const trends = viewTrends.length > 0 ? viewTrends : localTrends;

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
    trends,
    crew: crewQ.data ?? { groupId: null, groupName: null, members: [], peerSolves: {} },
    ...summary,
  };
}
