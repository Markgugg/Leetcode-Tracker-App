import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  Pressable, Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle as SvgCircle, G, Text as SvgText } from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import { Avatar } from '@/components/Avatar';
import { colors, radius, space, shadow } from '@/theme';
import type { Profile, Streak } from '@/types/database';

const { width: SW } = Dimensions.get('window');
const PAD = space(4);

// ─── Tiers ────────────────────────────────────────────────────────────────────

const TIERS = [
  { min: 0,   max: 10,  label: 'Homeless',             color: '#DC2626', glow: 'rgba(220,38,38,0.15)'   },
  { min: 11,  max: 30,  label: 'Cooked',               color: '#F85149', glow: 'rgba(248,81,73,0.15)'   },
  { min: 31,  max: 70,  label: 'Underwater Technician', color: '#FB923C', glow: 'rgba(251,146,60,0.15)'  },
  { min: 71,  max: 130, label: 'Fries in Bag',          color: '#F59E0B', glow: 'rgba(245,158,11,0.15)'  },
  { min: 131, max: 220, label: 'Chud',                  color: '#84CC16', glow: 'rgba(132,204,22,0.15)'  },
  { min: 221, max: 350, label: 'Mtn Coder',             color: '#22C55E', glow: 'rgba(34,197,94,0.15)'   },
  { min: 351, max: 500, label: 'Cracked',               color: '#06B6D4', glow: 'rgba(6,182,212,0.15)'   },
  { min: 501, max: 700, label: 'True CS Major',         color: '#818CF8', glow: 'rgba(129,140,248,0.18)' },
  { min: 701, max: 950, label: 'FAANG Slayer',          color: '#C084FC', glow: 'rgba(192,132,252,0.18)' },
  { min: 951, max: Infinity, label: 'One Piece',        color: '#EC4899', glow: 'rgba(236,72,153,0.22)'  },
] as const;

function getTier(n: number) {
  return TIERS.find(t => n >= t.min && n <= t.max) ?? TIERS[0];
}

// ─── Heatmap ──────────────────────────────────────────────────────────────────

const WEEKS = 13;
const GAP = 3;

function heatColor(n: number) {
  if (n === 0) return '#21262D';
  if (n === 1) return '#0E4429';
  if (n <= 3)  return '#006D32';
  if (n <= 6)  return '#26A641';
  return '#39D353';
}

