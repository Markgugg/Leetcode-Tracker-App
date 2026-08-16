/**
 * Member profile — the screen one tap off Crew (`crew.tsx` → `router.push(
 * `/profile/${uid}`)`).
 *
 * Redesigned against design_handoff/README.md §1 / §3.9 / §5. Previously this
 * was the only screen still running the pre-redesign GitHub-dark palette: a
 * hardcoded `#21262D → #39D353` heatmap ramp, the legacy `radius`/`colors.textDim`
 * aliases, no GlassCard, no ambient glow, no blur.
 *
 * Per §3.9/§6 there is exactly one rank system: the gem card below reads
 * `RANKS` from src/ranks/ranks-data.ts, the same system the You tab renders.
 */
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { supabase } from '@/lib/supabase';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import { Avatar } from '@/components/Avatar';
import { GlassCard } from '@/components/GlassCard';
import { ProgressRing } from '@/components/Ring';
import { GemBadge } from '@/ranks/GemBadge';
import { nextRank, progressToNext, rankForSolves } from '@/ranks/ranks-data';
import {
  colors,
  difficultyColor,
  heatmapRamp,
  pressed,
  radius,
  shadow,
  spacing,
  tabular,
  type,
} from '@/theme';
import type { Profile, Streak } from '@/types/database';

/* ------------------------------------------------------------------ */
/* Date helpers                                                        */
/* ------------------------------------------------------------------ */

const iso = (d: Date) => {
  const t = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return t.toISOString().slice(0, 10);
};

