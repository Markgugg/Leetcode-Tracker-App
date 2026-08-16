import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Defs,
  Line,
  LinearGradient as SvgGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/stores/auth';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import { GlassCard } from '@/components/GlassCard';
import { DoubleRing } from '@/components/Ring';
import { SettingsSheet } from '@/components/SettingsSheet';
import { useToast } from '@/components/Toast';
import { GemBadge } from '@/ranks/GemBadge';
import type { RankKey } from '@/ranks/ranks-data';
import {
  LEAGUES,
  TROPHY_GOLD,
  TROPHY_QUERY_KEYS,
  fetchProblems,
  fetchSolves,
  formatGain,
  formatTrophies,
  useTrophies,
  type League,
  type ProblemRow,
  type SolveRow,
  type TrophyEvent,
} from '@/lib/trophies';
import {
  EASE,
  clamp,
  colors,
  duration,
  heatmapRamp,
  pressed,
  radius,
  shadow,
  spacing,
  tabular,
  type,
} from '@/theme';
import type { Profile, Streak } from '@/types/database';

/* Migrations 0020–0026 add columns/views that src/types/database.ts (a shared
   file this screen does not own) does not describe. Those reads go through an
   untyped handle, and every one of them has a client-side fallback so the
   screen works whether or not the migrations have been applied. */
const sb = supabase as any;

/* ------------------------------------------------------------------ */
/* Topics — the 12 coverage bars (§5). Keys are the seeded catalog      */
/* strings from 0011_reseed_problems_lc75.sql, not the old guesses.     */
/* ------------------------------------------------------------------ */

const TOPICS = [
  { tag: 'Array / String', short: 'Arr', full: 'Arrays & Strings' },
  { tag: 'Hash Map / Set', short: 'Hash', full: 'Hash Map — Set' },
  { tag: 'Two Pointers', short: '2Pt', full: 'Two Pointers' },
  { tag: 'Binary Tree - DFS', short: 'Tree', full: 'Binary Tree — DFS' },
  { tag: 'Binary Search', short: 'BS', full: 'Binary Search' },
  { tag: 'Stack', short: 'Stk', full: 'Stack' },
  { tag: 'Intervals', short: 'Int', full: 'Intervals' },
  { tag: 'Graphs - DFS', short: 'Gph', full: 'Graphs — DFS' },
  { tag: 'DP - 1D', short: 'DP', full: 'Dynamic Programming' },
  { tag: 'Trie', short: 'Trie', full: 'Trie' },
  { tag: 'Bit Manipulation', short: 'Bit', full: 'Bit Manipulation' },
  { tag: 'Advanced Graphs', short: 'AGr', full: 'Advanced Graphs' },
] as const;

const AWARD_DEFS = [
  { key: 'day_streak', label: 'Day streak', target: 7, color: '#FF9F0A' },
  { key: 'weeks_closed', label: 'Weeks closed', target: 4, color: '#A2F73D' },
  { key: 'solved', label: 'Problems solved', target: 100, color: '#7B61FF' },
  { key: 'hard_solved', label: 'Hard solved', target: 10, color: '#FA114F' },
  { key: 'perfect_weeks', label: 'Perfect weeks', target: 1, color: '#00D3F2' },
  { key: 'points', label: 'Points', target: 500, color: '#FFD426' },
] as const;

/* Gem ranks (src/ranks) are the one and only rank system on this screen. */

const NOTIF_PREF_KEY = 'you.notifications';

/* ------------------------------------------------------------------ */
/* Date helpers                                                        */
/* ------------------------------------------------------------------ */

const iso = (d: Date) => {
  const c = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return c.toISOString().slice(0, 10);
};

