import React, { useEffect, useMemo, useState } from 'react';
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
import Svg, { Line, Path } from 'react-native-svg';
import Animated, {
  Easing,
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
import { nextRank, progressToNext, rankForSolves } from '@/ranks/ranks-data';
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

/** Meme tiers — flavor only. The one real rank system is RANKS (§3.9.2). */
const MEME_TIERS = [
  { min: 0, emoji: '🫥', label: 'Homeless' },
  { min: 11, emoji: '🍳', label: 'Cooked' },
  { min: 31, emoji: '🤿', label: 'Underwater Technician' },
  { min: 71, emoji: '🍟', label: 'Fries in Bag' },
  { min: 131, emoji: '🗿', label: 'Chud' },
  { min: 221, emoji: '⛰️', label: 'Mtn Coder' },
  { min: 351, emoji: '🍟', label: 'Cracked' },
  { min: 501, emoji: '🎓', label: 'True CS Major' },
  { min: 701, emoji: '🗡️', label: 'FAANG Slayer' },
  { min: 951, emoji: '🏴‍☠️', label: 'One Piece' },
] as const;

const memeTierFor = (solved: number) =>
  [...MEME_TIERS].reverse().find((t) => solved >= t.min) ?? MEME_TIERS[0];

const MEME_PREF_KEY = 'you.memeTiers';
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

interface SolveRow {
  problem_slug: string;
  solved_date: string;
  points: number;
}
interface ProblemRow {
  slug: string;
  tags: string[];
  difficulty: string;
}

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

/** One pass over solves ⋈ problems — everything on this screen but the heatmap
 *  merge and the crew median comes out of here. */
async function fetchSolveStats(uid: string): Promise<SolveStats> {
  const [sr, pr] = await Promise.all([
    supabase.from('solves').select('problem_slug, solved_date, points').eq('user_id', uid),
    supabase.from('problems').select('slug, tags, difficulty').eq('is_premium', false),
  ]);
  if (sr.error) throw sr.error;
  if (pr.error) throw pr.error;

  const solves = (sr.data ?? []) as SolveRow[];
  const problems = (pr.data ?? []) as ProblemRow[];
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
  const [memeTiers, setMemeTiers] = useState(true);
  const [notifications, setNotifications] = useState(false);

  useEffect(() => {
    AsyncStorage.multiGet([MEME_PREF_KEY, NOTIF_PREF_KEY]).then((pairs) => {
      for (const [k, v] of pairs) {
        if (v === null) continue;
        if (k === MEME_PREF_KEY) setMemeTiers(v === '1');
        if (k === NOTIF_PREF_KEY) setNotifications(v === '1');
      }
    });
  }, []);

  const setMemePref = (v: boolean) => {
    setMemeTiers(v);
    AsyncStorage.setItem(MEME_PREF_KEY, v ? '1' : '0');
  };
  const setNotifPref = (v: boolean) => {
    setNotifications(v);
    AsyncStorage.setItem(NOTIF_PREF_KEY, v ? '1' : '0');
  };

  /* ---- profile / streaks ---- */

  const { data: profile } = useQuery({
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

  const { data: stats, isLoading } = useQuery({
    queryKey: ['you-stats', uid],
    enabled: !!uid,
    staleTime: 1000 * 60 * 5,
    queryFn: () => fetchSolveStats(uid!),
  });

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

  const weeks: WeekRow[] = useMemo(() => {
    const out: WeekRow[] = [];
    const base = weekStart(new Date());
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
        });
      }
    }
    return out;
  }, [weeklyRows, stats, volumeGoal, difficultyGoal, daysGoal]);

  const weeksClosed = weeks.filter((w) => w.closed).length;

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

  /* ---- rank ---- */

  const displaySolved = lcStats?.total ?? stats?.totalSolved ?? 0;
  const rank = rankForSolves(displaySolved);
  const next = nextRank(rank.key);
  const rankPct = progressToNext(displaySolved, rank.key);
  const meme = memeTierFor(displaySolved);

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

          {/* 2 — Gem card */}
          <View style={s.gemCard}>
            <LinearGradient
              colors={['rgba(59,130,246,0.20)', 'rgba(59,130,246,0.03)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.55, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={shadow.gem}>
              <GemBadge tier={rank} size={74} />
            </View>
            <View style={s.gemInfo}>
              <Text style={s.gemName}>{rank.name}</Text>
              <Text style={s.gemSub}>
                {displaySolved} solved
                {next ? ` · ${Math.max(0, next.thr - displaySolved)} to ${next.name}` : ' · max rank'}
              </Text>
              <View style={s.gemTrack}>
                <View style={[s.gemFill, { width: `${Math.round(rankPct * 100)}%` }]} />
              </View>
            </View>
          </View>

          {/* 3 — Meme tier row */}
          {memeTiers ? (
            <GlassCard variant="small" radius={radius.smallCard} padding={16} style={s.gap}>
              <Text style={s.memeText}>
                {meme.emoji}  Also known as <Text style={s.memeName}>{meme.label}</Text>
              </Text>
            </GlassCard>
          ) : null}

          {/* 4 — Three stat tiles */}
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
              <CoverageBars topics={topics} subject={weakest.tag} median={medianPct} />

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
              <Text style={s.cardTitle}>Weeks closed · last 12</Text>
              <Text style={s.cardHeadRight}>
                {weeksClosed} of {weeks.length}
              </Text>
            </View>
            <View style={s.weekGrid}>
              {weeks.map((w) => (
                <DoubleRing
                  key={w.start}
                  size={49}
                  volume={clamp(w.volumeGoal ? w.volume / w.volumeGoal : 0)}
                  difficulty={clamp(w.difficultyGoal ? w.medPlus / w.difficultyGoal : 0)}
                />
              ))}
            </View>
          </GlassCard>
        </Animated.View>
      </ScrollView>

      <SettingsSheet
        visible={settings}
        onClose={() => setSettings(false)}
        email={email}
        leetcodeHandle={lcName}
        volumeGoal={volumeGoal}
        memeTiers={memeTiers}
        onMemeTiersChange={setMemePref}
        notifications={notifications}
        onNotificationsChange={setNotifPref}
        onSaved={(m) => {
          qc.invalidateQueries({ queryKey: ['profile', uid] });
          qc.invalidateQueries({ queryKey: ['you-stats', uid] });
          show(m);
        }}
      />

      {toastNode}
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

function barColor(pct: number) {
  if (pct < 0.25) return 'rgba(250,17,79,0.45)';
  if (pct < 0.5) return 'rgba(255,212,38,0.60)';
  return 'rgba(162,247,61,0.55)';
}

function CoverageBars({
  topics,
  subject,
  median,
}: {
  topics: TopicStat[];
  subject: string;
  median: number;
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
            color={t.tag === subject ? colors.volume : barColor(t.pct)}
            grow={grow}
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
    </View>
  );
}

function Bar({
  pct,
  color,
  grow,
}: {
  pct: number;
  color: string;
  grow: { value: number };
}) {
  const style = useAnimatedStyle(() => ({
    height: Math.max(4, BAR_BOX * pct * grow.value),
  }));
  return (
    <View style={s.barSlot}>
      <Animated.View style={[s.bar, { backgroundColor: color }, style]} />
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

  /* gem */
  gemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: radius.cardLarge,
    borderWidth: 0.5,
    borderColor: 'rgba(59,130,246,0.30)',
    padding: 18,
    overflow: 'hidden',
  },
  gemInfo: { flex: 1 },
  gemName: { fontSize: 24, fontWeight: '700', letterSpacing: -0.7, color: colors.text },
  gemSub: { ...type.bodySecondary, color: colors.textSecondary, marginTop: 2 },
  gemTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.controlAlt,
    overflow: 'hidden',
    marginTop: 12,
  },
  gemFill: { height: 5, borderRadius: 3, backgroundColor: colors.gem },

  /* meme */
  memeText: { fontSize: 15, fontWeight: '400', color: colors.textSecondary },
  memeName: { fontWeight: '700', color: colors.text },

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
  barLabels: { flexDirection: 'row', gap: BAR_GAP, marginTop: 8 },
  barLabel: { ...type.chartLabel, flex: 1, textAlign: 'center', color: colors.textChartLabel },

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
  weekGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14, justifyContent: 'space-between' },
});