/** Monday of the week containing `d`. */
function weekStart(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/* ------------------------------------------------------------------ */
/* Solve History heatmap (§5) — 18 columns × 7 rows, accent ramp        */
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
  const cell = w ? Math.min(14, Math.floor((w - HM_GAP * (HM_COLS - 1)) / HM_COLS)) : 14;

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
/* Bits                                                                */
/* ------------------------------------------------------------------ */

function StatTile({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <GlassCard variant="small" radius={radius.smallCard} padding={16} style={{ flex: 1 }}>
      <Text style={[s.tileValue, { color }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={s.tileLabel}>{label}</Text>
    </GlassCard>
  );
}

function DiffRing({
  label,
  color,
  count,
  target,
}: {
  label: string;
  color: string;
  count: number;
  target: number;
}) {
  return (
    <View style={{ alignItems: 'center', flex: 1, gap: 8 }}>
      <ProgressRing
        progress={Math.min(count / target, 1)}
        size={72}
        r={25}
        strokeWidth={5}
        color={color}
        label={String(count)}
        labelSize={17}
        labelColor={color}
      />
      <Text style={[s.diffLabel, { color }]}>{label}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function MemberProfile() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: profile } = useQuery({
    queryKey: ['member-profile', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      return data as Profile | null;
    },
  });

  const { data: streak } = useQuery({
    queryKey: ['member-streak', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from('streaks').select('*').eq('user_id', userId).maybeSingle();
      return data as Streak | null;
    },
  });

  const { data: allSolves } = useQuery({
    queryKey: ['member-alltime', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from('solves').select('points').eq('user_id', userId).limit(2000);
      return data ?? [];
    },
  });

  const { data: weekSolves } = useQuery({
    queryKey: ['member-week', userId],
    enabled: !!userId,
    queryFn: async () => {
      const since = weekStart(new Date());
      const { data } = await supabase
        .from('solves')
        .select('points')
        .eq('user_id', userId)
        .gte('solved_at', since.toISOString());
      return data ?? [];
    },
  });

  const { data: heatmapData } = useQuery({
    queryKey: ['member-heatmap', userId],
    enabled: !!userId,
    queryFn: async () => {
      const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data } = await supabase
        .from('solves')
        .select('solved_date')
        .eq('user_id', userId)
        .gte('solved_date', yearAgo);
      const map = new Map<string, number>();
      for (const r of data ?? []) map.set(r.solved_date, (map.get(r.solved_date) ?? 0) + 1);
      return map;
    },
  });

  const { data: recentSolves } = useQuery({
    queryKey: ['member-recent', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('solves')
        .select('id, solved_at, points, problems(title, difficulty)')
        .eq('user_id', userId)
        .order('solved_at', { ascending: false })
        .limit(8);
      // PostgREST types a one-to-many embed as an array even when the FK is
      // many-to-one, so normalise to a single row (or null) here.
      type P = { title: string; difficulty: 'easy' | 'medium' | 'hard' };
      const rows = (data ?? []) as unknown as Array<{
        id: string;
        solved_at: string;
        points: number;
        problems: P | P[] | null;
      }>;
      return rows.map((r) => ({
        ...r,
        problems: (Array.isArray(r.problems) ? r.problems[0] ?? null : r.problems) as P | null,
      }));
    },
  });

  const safeUsername = /^[a-zA-Z0-9_-]{1,40}$/.test(profile?.leetcode_username ?? '')
    ? profile!.leetcode_username
    : null;

  const { data: lcStats } = useQuery({
    queryKey: ['lc-stats', safeUsername],
    enabled: !!safeUsername,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const res = await fetch('https://leetcode.com/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Referer: `https://leetcode.com/${safeUsername}/`,
          'User-Agent': 'Mozilla/5.0 Grind/0.1',
        },
        body: JSON.stringify({
          query: `query userStats($username: String!) { matchedUser(username: $username) { submitStatsGlobal { acSubmissionNum { difficulty count } } } }`,
          variables: { username: safeUsername },
        }),
      });
      if (!res.ok) return null;
      const json = await res.json();
      const nums: { difficulty: string; count: number }[] =
        json?.data?.matchedUser?.submitStatsGlobal?.acSubmissionNum ?? [];
      const get = (d: string) => nums.find((n) => n.difficulty === d)?.count ?? 0;
      return { total: get('All'), easy: get('Easy'), medium: get('Medium'), hard: get('Hard') };
    },
  });

  const totalSolved = lcStats?.total ?? allSolves?.length ?? 0;
  const totalPts = allSolves?.reduce((sum, r) => sum + r.points, 0) ?? 0;
  const weekPts = weekSolves?.reduce((sum, r) => sum + r.points, 0) ?? 0;
  const name = profile?.display_name ?? profile?.username ?? '?';

  /* One rank system: the 9 gems from src/ranks/ranks-data.ts (§3.9). */
  const rank = useMemo(() => rankForSolves(totalSolved), [totalSolved]);
  const next = useMemo(() => nextRank(rank.key), [rank.key]);
  const rankPct = progressToNext(totalSolved, rank.key);

  if (!profile) {
    return (
      <View style={s.root}>
        <AmbientBackdrop />
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <AmbientBackdrop />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          s.scroll,
          { paddingTop: insets.top + 8, paddingBottom: spacing.contentBottom },
        ]}>
        {/* ── Back ─────────────────────────────────────── */}
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed: p }) => [s.back, p && pressed]}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>

        {/* ── Identity ─────────────────────────────────── */}
        <View style={s.identity}>
          <Avatar name={name} size={84} url={profile.avatar_url} />
          <Text style={s.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={s.handle}>@{profile.username}</Text>
          {safeUsername ? (
            <View style={s.lcChip}>
              <Ionicons name="code-slash" size={11} color={colors.accentText} />
              <Text style={s.lcChipText}>{safeUsername}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Gem card (§3.9.2) ────────────────────────── */}
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
          <View style={{ flex: 1 }}>
            <Text style={s.gemName}>{rank.name}</Text>
            <Text style={s.gemSub}>
              {totalSolved} solved
              {next ? ` · ${Math.max(0, next.thr - totalSolved)} to ${next.name}` : ' · max rank'}
            </Text>
            <View style={s.gemTrack}>
              <View style={[s.gemFill, { width: `${Math.round(rankPct * 100)}%` }]} />
            </View>
          </View>
        </View>

        {/* ── Stat tiles ───────────────────────────────── */}
        <View style={[s.tiles, s.gap]}>
          <StatTile
            value={String(streak?.current_days ?? 0)}
            label="Day streak"
            color={colors.streakOrange}
          />
          <StatTile
            value={String(streak?.current_weeks ?? 0)}
            label="Weeks closed"
            color={colors.difficulty}
          />
          <StatTile value={String(totalPts)} label="Points" color={colors.text} />
        </View>

        {/* ── This week ────────────────────────────────── */}
        <GlassCard style={s.gap}>
          <View style={s.microRow}>
            <View style={[s.dot, { backgroundColor: colors.volume }]} />
            <Text style={s.micro}>THIS WEEK</Text>
          </View>
          <View style={s.weekRow}>
            <View style={s.weekCell}>
              <Text style={[s.weekValue, { color: colors.volume }]}>{weekSolves?.length ?? 0}</Text>
              <Text style={s.weekUnit}>SOLVED</Text>
            </View>
            <View style={s.weekCell}>
              <Text style={[s.weekValue, { color: colors.difficulty }]}>{weekPts}</Text>
              <Text style={s.weekUnit}>POINTS</Text>
            </View>
            <View style={s.weekCell}>
              <Text style={[s.weekValue, { color: colors.streak }]}>
                {streak?.longest_days ?? 0}
              </Text>
              <Text style={s.weekUnit}>BEST STREAK</Text>
            </View>
          </View>
        </GlassCard>

        {/* ── LeetCode split ───────────────────────────── */}
        {lcStats ? (
          <GlassCard style={s.gap}>
            <View style={s.cardHead}>
              <Text style={s.cardTitle}>LeetCode</Text>
              <Text style={s.cardHeadRight}>{lcStats.total} solved</Text>
            </View>
            <View style={s.diffRow}>
              <DiffRing label="Easy" color={colors.easy} count={lcStats.easy} target={150} />
              <DiffRing label="Medium" color={colors.medium} count={lcStats.medium} target={200} />
              <DiffRing label="Hard" color={colors.hard} count={lcStats.hard} target={75} />
            </View>
          </GlassCard>
        ) : null}

        {/* ── Solve History (§5) ───────────────────────── */}
        {heatmapData ? (
          <GlassCard style={s.gap}>
            <Text style={s.cardTitle}>Solve History</Text>
            <Heatmap counts={heatmapData} streakDays={streak?.current_days ?? 0} />
          </GlassCard>
        ) : null}

        {/* ── Recent solves ────────────────────────────── */}
        {(recentSolves?.length ?? 0) > 0 ? (
          <GlassCard style={s.gap} padding={0} contentStyle={s.listCard}>
            <Text style={[s.cardTitle, { marginTop: 16, marginBottom: 2 }]}>Recent</Text>
            {recentSolves!.map((r, i) => {
              const dc = difficultyColor(r.problems?.difficulty);
              return (
                <View key={r.id} style={[s.solveRow, i > 0 && s.rowDivider]}>
                  <View style={[s.solveDot, { backgroundColor: dc }]} />
                  <Text style={s.solveTitle} numberOfLines={1}>
                    {r.problems?.title ?? 'Unknown problem'}
                  </Text>
                  <Text style={[s.solvePts, { color: dc }]}>+{r.points}</Text>
                </View>
              );
            })}
          </GlassCard>
        ) : null}
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: spacing.screenH },
  gap: { marginTop: spacing.cardGapTight },

  back: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.controlAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* identity */
  identity: { alignItems: 'center', marginTop: 14, marginBottom: 18 },
  name: { ...type.screenSubtitle, color: colors.text, marginTop: 14 },
  handle: { ...type.bodySecondary, color: colors.textSecondary, marginTop: 2 },
  lcChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.chip,
    backgroundColor: colors.accentSelectedFill,
    borderWidth: 0.5,
    borderColor: colors.accentSelectedBorder,
  },
  lcChipText: { fontSize: 12, fontWeight: '600', color: colors.accentText },

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

  /* tiles */
  tiles: { flexDirection: 'row', gap: 10 },
  tileValue: { ...type.statNumeral, ...tabular },
  tileLabel: { fontSize: 12, fontWeight: '500', color: colors.textSecondary, marginTop: 4 },

  /* cards */
  cardHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  cardTitle: { ...type.cardTitle, color: colors.text },
  cardHeadRight: { fontSize: 13.5, fontWeight: '400', color: colors.textTertiary },

  microRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  micro: { ...type.microLabel, color: colors.textSecondary, textTransform: 'uppercase' },
  dot: { width: 7, height: 7, borderRadius: 4 },

  /* this week */
  weekRow: { flexDirection: 'row', marginTop: 14 },
  weekCell: { flex: 1, gap: 2 },
  weekValue: { ...type.ringValue, ...tabular },
  weekUnit: { ...type.ringUnit, color: colors.textTertiary, textTransform: 'uppercase' },

  /* leetcode */
  diffRow: { flexDirection: 'row', marginTop: 16 },
  diffLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },

  /* heatmap */
  monthLabel: {
    position: 'absolute',
    ...type.chartLabel,
    color: colors.textChartLabel,
  },
  hairline: { height: 0.5, backgroundColor: colors.hairline, marginTop: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 },
  legendText: { ...type.chartLabel, color: colors.textChartLabel },
  legendSwatch: { width: 11, height: 11, borderRadius: 3 },
  legendStreak: { fontSize: 12, fontWeight: '600', color: colors.accentText },

  /* recent */
  listCard: { paddingVertical: 4, paddingHorizontal: 18, paddingBottom: 12 },
  solveRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  rowDivider: { borderTopWidth: 0.5, borderTopColor: colors.hairline },
  solveDot: { width: 8, height: 8, borderRadius: 4 },
  solveTitle: { flex: 1, ...type.bodyRow, color: colors.text },
  solvePts: { fontSize: 15, fontWeight: '700', ...tabular },
});