/** Monday 00:00 of the week containing `d`. */
function weekStart(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  const day = (c.getDay() + 6) % 7; // Mon = 0
  c.setDate(c.getDate() - day);
  return c;
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

interface TopicStat {
  tag: string;
  short: string;
  full: string;
  solved: number;
  total: number;
  pct: number;
}

interface WeekRow {
  start: string;
  volume: number;
  medPlus: number;
  activeDays: number;
  volumeGoal: number;
  difficultyGoal: number;
  daysGoal: number;
  closed: boolean;
  /** The week the user is standing in. Not yet closed, not missed either. */
  inProgress: boolean;
}

interface SolveStats {
  totalSolved: number;
  points: number;
  hardSolved: number;
  medPlus: number;
  topics: TopicStat[];
  byDate: Map<string, number>;
  perWeek: Map<string, { volume: number; medPlus: number; days: Set<string> }>;
}

/**
 * One pass over solves ⋈ problems — everything on this screen but the heatmap
 * merge and the crew median comes out of here.
 *
 * It takes rows rather than fetching them. Both inputs are already in the query
 * cache under the keys `useTrophies`/`useSummaryData` share
 * (`summary-solves` / `problems-catalog`); the screen used to re-select the
 * whole solve history and the whole catalog under `you-stats`, so opening the
 * You tab downloaded every solve twice. Premium problems are filtered out here,
 * exactly where the old `.eq('is_premium', false)` did it, so every coverage
 * denominator is unchanged.
 */
function deriveSolveStats(allSolves: readonly SolveRow[], catalog: readonly ProblemRow[]): SolveStats {
  const solves = allSolves;
  const problems = catalog.filter((p) => !p.is_premium);
  const bySlug = new Map(problems.map((p) => [p.slug, p]));

  const seen = new Set<string>();
  const uniq: SolveRow[] = [];
  for (const s of solves) {
    if (!seen.has(s.problem_slug)) {
      seen.add(s.problem_slug);
      uniq.push(s);
    }
  }

  const topics: TopicStat[] = TOPICS.map((t) => {
    const total = problems.filter((p) => p.tags?.[0] === t.tag).length;
    const solved = uniq.filter((s) => bySlug.get(s.problem_slug)?.tags?.[0] === t.tag).length;
    return { tag: t.tag, short: t.short, full: t.full, solved, total, pct: total ? solved / total : 0 };
  }).filter((t) => t.total > 0);

  const byDate = new Map<string, number>();
  const perWeek = new Map<string, { volume: number; medPlus: number; days: Set<string> }>();
  let points = 0;
  let hardSolved = 0;
  let medPlus = 0;

  for (const s of solves) {
    points += s.points ?? 0;
    byDate.set(s.solved_date, (byDate.get(s.solved_date) ?? 0) + 1);

    const diff = bySlug.get(s.problem_slug)?.difficulty;
    const isMedPlus = diff === 'medium' || diff === 'hard';
    if (diff === 'hard') hardSolved++;
    if (isMedPlus) medPlus++;

    const wk = iso(weekStart(new Date(`${s.solved_date}T00:00:00`)));
    const entry = perWeek.get(wk) ?? { volume: 0, medPlus: 0, days: new Set<string>() };
    entry.volume++;
    if (isMedPlus) entry.medPlus++;
    entry.days.add(s.solved_date);
    perWeek.set(wk, entry);
  }

  return { totalSolved: uniq.length, points, hardSolved, medPlus, topics, byDate, perWeek };
}

/** `solves.solved_date` grouped by day — ported verbatim from log.tsx. */
async function fetchHeatmapData(uid: string): Promise<Map<string, number>> {
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from('solves')
    .select('solved_date')
    .eq('user_id', uid)
    .gte('solved_date', yearAgo);
  const map = new Map<string, number>();
  for (const row of data ?? []) {
    map.set(row.solved_date, (map.get(row.solved_date) ?? 0) + 1);
  }
  return map;
}

const LC_GRAPHQL = 'https://leetcode.com/graphql';
const LC_STATS_QUERY = `query userStats($username: String!) {
  matchedUser(username: $username) {
    submitStatsGlobal { acSubmissionNum { difficulty count } }
  }
}`;
const LC_CALENDAR_QUERY = `query userCalendar($username: String!, $year: Int) {
  matchedUser(username: $username) {
    userCalendar(year: $year) { submissionCalendar }
  }
}`;

const lcHeaders = (user: string) => ({
  'Content-Type': 'application/json',
  Referer: `https://leetcode.com/${user}/`,
  'User-Agent': 'Mozilla/5.0 Grind/0.1',
});

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function YouScreen() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const email = session?.user.email ?? '';
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { show, toastNode } = useToast();

  const [settings, setSettings] = useState(false);
  const [notifications, setNotifications] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(NOTIF_PREF_KEY).then((v) => {
      if (v !== null) setNotifications(v === '1');
    });
  }, []);

  const setNotifPref = (v: boolean) => {
    setNotifications(v);
    AsyncStorage.setItem(NOTIF_PREF_KEY, v ? '1' : '0');
  };

  /* ---- profile / streaks ---- */

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', uid!).maybeSingle();
      return data as (Profile & { volume_goal?: number; difficulty_goal?: number; days_goal?: number }) | null;
    },
  });

  const { data: streak } = useQuery({
    queryKey: ['streak', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase.from('streaks').select('*').eq('user_id', uid!).maybeSingle();
      return data as Streak | null;
    },
  });

  const volumeGoal = profile?.volume_goal ?? 10;
  const difficultyGoal = profile?.difficulty_goal ?? Math.round(volumeGoal * 0.3);
  const daysGoal = profile?.days_goal ?? Math.min(7, Math.max(2, Math.round(volumeGoal * 0.45)));

  /* ---- solves ⋈ problems ---- */

  /* The same two cache entries the Summary tab and `useTrophies` read. Sharing
     the keys — not just the shape — is what stops this screen from pulling the
     solve history down a second time. */
  const { data: solveRows, isLoading: solvesLoading } = useQuery({
    queryKey: TROPHY_QUERY_KEYS.solves(uid),
    enabled: !!uid,
    queryFn: () => fetchSolves(uid!),
  });
  const { data: catalog } = useQuery({
    queryKey: TROPHY_QUERY_KEYS.problems(),
    queryFn: fetchProblems,
    staleTime: Infinity,
  });

  const stats = useMemo(
    () => (solveRows && catalog ? deriveSolveStats(solveRows, catalog) : undefined),
    [solveRows, catalog],
  );
  const isLoading = solvesLoading || !catalog;

  /* ---- LeetCode (better source for both total solved and the heatmap) ---- */

  const lcName = profile?.leetcode_username ?? null;
  const safeUsername = /^[a-zA-Z0-9_-]{1,40}$/.test(lcName ?? '') ? lcName : null;

  const { data: lcStats } = useQuery({
    queryKey: ['lc-stats', safeUsername],
    enabled: !!safeUsername,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const res = await fetch(LC_GRAPHQL, {
        method: 'POST',
        headers: lcHeaders(safeUsername!),
        body: JSON.stringify({ query: LC_STATS_QUERY, variables: { username: safeUsername } }),
      });
      if (!res.ok) return null;
      const json = await res.json();
      const nums: { difficulty: string; count: number }[] =
        json?.data?.matchedUser?.submitStatsGlobal?.acSubmissionNum ?? [];
      const get = (d: string) => nums.find((n) => n.difficulty === d)?.count ?? 0;
      return { total: get('All'), easy: get('Easy'), medium: get('Medium'), hard: get('Hard') };
    },
  });

  /* lcCalendar merge — kept from log.tsx: LeetCode's own calendar is the
     better source, so it wins over the DB grouping when present. */
  const { data: lcCalendar } = useQuery({
    queryKey: ['lc-calendar', safeUsername],
    enabled: !!safeUsername,
    staleTime: 1000 * 60 * 30,
    queryFn: async (): Promise<Map<string, number>> => {
      const thisYear = new Date().getFullYear();
      const fetchYear = async (year: number) => {
        const res = await fetch(LC_GRAPHQL, {
          method: 'POST',
          headers: lcHeaders(safeUsername!),
          body: JSON.stringify({ query: LC_CALENDAR_QUERY, variables: { username: safeUsername, year } }),
        });
        if (!res.ok) return {};
        const json = await res.json();
        const raw = json?.data?.matchedUser?.userCalendar?.submissionCalendar;
        return raw ? (JSON.parse(raw) as Record<string, number>) : {};
      };
      const [curr, prev] = await Promise.all([fetchYear(thisYear), fetchYear(thisYear - 1)]);
      const map = new Map<string, number>();
      for (const [ts, count] of Object.entries({ ...prev, ...curr })) {
        const date = new Date(parseInt(ts, 10) * 1000).toISOString().slice(0, 10);
        map.set(date, (map.get(date) ?? 0) + count);
      }
      return map;
    },
  });

  const { data: heatmapDbData } = useQuery({
    queryKey: ['heatmap', uid],
    enabled: !!uid,
    staleTime: 1000 * 60 * 5,
    queryFn: () => fetchHeatmapData(uid!),
  });

  const heatmapData = lcCalendar ?? heatmapDbData ?? stats?.byDate;

  /* ---- 12-week ring grid: weekly_stats when it has the 0021 columns,
          otherwise derived from the solves already in hand ---- */

  const { data: weeklyRows } = useQuery({
    queryKey: ['weekly-rings', uid],
    enabled: !!uid,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await sb
        .from('weekly_stats')
        .select('week_start, volume, med_plus, active_days, volume_goal, difficulty_goal, days_goal, rings_closed')
        .eq('user_id', uid!)
        .order('week_start', { ascending: false })
        .limit(12);
      if (error || !data?.length || data[0]?.volume == null) return null;
      return data as Array<Record<string, any>>;
    },
  });

  /**
   * The grid runs up to and including the week in progress. A partial week can
   * never satisfy a full weekly goal, so scoring it with the same
   * closed/missed test rendered the live week identical to a failed one — dim,
   * no tick — and counted it against the headline (on a Monday: "8 of 12"). The
   * current week gets its own state and is excluded from the denominator.
   */
  const weeks: WeekRow[] = useMemo(() => {
    const out: WeekRow[] = [];
    const base = weekStart(new Date());
    const currentKey = iso(base);
    const fromDb = new Map<string, Record<string, any>>();
    for (const r of weeklyRows ?? []) fromDb.set(String(r.week_start).slice(0, 10), r);

    for (let i = 11; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(d.getDate() - i * 7);
      const key = iso(d);
      const row = fromDb.get(key);
      if (row) {
        const vg = row.volume_goal ?? volumeGoal;
        const dg = row.difficulty_goal ?? difficultyGoal;
        const gg = row.days_goal ?? daysGoal;
        out.push({
          start: key,
          volume: row.volume ?? 0,
          medPlus: row.med_plus ?? 0,
          activeDays: row.active_days ?? 0,
          volumeGoal: vg,
          difficultyGoal: dg,
          daysGoal: gg,
          closed:
            row.rings_closed ??
            ((row.volume ?? 0) >= vg && (row.med_plus ?? 0) >= dg && (row.active_days ?? 0) >= gg),
          inProgress: key === currentKey,
        });
      } else {
        const agg = stats?.perWeek.get(key);
        const volume = agg?.volume ?? 0;
        const med = agg?.medPlus ?? 0;
        const days = agg?.days.size ?? 0;
        out.push({
          start: key,
          volume,
          medPlus: med,
          activeDays: days,
          volumeGoal,
          difficultyGoal,
          daysGoal,
          closed: volume >= volumeGoal && med >= difficultyGoal && days >= daysGoal,
          inProgress: key === currentKey,
        });
      }
    }
    return out;
  }, [weeklyRows, stats, volumeGoal, difficultyGoal, daysGoal]);

  /** A week already closed counts even if it is the live one — it just can't be
   *  scored as missed until it ends, so it stays out of the denominator. */
  const weeksClosed = weeks.filter((w) => w.closed).length;
  const weeksScored = weeks.filter((w) => !w.inProgress || w.closed).length;

  /* ---- crew median (the dashed line on the coverage bars) ---- */

  const { data: crewMedian } = useQuery({
    queryKey: ['crew-coverage-median', uid],
    enabled: !!uid && !!stats,
    staleTime: 1000 * 60 * 10,
    queryFn: async (): Promise<number | null> => {
      const { data: mine } = await supabase.from('group_members').select('group_id').eq('user_id', uid!);
      const groupIds = (mine ?? []).map((g) => g.group_id);
      if (!groupIds.length) return null;
      const { data: peers } = await supabase
        .from('group_members')
        .select('user_id')
        .in('group_id', groupIds);
      const ids = Array.from(new Set((peers ?? []).map((p) => p.user_id)));
      if (ids.length < 2) return null;

      const { data: rows, error } = await supabase
        .from('solves')
        .select('user_id, problem_slug')
        .in('user_id', ids);
      if (error) return null;

      const { count } = await supabase
        .from('problems')
        .select('slug', { count: 'exact', head: true })
        .eq('is_premium', false);
      const total = count ?? 0;
      if (!total) return null;

      const per = new Map<string, Set<string>>();
      for (const r of rows ?? []) {
        const set = per.get(r.user_id) ?? new Set<string>();
        set.add(r.problem_slug);
        per.set(r.user_id, set);
      }
      const pcts = ids.map((id) => (per.get(id)?.size ?? 0) / total).sort((a, b) => a - b);
      const mid = Math.floor(pcts.length / 2);
      return pcts.length % 2 ? pcts[mid] : (pcts[mid - 1] + pcts[mid]) / 2;
    },
  });

  /* ---- awards: the 0025 view, else derived from the same numbers ---- */

  const { data: awardRows } = useQuery({
    queryKey: ['awards', uid],
    enabled: !!uid,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await sb
        .from('user_awards')
        .select('key, label, value, target, unlocked, color, sort_order')
        .eq('user_id', uid!)
        .order('sort_order');
      if (error || !data?.length) return null;
      return data as Array<Record<string, any>>;
    },
  });

  const awards = useMemo(() => {
    if (awardRows) {
      return awardRows.map((r) => ({
        key: String(r.key),
        label: String(r.label),
        value: Number(r.value ?? 0),
        target: Number(r.target ?? 1),
        color: String(r.color),
        unlocked: !!r.unlocked,
      }));
    }
    const values: Record<string, number> = {
      day_streak: streak?.longest_days ?? 0,
      weeks_closed: weeksClosed,
      solved: lcStats?.total ?? stats?.totalSolved ?? 0,
      hard_solved: lcStats?.hard ?? stats?.hardSolved ?? 0,
      perfect_weeks: weeksClosed,
      points: stats?.points ?? 0,
    };
    return AWARD_DEFS.map((a) => ({
      key: a.key,
      label: a.label,
      value: values[a.key] ?? 0,
      target: a.target,
      color: a.color,
      unlocked: (values[a.key] ?? 0) >= a.target,
    }));
  }, [awardRows, streak, weeksClosed, lcStats, stats]);

  const unlockedCount = awards.filter((a) => a.unlocked).length;

  /* ---- rank ----
     Trophies are the rank system now. The total is derived from the solves
     table inside useTrophies (never a stored counter), so it can only ever
     agree with what the Log shows. */

  const displaySolved = lcStats?.total ?? stats?.totalSolved ?? 0;

  /* The three ring targets go in so the weekly rows of the earn table — rings
     closed +25, all three +60, crew beaten +40, inactive week −150 — are part
     of the total. `useTrophies` builds the ledger itself from the same solves;
     the Summary header passes the same three goals, so the chip up there and
     the numeral down here are one number. */
  const ringGoals = useMemo(
    () => ({ volume: volumeGoal, difficulty: difficultyGoal, days: daysGoal }),
    [volumeGoal, difficultyGoal, daysGoal],
  );
  /* `null` while the profile is in flight — the goals it carries decide which
     weeks closed their rings, so scoring before it lands would show a total
     that then walks. */
  const trophies = useTrophies(uid, { goals: profileLoading ? null : ringGoals });

  /** Rings actually closed over the ledger window — the number the +25s paid on. */
  const ringsClosed = useMemo(
    () => trophies.ledger.reduce((a, w) => a + (w.ringsClosed ?? 0), 0),
    [trophies.ledger],
  );

  /* ---- weakest area ---- */

  const topics = stats?.topics ?? [];
  const weakest = topics.length
    ? [...topics].sort((a, b) => a.pct - b.pct)[0]
    : null;
  const ownMedian = useMemo(() => {
    if (!topics.length) return 0;
    const p = topics.map((t) => t.pct).sort((a, b) => a - b);
    const mid = Math.floor(p.length / 2);
    return p.length % 2 ? p[mid] : (p[mid - 1] + p[mid]) / 2;
  }, [topics]);
  const medianPct = crewMedian ?? ownMedian;
  const medianLabel = crewMedian != null ? 'Crew median' : 'Your median';

  const verdict = (() => {
    if (!weakest) return '';
    const below = topics.filter((t) => t.pct < medianPct).length;
    const gap = Math.max(1, Math.ceil((medianPct - weakest.pct) * weakest.total));
    // The median is the crew's only when a peer query actually returned one —
    // a solo user (or one whose peers are hidden by RLS) falls back to their
    // own median at `ownMedian`, so the sentence has to follow `medianLabel`
    // rather than assert a crew the user may not have.
    const whose = crewMedian != null ? "your crew's median" : 'your own median';
    const only =
      below === 1
        ? `The only topic below ${whose}.`
        : `${below} topics sit below ${whose}; this is the thinnest.`;
    return `${weakest.solved} of ${weakest.total}. ${only} ${gap === 1 ? 'One problem' : `${gap} problems`} would close the gap.`;
  })();

  /* ---- entry ---- */

  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = withTiming(1, {
      duration: duration.fadeUp,
      easing: Easing.bezier(...EASE.standard),
    });
  }, []);
  const enterStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: 16 * (1 - enter.value) }],
  }));

  return (
    <View style={s.root}>
      <AmbientBackdrop />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          s.scroll,
          { paddingTop: insets.top + 8, paddingBottom: spacing.contentBottom },
        ]}>
        <Animated.View style={enterStyle}>
          {/* 1 — Header */}
          <View style={s.header}>
            <Text style={s.h1}>You</Text>
            <Pressable
              onPress={() => setSettings(true)}
              style={({ pressed: p }) => [s.gear, p && pressed]}
              hitSlop={8}>
              <Svg width={17} height={17} viewBox="0 0 24 24">
                <Path
                  d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
                  stroke={colors.text}
                  strokeWidth={1.8}
                  fill="none"
                />
                <Path
                  d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
                  stroke={colors.text}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </Svg>
            </Pressable>
          </View>

          {isLoading && !stats ? (
            <View style={s.loader}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : null}

          {/* 2 — Arena card (the rank card) */}
          <ArenaCard
            total={trophies.total}
            weekGain={trophies.weekGain}
            league={trophies.league}
            next={trophies.next}
            remaining={trophies.remaining}
            road={trophies.road}
            events={trophies.events}
            ready={!trophies.isLoading}
            solved={displaySolved}
            streak={streak?.current_days ?? 0}
            ringsClosed={ringsClosed}
          />

          {/* 3 — Three stat tiles */}
          <View style={[s.tiles, s.gap]}>
            <StatTile
              value={streak?.current_days ?? 0}
              label="Day streak"
              color={colors.streakOrange}
            />
            <StatTile value={weeksClosed} label="Weeks closed" color={colors.difficulty} />
            <StatTile value={streak?.freezes_available ?? 0} label="Freezes" color={colors.text} />
          </View>

          {/* 5 — Weakest area */}
          {weakest ? (
            <GlassCard style={s.gap}>
              <View style={s.microRow}>
                <View style={[s.dot, { backgroundColor: colors.volume }]} />
                <Text style={s.micro}>WEAKEST AREA</Text>
              </View>
              <Text style={s.weakTitle}>{weakest.full}</Text>
              <Text style={s.weakVerdict}>{verdict}</Text>

              <View style={s.barsHeader}>
                <Text style={s.micro}>COVERAGE BY TOPIC</Text>
                <Text style={s.barsMedian}>
                  {medianLabel} {Math.round(medianPct * 100)}%
                </Text>
              </View>
              <CoverageBars
                topics={topics}
                subject={weakest.tag}
                median={medianPct}
                medianLabel={medianLabel}
              />

              <Pressable
                onPress={() => show(`Building a ${weakest.full} plan…`)}
                style={({ pressed: p }) => [s.secondaryBtn, p && pressed]}>
                <Text style={s.secondaryBtnLabel}>Build a {weakest.full} plan</Text>
              </Pressable>
            </GlassCard>
          ) : null}

          {/* 6 — Awards */}
          <GlassCard style={s.gap}>
            <View style={s.cardHead}>
              <Text style={s.cardTitle}>Awards</Text>
              <Text style={s.cardHeadRight}>
                {unlockedCount} of {awards.length}
              </Text>
            </View>
            <View style={s.awardGrid}>
              {awards.map((a) => (
                <Award
                  key={a.key}
                  value={a.value}
                  label={a.label}
                  color={a.color}
                  unlocked={a.unlocked}
                />
              ))}
            </View>
          </GlassCard>

          {/* 7 — Solve history heatmap */}
          <GlassCard style={s.gap}>
            <Text style={s.cardTitle}>Solve History</Text>
            <Heatmap counts={heatmapData ?? new Map()} streakDays={streak?.current_days ?? 0} />
          </GlassCard>

          {/* 8 — Weeks closed, last 12 */}
          <GlassCard style={s.gap}>
            <View style={s.cardHead}>
              <Text style={s.cardTitle}>Weeks closed</Text>
              <Text style={s.cardHeadRight}>
                {weeksClosed} of {weeksScored}
              </Text>
            </View>
            <WeeksGrid weeks={weeks} />
          </GlassCard>
        </Animated.View>
      </ScrollView>

      <SettingsSheet
        visible={settings}
        onClose={() => setSettings(false)}
        email={email}
        leetcodeHandle={lcName}
        volumeGoal={volumeGoal}
        notifications={notifications}
        onNotificationsChange={setNotifPref}
        onSaved={(m) => {
          qc.invalidateQueries({ queryKey: ['profile', uid] });
          qc.invalidateQueries({ queryKey: TROPHY_QUERY_KEYS.solves(uid) });
          show(m);
        }}
      />

      {toastNode}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Arena card — trophy-explorer.html variant 3                          */
/* ------------------------------------------------------------------ */

const GOLD = TROPHY_GOLD;
const GOLD_HAIRLINE = 'rgba(245,200,66,0.24)';

/** The gold cup from the mock — one silhouette, two gradients. */
function GoldTrophy({ size = 56 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <SvgGradient id="tg-body" x1="15%" y1="0%" x2="80%" y2="100%">
          <Stop offset="0" stopColor="#FFF6D0" />
          <Stop offset="0.42" stopColor="#F5C842" />
          <Stop offset="0.72" stopColor="#E0A824" />
          <Stop offset="1" stopColor="#A9741A" />
        </SvgGradient>
        <SvgGradient id="tg-trim" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0" stopColor="#FFFBE8" />
          <Stop offset="1" stopColor="#D9A32C" />
        </SvgGradient>
      </Defs>
      <Path
        d="M30,24 q-12,0 -12,9 q0,8 11,8"
        fill="none"
        stroke="url(#tg-trim)"
        strokeWidth={7}
        strokeLinecap="round"
      />
      <Path
        d="M70,24 q12,0 12,9 q0,8 -11,8"
        fill="none"
        stroke="url(#tg-trim)"
        strokeWidth={7}
        strokeLinecap="round"
      />
      <Path d="M30,20 h40 v17 a20,20 0 0 1 -40,0 Z" fill="url(#tg-body)" />
      <Path d="M35,24 q-1,17 6,26 q-12,-8 -11,-26 Z" fill="#FFFFFF" opacity={0.38} />
      <Rect x={26} y={16} width={48} height={8} rx={4} fill="url(#tg-trim)" />
      <Path d="M46,57 h8 v11 h-8 Z" fill="url(#tg-body)" />
      <Path d="M36,68 h28 v7 h-28 Z" fill="url(#tg-trim)" />
      <Rect x={29} y={74} width={42} height={10} rx={4} fill="url(#tg-body)" />
      <Rect x={29} y={74} width={42} height={3.5} rx={1.8} fill="#FFFFFF" opacity={0.35} />
    </Svg>
  );
}

/* The oversized numeral is a vertical gold gradient, which RN can only do to
   text through SVG. Digits are drawn on a fixed advance (commas narrower) so
   the numeral keeps tabular alignment as it counts up. */
const DIGIT_W = 25.5;
const COMMA_W = 11;

function TrophyNumeral({ value }: { value: number }) {
  const label = formatTrophies(value);
  const w = Math.max(
    52,
    [...label].reduce((a, c) => a + (c === ',' ? COMMA_W : DIGIT_W), 0) + 6,
  );
  return (
    <Svg width={w} height={50} viewBox={`0 0 ${w} 50`}>
      <Defs>
        <SvgGradient id="tg-num" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0" stopColor="#FFF8DC" />
          <Stop offset="1" stopColor="#EFB93A" />
        </SvgGradient>
      </Defs>
      <SvgText
        x={w / 2}
        y={38}
        textAnchor="middle"
        fontSize={44}
        fontWeight="800"
        letterSpacing={-2.4}
        fill="url(#tg-num)">
        {label}
      </SvgText>
    </Svg>
  );
}

/* ---- +N gain toasts ---- */

interface Gain {
  id: number;
  n: number;
  label: string;
}

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard cleared',
};