function Heatmap({ counts }: { counts: Map<string, number> }) {
  const cellSize = Math.floor((SW - PAD * 2 - space(8) - GAP * (WEEKS - 1)) / WEEKS);
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - WEEKS * 7 + 1);
  start.setDate(start.getDate() - start.getDay());

  const weeks = Array.from({ length: WEEKS }, (_, wi) =>
    Array.from({ length: 7 }, (_, di) => {
      const d = new Date(start);
      d.setDate(start.getDate() + wi * 7 + di);
      return d;
    })
  );

  return (
    <View style={{ flexDirection: 'row', gap: GAP }}>
      {weeks.map((week, wi) => (
        <View key={wi} style={{ flexDirection: 'column', gap: GAP }}>
          {week.map((day, di) => {
            const ds = day.toISOString().slice(0, 10);
            const count = counts.get(ds) ?? 0;
            const future = day > today;
            return (
              <View key={di} style={{
                width: cellSize, height: cellSize, borderRadius: 2,
                backgroundColor: future ? 'transparent' : heatColor(count),
              }} />
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ─── Arc chart ────────────────────────────────────────────────────────────────

function DiffArc({ label, color, count, target }: { label: string; color: string; count: number; target: number }) {
  const SIZE = 88;
  const cx = SIZE / 2, cy = SIZE / 2, r = 33;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(count / target, 1);
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Svg width={SIZE} height={SIZE}>
        <G rotation="-90" origin={`${cx},${cy}`}>
          <SvgCircle cx={cx} cy={cy} r={r} fill="none" stroke={colors.border} strokeWidth={5} />
          <SvgCircle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={5}
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
        </G>
        <SvgText x={cx} y={cy + 6} textAnchor="middle" fontSize={16} fontWeight="800" fill={color}>{count}</SvgText>
      </Svg>
      <Text style={{ color: colors.textLight, fontSize: 9, marginTop: 1 }}>/{target}</Text>
      <Text style={{ color, fontSize: 11, fontWeight: '700', marginTop: 1 }}>{label}</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MemberProfile() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Profile + streak
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

  // All-time solve stats
  const { data: allSolves } = useQuery({
    queryKey: ['member-alltime', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from('solves').select('points').eq('user_id', userId).limit(2000);
      return data ?? [];
    },
  });

  // This week
  const { data: weekSolves } = useQuery({
    queryKey: ['member-week', userId],
    enabled: !!userId,
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - since.getDay() + 1);
      since.setHours(0, 0, 0, 0);
      const { data } = await supabase.from('solves').select('points').eq('user_id', userId).gte('solved_at', since.toISOString());
      return data ?? [];
    },
  });

  // Heatmap
  const { data: heatmapData } = useQuery({
    queryKey: ['member-heatmap', userId],
    enabled: !!userId,
    queryFn: async () => {
      const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data } = await supabase.from('solves').select('solved_date').eq('user_id', userId).gte('solved_date', yearAgo);
      const map = new Map<string, number>();
      for (const r of data ?? []) map.set(r.solved_date, (map.get(r.solved_date) ?? 0) + 1);
      return map;
    },
  });

  // Recent solves
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
      return (data ?? []) as Array<{ id: string; solved_at: string; points: number; problems: { title: string; difficulty: 'easy' | 'medium' | 'hard' } | null }>;
    },
  });

  // LC stats
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
        headers: { 'Content-Type': 'application/json', 'Referer': `https://leetcode.com/${safeUsername}/`, 'User-Agent': 'Mozilla/5.0 Grind/0.1' },
        body: JSON.stringify({
          query: `query userStats($username: String!) { matchedUser(username: $username) { submitStatsGlobal { acSubmissionNum { difficulty count } } } }`,
          variables: { username: safeUsername },
        }),
      });
      if (!res.ok) return null;
      const json = await res.json();
      const nums: { difficulty: string; count: number }[] = json?.data?.matchedUser?.submitStatsGlobal?.acSubmissionNum ?? [];
      const get = (d: string) => nums.find(n => n.difficulty === d)?.count ?? 0;
      return { total: get('All'), easy: get('Easy'), medium: get('Medium'), hard: get('Hard') };
    },
  });

  const totalSolved = lcStats?.total ?? allSolves?.length ?? 0;
  const totalPts = allSolves?.reduce((s, r) => s + r.points, 0) ?? 0;
  const weekPts = weekSolves?.reduce((s, r) => s + r.points, 0) ?? 0;
  const tier = getTier(totalSolved);
  const name = profile?.display_name ?? profile?.username ?? '?';

  if (!profile) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.loader}><ActivityIndicator color={colors.accent} size="large" /></View>
      </View>
    );
  }

  const DIFF_COLOR = { easy: colors.easy, medium: colors.medium, hard: colors.hard };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space(20) }}>

        {/* Back button */}
        <Pressable style={s.back} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>

        {/* ── Hero ──────────────────────────────────── */}
        <View style={[s.hero, { borderTopColor: tier.color + '80', backgroundColor: tier.glow + 'AA' }]}>
          <View style={[s.avatarRing, { borderColor: tier.color, shadowColor: tier.color }]}>
            <Avatar name={name} size={84} url={profile.avatar_url} />
          </View>

          <Text style={s.heroName}>{name}</Text>
          <Text style={s.heroHandle}>@{profile.username}</Text>

          {safeUsername && (
            <View style={s.lcBadge}>
              <Ionicons name="code-slash" size={11} color={colors.accent} />
              <Text style={s.lcBadgeText}>{safeUsername}</Text>
            </View>
          )}

          <View style={[s.tierPill, { backgroundColor: tier.glow, borderColor: tier.color + '60' }]}>
            <View style={[s.tierDot, { backgroundColor: tier.color }]} />
            <Text style={[s.tierLabel, { color: tier.color }]}>{tier.label}</Text>
          </View>

          {/* Stats row */}
          <View style={s.statsRow}>
            <StatCell value={String(totalSolved)} label="Solved" />
            <View style={s.statDivider} />
            <StatCell value={String(totalPts)} label="Points" />
            <View style={s.statDivider} />
            <StatCell value={String(streak?.current_days ?? 0)} label="Streak" suffix="🔥" />
          </View>
        </View>

        {/* ── Activity heatmap ──────────────────────── */}
        {heatmapData && (
          <View style={[s.card, s.section]}>
            <View style={s.cardTitleRow}>
              <Text style={s.cardTitle}>ACTIVITY</Text>
              <Text style={s.cardTitleSub}>last 90 days</Text>
            </View>
            <Heatmap counts={heatmapData} />
            <View style={s.heatLegend}>
              <Text style={s.heatLegendLabel}>Less</Text>
              {[0, 1, 2, 4, 7].map(v => (
                <View key={v} style={{ width: 11, height: 11, borderRadius: 2, backgroundColor: heatColor(v) }} />
              ))}
              <Text style={s.heatLegendLabel}>More</Text>
            </View>
          </View>
        )}

        {/* ── This week ─────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>THIS WEEK</Text>
          <View style={s.row2}>
            <View style={s.weekCard}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={s.weekNum}>{weekSolves?.length ?? 0}</Text>
              <Text style={s.weekLabel}>Solved</Text>
            </View>
            <View style={s.weekCard}>
              <Ionicons name="star" size={20} color="#D97706" />
              <Text style={[s.weekNum, { color: '#D97706' }]}>{weekPts}</Text>
              <Text style={s.weekLabel}>Points</Text>
            </View>
            <View style={s.weekCard}>
              <Text style={{ fontSize: 20 }}>📅</Text>
              <Text style={[s.weekNum, { color: '#818CF8' }]}>{streak?.current_weeks ?? 0}</Text>
              <Text style={s.weekLabel}>Wk streak</Text>
            </View>
          </View>
        </View>

        {/* ── LC stats ──────────────────────────────── */}
        {lcStats && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>LEETCODE · {safeUsername}</Text>
            <View style={s.card}>
              <View style={s.lcTotalRow}>
                <View>
                  <Text style={s.lcTotalNum}>{lcStats.total}</Text>
                  <Text style={s.lcTotalSub}>problems solved</Text>
                </View>
                <View style={{ gap: space(2) }}>
                  {(['easy', 'medium', 'hard'] as const).map(d => (
                    <View key={d} style={[s.diffPill, { backgroundColor: DIFF_COLOR[d] + '18', borderColor: DIFF_COLOR[d] + '40' }]}>
                      <Text style={[s.diffPillCount, { color: DIFF_COLOR[d] }]}>
                        {lcStats[d]}
                      </Text>
                      <Text style={[s.diffPillLabel, { color: DIFF_COLOR[d] + 'AA' }]}>
                        {d.charAt(0).toUpperCase() + d.slice(1, d === 'medium' ? 3 : undefined)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
              <View style={s.arcRow}>
                <DiffArc label="Easy"   color={colors.easy}   count={lcStats.easy}   target={150} />
                <DiffArc label="Medium" color={colors.medium} count={lcStats.medium} target={200} />
                <DiffArc label="Hard"   color={colors.hard}   count={lcStats.hard}   target={75}  />
              </View>
            </View>
          </View>
        )}

        {/* ── Recent solves ─────────────────────────── */}
        {(recentSolves?.length ?? 0) > 0 && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>RECENT SOLVES</Text>
            <View style={s.card}>
              {recentSolves!.map((r, i) => {
                const diff = r.problems?.difficulty ?? 'medium';
                const dc = DIFF_COLOR[diff];
                return (
                  <View key={r.id} style={[s.solveRow, i < recentSolves!.length - 1 && s.solveRowBorder]}>
                    <View style={[s.solveDot, { backgroundColor: dc }]} />
                    <Text style={s.solveTitle} numberOfLines={1}>{r.problems?.title ?? 'Unknown'}</Text>
                    <Text style={[s.solveDiff, { color: dc }]}>
                      {diff.charAt(0).toUpperCase() + diff.slice(1)}
                    </Text>
                    <Text style={[s.solvePts, { color: dc }]}>+{r.points}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

      </ScrollView>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCell({ value, label, suffix }: { value: string; label: string; suffix?: string }) {
  return (
    <View style={s.statCell}>
      <Text style={s.statNum}>{value}{suffix}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  back: {
    paddingHorizontal: PAD, paddingTop: space(2), paddingBottom: space(1),
    alignSelf: 'flex-start',
  },

  // Hero
  hero: {
    paddingTop: space(6), paddingBottom: space(7), paddingHorizontal: PAD,
    alignItems: 'center', borderTopWidth: 3,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
    marginBottom: space(4), overflow: 'hidden',
  },
  avatarRing: {
    borderWidth: 2.5, borderRadius: 999, marginBottom: space(4), padding: 3,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 16,
  },
  heroName: { color: '#E6EDF3', fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  heroHandle: { color: 'rgba(230,237,243,0.45)', fontSize: 13, marginTop: 2, marginBottom: space(3) },
  lcBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(99,102,241,0.12)', borderRadius: 8,
    paddingHorizontal: space(3), paddingVertical: 4, marginBottom: space(4),
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.25)',
  },
  lcBadgeText: { color: '#A5B4FC', fontSize: 11, fontWeight: '700' },
  tierPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 10, borderWidth: 1,
    paddingHorizontal: space(4), paddingVertical: space(2),
    marginBottom: space(6),
  },
  tierDot: { width: 7, height: 7, borderRadius: 4 },
  tierLabel: { fontSize: 13, fontWeight: '800', letterSpacing: -0.2 },
  statsRow: {
    flexDirection: 'row', alignItems: 'center', width: '100%',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)',
    paddingTop: space(5),
  },
  statCell: { flex: 1, alignItems: 'center' },
  statNum: { color: '#E6EDF3', fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  statLabel: { color: 'rgba(230,237,243,0.5)', fontSize: 11, marginTop: 3 },
  statDivider: { width: 1, height: 30, backgroundColor: 'rgba(230,237,243,0.12)' },

  // Layout
  section: { paddingHorizontal: PAD, marginBottom: space(5) },
  sectionLabel: {
    color: colors.textDim, fontSize: 11, fontWeight: '700',
    letterSpacing: 0.8, marginBottom: space(3), textTransform: 'uppercase',
  },
  card: {
    backgroundColor: colors.card, borderRadius: radius.xl,
    padding: space(4), ...shadow.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: space(2), marginBottom: space(3) },
  cardTitle: { color: colors.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  cardTitleSub: { color: colors.textLight, fontSize: 10 },

  // Heatmap legend
  heatLegend: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: space(3), justifyContent: 'flex-end' },
  heatLegendLabel: { color: colors.textLight, fontSize: 10 },

  // Week cards
  row2: { flexDirection: 'row', gap: space(3) },
  weekCard: {
    flex: 1, backgroundColor: colors.card, borderRadius: radius.xl,
    padding: space(4), alignItems: 'center', gap: space(1), ...shadow.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  weekNum: { color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  weekLabel: { color: colors.textDim, fontSize: 11, fontWeight: '600' },

  // LC stats
  lcTotalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space(3) },
  lcTotalNum: { color: colors.text, fontSize: 42, fontWeight: '900', letterSpacing: -2, lineHeight: 48 },
  lcTotalSub: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  diffPill: {
    flexDirection: 'row', alignItems: 'center', gap: space(2),
    paddingHorizontal: space(3), paddingVertical: space(1),
    borderRadius: radius.md, borderWidth: 1,
  },
  diffPillCount: { fontSize: 12, fontWeight: '800' },
  diffPillLabel: { fontSize: 10, fontWeight: '600' },
  arcRow: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: space(2) },

  // Recent solves
  solveRow: {
    flexDirection: 'row', alignItems: 'center', gap: space(3),
    paddingVertical: space(3),
  },
  solveRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  solveDot: { width: 8, height: 8, borderRadius: 4 },
  solveTitle: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '600' },
  solveDiff: { fontSize: 11, fontWeight: '700' },
  solvePts: { fontSize: 13, fontWeight: '800', minWidth: 28, textAlign: 'right' },
});