const TOAST_MS = 1200;

/* Three parking slots, picked by id — two toasts alive at once never share one,
   and a toast's slot is fixed for its life, so an arriving one can't shove the
   one already in the air. */
const SLOTS = [
  { top: 2, right: -8 },
  { top: 34, right: -16 },
  { top: 66, right: -4 },
];

function GainToast({ gain, onDone }: { gain: Gain; onDone: (id: number) => void }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(
      1,
      { duration: TOAST_MS, easing: Easing.bezier(...EASE.standard) },
      (finished) => {
        if (finished) runOnJS(onDone)(gain.id);
      },
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.12, 0.62, 1], [0, 1, 1, 0]),
    transform: [
      { translateY: interpolate(t.value, [0, 1], [6, -40]) },
      { scale: interpolate(t.value, [0, 0.14, 1], [0.86, 1, 1]) },
    ],
  }));

  return (
    <Animated.View style={[s.gainToast, SLOTS[gain.id % SLOTS.length], style]} pointerEvents="none">
      <GoldTrophy size={13} />
      <Text style={s.gainToastText}>+{formatTrophies(gain.n)}</Text>
      <Text style={s.gainToastLabel}>{gain.label}</Text>
    </Animated.View>
  );
}

const eventKey = (e: TrophyEvent) => `${e.date}|${e.slug}`;

/**
 * A toast per *solve that paid*, off the priced event feed — "+45 Hard
 * cleared", the way the mock has it.
 *
 * It cannot be a delta on the total, which is what the first cut did. The total
 * starts at 0 and rises to the lifetime figure the moment the queries land, so
 * a delta watcher greets every cold start with a `+4,880` windfall. Two things
 * stop that here: nothing is watched until `ready` (the total is real, not a
 * placeholder 0), and the first ready render *seeds* the seen-set instead of
 * toasting it — a history you already had is not something you just earned.
 * After that, only events that were not in the last feed can toast.
 */
function useGainToasts(events: readonly TrophyEvent[], ready: boolean) {
  const [gains, setGains] = useState<Gain[]>([]);
  const seen = useRef<Set<string> | null>(null);
  const nextId = useRef(0);

  useEffect(() => {
    if (!ready) return;
    if (seen.current === null) {
      seen.current = new Set(events.map(eventKey)); // seed, never toast
      return;
    }
    const fresh: Gain[] = [];
    for (const e of events) {
      const k = eventKey(e);
      if (seen.current.has(k)) continue;
      seen.current.add(k);
      if (e.amount > 0) {
        fresh.push({
          id: nextId.current++,
          n: e.amount,
          label: DIFFICULTY_LABEL[e.difficulty] ?? e.difficulty,
        });
      }
    }
    if (fresh.length) setGains((g) => [...g, ...fresh].slice(-SLOTS.length));
  }, [events, ready]);

  const drop = useRef((id: number) => setGains((g) => g.filter((x) => x.id !== id))).current;
  return { gains, drop };
}

/* ---- the trophy road: nine gems at equal pitch ---- */

const ROAD_GEM = 26;

/**
 * `road()` from the explorer: whole leagues sit at an equal pitch and the fill
 * interpolates *within* the current segment, which is the only reason
 * Bronze→Silver does not collapse to a pixel next to Diamond→Grandmaster.
 *
 * Markers are positioned by percentage inside a zero-width, centre-aligned
 * wrapper so no measuring pass is needed, and the knob rides the end of the
 * fill for the same reason.
 */
function TrophyRoad({ road, currentIndex }: { road: number; currentIndex: number }) {
  const last = LEAGUES.length - 1;
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withTiming(clamp(road), {
      duration: duration.progressBar,
      easing: Easing.bezier(...EASE.standard),
    });
  }, [road]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  return (
    <View style={s.roadBox}>
      <View style={s.roadRow}>
        <View style={s.roadTrack} />
        <Animated.View style={[s.roadFillWrap, fillStyle]} pointerEvents="none">
          <LinearGradient
            colors={[GOLD, '#FFF3C4']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.roadFill}
          />
          <View style={s.roadKnob} />
        </Animated.View>

        {LEAGUES.map((l, i) => {
          const done = i <= currentIndex;
          return (
            <View key={l.key} style={[s.roadMarker, { left: `${(i / last) * 100}%` }]}>
              <View style={done ? undefined : s.roadMarkerLocked}>
                <GemBadge tier={l.key as RankKey} size={ROAD_GEM} />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function ArenaCard({
  total,
  weekGain,
  league,
  next,
  remaining,
  road,
  events,
  ready,
  solved,
  streak,
  ringsClosed,
}: {
  total: number;
  weekGain: number;
  league: League;
  next: League | null;
  remaining: number;
  /** 0…1 along the nine equal-pitch markers. */
  road: number;
  events: readonly TrophyEvent[];
  /** False while the total is still a placeholder 0. */
  ready: boolean;
  solved: number;
  streak: number;
  ringsClosed: number;
}) {
  const { gains, drop } = useGainToasts(events, ready);
  const tint = league.tint;

  return (
    <View style={s.arenaWrap}>
      <GlassCard
        radius={radius.cardLarge}
        padding={0}
        borderColor={GOLD_HAIRLINE}
        contentStyle={{ overflow: 'hidden' }}>
        {/* gold wash + a subtle pull toward the current league's tint */}
        <LinearGradient
          colors={['rgba(245,200,66,0.14)', 'rgba(245,200,66,0.02)', `${tint}1A`]}
          locations={[0, 0.55, 1]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <View style={s.arenaHead}>
          <Text style={s.arenaKicker}>TROPHY ROAD</Text>

          <View style={s.arenaNumRow}>
            <GoldTrophy size={56} />
            {/* A placeholder rather than a 0 that would snap to five figures. */}
            {ready ? <TrophyNumeral value={total} /> : <View style={s.numeralGhost} />}
          </View>

          <Text style={s.arenaWeek}>
            {!ready
              ? ' '
              : weekGain !== 0
                ? `${formatGain(weekGain)} this week`
                : 'No trophies yet this week'}
          </Text>

          {/* Spec pill: gem · "<Arena> Arena" · "<N> to next" — the gem already
              says which league this is, so the meta says how far the next one is. */}
          <View style={[s.arenaPill, { borderColor: `${tint}88` }]}>
            <GemBadge tier={league.key as RankKey} size={22} />
            <Text style={s.arenaPillName}>{league.arena} Arena</Text>
            <Text style={s.arenaPillMeta}>
              · {next ? `${formatTrophies(remaining)} to next` : 'Max league'}
            </Text>
          </View>
        </View>

        <TrophyRoad road={road} currentIndex={league.index} />

        <View style={s.arenaChips}>
          <ArenaChip value={formatTrophies(solved)} label="Problems Solved" color={colors.text} />
          <ArenaChip value={`${streak}`} label="Current Streak" color={colors.streakOrange} divider />
          <ArenaChip value={`${ringsClosed}`} label="Rings Closed" color={colors.difficulty} divider />
        </View>
      </GlassCard>

      {gains.map((g) => (
        <GainToast key={g.id} gain={g} onDone={drop} />
      ))}
    </View>
  );
}

function ArenaChip({
  value,
  label,
  color,
  divider,
}: {
  value: string;
  label: string;
  color: string;
  divider?: boolean;
}) {
  return (
    <View style={[s.arenaChip, divider && s.arenaChipDivider]}>
      <Text style={[s.arenaChipValue, { color }]}>{value}</Text>
      <Text style={s.arenaChipLabel}>{label}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Stat tile                                                           */
/* ------------------------------------------------------------------ */

function StatTile({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <GlassCard variant="small" radius={radius.smallCard} padding={16} style={{ flex: 1 }}>
      <Text style={[s.tileValue, { color }]}>{value}</Text>
      <Text style={s.tileLabel}>{label}</Text>
    </GlassCard>
  );
}

/* ------------------------------------------------------------------ */
/* Coverage bars (§5)                                                  */
/* ------------------------------------------------------------------ */

const BAR_BOX = 92;
const BAR_GAP = 5;

/* One accent, no ramp: every topic is neutral white-alpha and only the weakest
   one carries #FA114F. A three-color ramp made this card read as a warning
   panel; the diagnosis lives in the single highlighted bar instead. */
const BAR_NEUTRAL = 'rgba(255,255,255,0.16)';
const BAR_NEUTRAL_LOW = 'rgba(255,255,255,0.10)';

function CoverageBars({
  topics,
  subject,
  median,
  medianLabel,
}: {
  topics: TopicStat[];
  subject: string;
  median: number;
  medianLabel: string;
}) {
  const [w, setW] = useState(0);
  const grow = useSharedValue(0);
  useEffect(() => {
    grow.value = withTiming(1, {
      duration: duration.growUp,
      easing: Easing.bezier(...EASE.standard),
    });
  }, []);

  const max = Math.max(0.08, ...topics.map((t) => t.pct));
  const scale = Math.min(1, max * 1.15);
  const medianY = BAR_BOX - clamp(median / scale) * BAR_BOX;

  return (
    <View style={{ marginTop: 14 }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <View style={s.barRow}>
        {topics.map((t) => (
          <Bar
            key={t.tag}
            pct={clamp(t.pct / scale)}
            color={
              t.tag === subject
                ? colors.volume
                : t.pct < median
                  ? BAR_NEUTRAL_LOW
                  : BAR_NEUTRAL
            }
            grow={grow}
            value={t.tag === subject ? `${Math.round(t.pct * 100)}%` : undefined}
          />
        ))}
      </View>

      {/* crew-median line — an SVG dash, so it renders identically on both OSes */}
      {w > 0 ? (
        <Svg width={w} height={BAR_BOX} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Line
            x1={0}
            y1={medianY}
            x2={w}
            y2={medianY}
            stroke="rgba(255,255,255,0.28)"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        </Svg>
      ) : null}

      <View style={s.barLabels}>
        {topics.map((t) => (
          <Text
            key={t.tag}
            numberOfLines={1}
            style={[
              s.barLabel,
              t.tag === subject && { color: colors.volume },
            ]}>
            {t.short}
          </Text>
        ))}
      </View>

      <View style={s.barLegend}>
        <View style={[s.legendChip, { backgroundColor: colors.volume }]} />
        <Text style={s.legendText}>Weakest</Text>
        <View style={[s.legendChip, { backgroundColor: BAR_NEUTRAL }]} />
        <Text style={s.legendText}>Other topics</Text>
        <View style={s.legendDash}>
          <View style={s.legendDashSeg} />
          <View style={s.legendDashSeg} />
        </View>
        <Text style={s.legendText}>{medianLabel.toLowerCase()}</Text>
      </View>
    </View>
  );
}

function Bar({
  pct,
  color,
  grow,
  value,
}: {
  pct: number;
  color: string;
  grow: { value: number };
  /** Shown above the bar — only the highlighted (weakest) bar gets one. */
  value?: string;
}) {
  const style = useAnimatedStyle(() => ({
    height: Math.max(4, BAR_BOX * pct * grow.value),
  }));
  return (
    <View style={s.barSlot}>
      {/* absolutely placed just above the bar's resting height, so adding it
          never shortens the slot the bar grows into */}
      {value ? (
        <Text style={[s.barValue, { bottom: Math.max(4, BAR_BOX * pct) + 4 }]}>{value}</Text>
      ) : null}
      <Animated.View style={[s.bar, { backgroundColor: color }, style]} />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Weeks closed · last 12 (§3.9.8)                                     */
/* ------------------------------------------------------------------ */

const WEEK_GLYPH = 38;

/** The tick that sits inside a closed week's rings. */
function ClosedTick({ size = 12 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M5 12.5l4.5 4.5L19 7"
        stroke={colors.difficulty}
        strokeWidth={3.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function WeeksGrid({ weeks }: { weeks: WeekRow[] }) {
  /* One label per month, under the week that opens it — enough to date the row
     without a caption under every glyph. Every cell still renders a Text so the
     baselines line up. */
  let lastMonth = -1;
  const cells = weeks.map((w) => {
    const d = new Date(`${w.start}T00:00:00`);
    const m = d.getMonth();
    const opensMonth = m !== lastMonth;
    lastMonth = m;
    return { w, label: opensMonth ? MONTHS[m] : '' };
  });

  return (
    <View style={{ marginTop: 14 }}>
      <View style={s.weekGrid}>
        {cells.map(({ w, label }) => (
          <View key={w.start} style={s.weekCell}>
            {/* Three states, not two: closed (tick), in progress (accent dot,
                full opacity — the week hasn't ended, so it can't have failed),
                missed (dimmed). */}
            <View style={[s.weekGlyph, !w.closed && !w.inProgress && s.weekGlyphMissed]}>
              <DoubleRing
                size={WEEK_GLYPH}
                volume={clamp(w.volumeGoal ? w.volume / w.volumeGoal : 0)}
                difficulty={clamp(w.difficultyGoal ? w.medPlus / w.difficultyGoal : 0)}
              />
              {w.closed ? (
                <View style={s.weekTick} pointerEvents="none">
                  <ClosedTick />
                </View>
              ) : w.inProgress ? (
                <View style={s.weekTick} pointerEvents="none">
                  <View style={s.weekLiveDot} />
                </View>
              ) : null}
            </View>
            <Text numberOfLines={1} style={s.weekLabel}>
              {label}
            </Text>
          </View>
        ))}
      </View>

      <Text style={s.weeksFootnote}>Outer ring volume · inner mediums+</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Awards                                                              */
/* ------------------------------------------------------------------ */

function Award({
  value,
  label,
  color,
  unlocked,
}: {
  value: number;
  label: string;
  color: string;
  unlocked: boolean;
}) {
  return (
    <View style={[s.awardCell, !unlocked && { opacity: 0.34 }]}>
      <View
        style={[
          s.awardCircle,
          {
            borderColor: unlocked ? color : colors.controlAlt,
            backgroundColor: unlocked ? `${color}26` : colors.controlAlt16,
          },
        ]}>
        <Text style={[s.awardValue, { color: unlocked ? color : colors.text }]}>{value}</Text>
      </View>
      <Text style={s.awardLabel}>{label}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Heatmap (§5) — 18 columns × 7 rows                                  */
/* ------------------------------------------------------------------ */

const HM_COLS = 18;
const HM_GAP = 3;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function rampIndex(count: number) {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  if (count <= 7) return 3;
  return 4;
}

function Heatmap({ counts, streakDays }: { counts: Map<string, number>; streakDays: number }) {
  const [w, setW] = useState(0);
  const cell = w
    ? Math.min(14, Math.floor((w - HM_GAP * (HM_COLS - 1)) / HM_COLS))
    : 14;

  const today = new Date();
  const start = weekStart(today);
  start.setDate(start.getDate() - (HM_COLS - 1) * 7);

  const cols = Array.from({ length: HM_COLS }, (_, ci) =>
    Array.from({ length: 7 }, (_, di) => {
      const d = new Date(start);
      d.setDate(start.getDate() + ci * 7 + di);
      return d;
    }),
  );

  // month label at the first column whose Monday starts a new month
  const monthMarks: Array<{ col: number; label: string }> = [];
  let lastMonth = -1;
  cols.forEach((col, ci) => {
    const m = col[0].getMonth();
    if (m !== lastMonth) {
      monthMarks.push({ col: ci, label: MONTHS[m] });
      lastMonth = m;
    }
  });

  return (
    <View style={{ marginTop: 14 }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <View style={{ flexDirection: 'row', gap: HM_GAP }}>
        {cols.map((col, ci) => (
          <View key={ci} style={{ gap: HM_GAP }}>
            {col.map((d, di) => {
              const future = d > today;
              const n = counts.get(iso(d)) ?? 0;
              return (
                <View
                  key={di}
                  style={{
                    width: cell,
                    height: cell,
                    borderRadius: 3,
                    backgroundColor: future ? 'transparent' : heatmapRamp[rampIndex(n)],
                  }}
                />
              );
            })}
          </View>
        ))}
      </View>

      <View style={{ height: 16, marginTop: 8 }}>
        {monthMarks.map((m) => (
          <Text
            key={`${m.label}-${m.col}`}
            style={[s.monthLabel, { left: m.col * (cell + HM_GAP) }]}>
            {m.label}
          </Text>
        ))}
      </View>

      <View style={s.hairline} />

      <View style={s.legendRow}>
        <Text style={s.legendText}>Less</Text>
        {heatmapRamp.map((c, i) => (
          <View key={i} style={[s.legendSwatch, { backgroundColor: c }]} />
        ))}
        <Text style={s.legendText}>More</Text>
        <View style={{ flex: 1 }} />
        <Text style={s.legendStreak}>{streakDays}-day streak</Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.screenH },
  loader: { paddingVertical: 24, alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  h1: { ...type.largeTitle, color: colors.text },
  gear: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.controlAlt30,
    alignItems: 'center',
    justifyContent: 'center',
  },

  gap: { marginTop: spacing.cardGapTight },

  /* arena card */
  arenaWrap: { position: 'relative' },
  arenaHead: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 4, alignItems: 'center' },
  arenaKicker: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: GOLD,
  },
  arenaNumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 10,
  },
  arenaWeek: { ...type.caption, ...tabular, color: colors.textTertiary, marginTop: 2 },
  arenaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingLeft: 8,
    paddingRight: 14,
    paddingVertical: 6,
    borderRadius: radius.round,
    borderWidth: 0.5,
    backgroundColor: colors.codeBlock,
  },
  arenaPillName: { fontSize: 13.5, fontWeight: '600', letterSpacing: -0.2, color: colors.text },
  arenaPillMeta: { fontSize: 11.5, fontWeight: '500', color: colors.textTertiary },

  /* Reserves the numeral's box while the total is still unknown, so the card
     does not resize when the real number arrives. */
  numeralGhost: { width: 92, height: 50 },

  /* trophy road — 9 gems, equal pitch. The horizontal padding is half a gem
     plus air, so the Bronze and Grandmaster markers are not clipped by the
     card's rounded corner. */
  roadBox: { paddingHorizontal: 20 + ROAD_GEM / 2, paddingTop: 18, paddingBottom: 16 },
  /* A gem is drawn 130×138, so its box is a touch taller than `size` is wide. */
  roadRow: { height: Math.round((ROAD_GEM * 138) / 130), justifyContent: 'center' },
  roadTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  /* left/top/bottom only — an animated `width` and a pinned `right` fight in
     Yoga, and the loser is the animation. */
  roadFillWrap: { position: 'absolute', left: 0, height: 6, borderRadius: 3 },
  roadFill: { flex: 1, borderRadius: 3 },
  roadKnob: {
    position: 'absolute',
    right: -5.5,
    top: -2.5,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: 'rgba(0,0,0,0.7)',
  },
  /* Zero-width and centre-aligned: the gem overhangs both sides of the
     percentage anchor, which is `translateX(-50%)` without a measuring pass. */
  roadMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roadMarkerLocked: { opacity: 0.34 },

  arenaChips: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.gridLine,
  },
  arenaChip: { flex: 1, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center' },
  arenaChipDivider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.gridLine,
  },
  arenaChipValue: { fontSize: 19, fontWeight: '700', letterSpacing: -0.5, ...tabular },
  arenaChipLabel: {
    fontSize: 9.5,
    fontWeight: '500',
    letterSpacing: 0.3,
    color: colors.textQuaternary,
    marginTop: 2,
  },

  gainToast: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 7,
    paddingRight: 10,
    paddingVertical: 4,
    borderRadius: radius.round,
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderWidth: 0.5,
    borderColor: 'rgba(245,200,66,0.40)',
    ...shadow.md,
  },
  gainToastText: { fontSize: 12.5, fontWeight: '700', color: '#FFDF7A', ...tabular },
  gainToastLabel: { fontSize: 10.5, fontWeight: '500', color: colors.textTertiary },

  /* tiles */
  tiles: { flexDirection: 'row', gap: 10 },
  tileValue: { ...type.statNumeral, ...tabular },
  tileLabel: { fontSize: 12, fontWeight: '500', color: colors.textSecondary, marginTop: 4 },

  /* cards */
  cardHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardTitle: { ...type.cardTitle, color: colors.text },
  cardHeadRight: { fontSize: 13.5, fontWeight: '400', color: colors.textTertiary },

  microRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  micro: { ...type.microLabel, color: colors.textSecondary, textTransform: 'uppercase' },
  dot: { width: 7, height: 7, borderRadius: 4 },

  weakTitle: { ...type.cardTitle, color: colors.text, marginTop: 12 },
  weakVerdict: { ...type.bodySecondary, lineHeight: 20, color: colors.textSecondary, marginTop: 6 },

  barsHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  barsMedian: { fontSize: 12.5, fontWeight: '400', color: colors.textTertiary },

  barRow: { flexDirection: 'row', alignItems: 'flex-end', gap: BAR_GAP, height: BAR_BOX },
  barSlot: { flex: 1, height: BAR_BOX, justifyContent: 'flex-end' },
  bar: { width: '100%', borderTopLeftRadius: 4, borderTopRightRadius: 4, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  barValue: {
    position: 'absolute',
    left: 0,
    right: 0,
    ...type.chartLabel,
    color: colors.volume,
    textAlign: 'center',
    ...tabular,
  },
  barLabels: { flexDirection: 'row', gap: BAR_GAP, marginTop: 8 },
  barLabel: { ...type.chartLabel, flex: 1, textAlign: 'center', color: colors.textChartLabel },
  barLegend: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  legendChip: { width: 8, height: 8, borderRadius: 2 },
  legendDash: { flexDirection: 'row', gap: 3, marginLeft: 4 },
  legendDashSeg: {
    width: 5,
    height: 1,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },

  secondaryBtn: {
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.controlAlt30,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  secondaryBtnLabel: { ...type.buttonLabelInline, color: colors.accentText },

  /* awards */
  awardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 16,
    columnGap: 10,
    marginTop: 16,
  },
  awardCell: { width: '31%', alignItems: 'center', gap: 8 },
  awardCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  awardValue: { fontSize: 20, fontWeight: '700', letterSpacing: -0.6, ...tabular },
  awardLabel: {
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 14,
    textAlign: 'center',
    color: colors.textSecondary,
  },

  /* heatmap */
  monthLabel: {
    position: 'absolute',
    ...type.chartLabel,
    color: colors.textChartLabel,
  },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline, marginTop: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 },
  legendSwatch: { width: 12, height: 12, borderRadius: 3 },
  legendText: { ...type.chartLabel, color: colors.textChartLabel, marginHorizontal: 2 },
  legendStreak: { fontSize: 12, fontWeight: '600', color: colors.accentText },

  /* weeks closed */
  weeksFootnote: { ...type.chartLabel, color: colors.textQuaternary, marginTop: 14 },
  weekGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  weekCell: { width: '16.66%', alignItems: 'center', gap: 5 },
  weekGlyph: { width: WEEK_GLYPH, height: WEEK_GLYPH, alignItems: 'center', justifyContent: 'center' },
  weekGlyphMissed: { opacity: 0.42 },
  weekTick: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  weekLabel: { ...type.chartLabel, color: colors.textChartLabel, ...tabular },
  weekLiveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.accentText },
});
