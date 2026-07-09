import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  SafeAreaView, Dimensions, Pressable,
} from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/stores/auth';
import { colors, radius, space, shadow } from '@/theme';
import { RadarChart } from '@/components/RadarChart';
import {
  useLcStats, useLcTagStats, useLcCalendar,
  buildRadarAxes, safeLcUsername, LC_TO_RADAR, RADAR_TARGET,
} from '@/lib/leetcode';
import { getPowerRank, computePowerBreakdown, POWER_RANKS } from '@/lib/power';

const { width: SW } = Dimensions.get('window');
const PAD = space(4);

// ─── Tag data ────────────────────────────────────────────────────────────────

const TAG_ORDER = [
  'Array / String', 'Two Pointers', 'Sliding Window', 'Prefix Sum',
  'Hash Map / Set', 'Stack', 'Queue', 'Linked List',
  'Binary Tree - DFS', 'Binary Tree - BFS', 'Binary Search Tree',
  'Graphs - DFS', 'Graphs - BFS', 'Heap / Priority Queue',
  'Binary Search', 'Backtracking', 'DP - 1D', 'DP - Multidimensional',
  'Bit Manipulation', 'Trie', 'Intervals', 'Monotonic Stack',
  'Math & Geometry', 'Advanced Graphs',
];

const TAG_SHORT: Record<string, string> = {
  'Array / String': 'Arrays',
  'Two Pointers': '2 Pointers',
  'Sliding Window': 'Sliding Win',
  'Prefix Sum': 'Prefix Sum',
  'Hash Map / Set': 'Hash Map',
  'Stack': 'Stack',
  'Queue': 'Queue',
  'Linked List': 'Linked List',
  'Binary Tree - DFS': 'Tree DFS',
  'Binary Tree - BFS': 'Tree BFS',
  'Binary Search Tree': 'BST',
  'Graphs - DFS': 'Graph DFS',
  'Graphs - BFS': 'Graph BFS',
  'Heap / Priority Queue': 'Heap/PQ',
  'Binary Search': 'Bin Search',
  'Backtracking': 'Backtrack',
  'DP - 1D': 'DP 1D',
  'DP - Multidimensional': 'DP Multi',
  'Bit Manipulation': 'Bit Manip',
  'Trie': 'Trie',
  'Intervals': 'Intervals',
  'Monotonic Stack': 'Mono Stack',
  'Math & Geometry': 'Math/Geo',
  'Advanced Graphs': 'Adv Graphs',
};

// ─── Types ────────────────────────────────────────────────────────────────────

type TagStat = { tag: string; total: number; solved: number; pct: number };

async function fetchStats(uid: string) {
  const [sr, pr] = await Promise.all([
    supabase.from('solves').select('problem_slug, points').eq('user_id', uid),
    supabase.from('problems').select('slug, tags, difficulty').eq('is_premium', false),
  ]);
  if (sr.error) throw sr.error;
  if (pr.error) throw pr.error;

  const problemMap = new Map((pr.data ?? []).map(p => [p.slug, p] as const));
  const seen = new Set<string>();
  const uniq: Array<{ problem_slug: string; points: number }> = [];
  for (const s of sr.data ?? []) {
    if (!seen.has(s.problem_slug)) { seen.add(s.problem_slug); uniq.push(s); }
  }

  const all = pr.data ?? [];
  const tagStats: TagStat[] = TAG_ORDER.map(tag => {
    const total = all.filter(p => (p.tags as string[])?.[0] === tag).length;
    const solved = uniq.filter(s => (problemMap.get(s.problem_slug)?.tags as string[])?.[0] === tag).length;
    return { tag, total, solved, pct: total > 0 ? solved / total : 0 };
  }).filter(t => t.total > 0);

  return { totalSolved: uniq.length, tagStats };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const TIER_LABELS = [
  { min: 0,   max: 10,  label: 'Homeless' },
  { min: 11,  max: 30,  label: 'Cooked' },
  { min: 31,  max: 70,  label: 'Underwater Technician' },
  { min: 71,  max: 130, label: 'Fries in Bag' },
  { min: 131, max: 220, label: 'Chud' },
  { min: 221, max: 350, label: 'Mtn Coder' },
  { min: 351, max: 500, label: 'Cracked' },
  { min: 501, max: 700, label: 'True CS Major' },
  { min: 701, max: 950, label: 'FAANG Slayer' },
  { min: 951, max: Infinity, label: 'One Piece' },
];

const CELL_GAP = 3;

function heatColor(count: number) {
  if (count === 0) return '#21262D';
  if (count === 1) return '#0E4429';
  if (count <= 3) return '#006D32';
  if (count <= 6) return '#26A641';
  return '#39D353';
}

function HeatmapChart({ counts }: { counts: Map<string, number> }) {
  const WEEKS = 13;
  const DAYS = 7;
  const GAP = 3;
  const cellSize = Math.floor((SW - PAD * 2 - space(8) - GAP * (WEEKS - 1)) / WEEKS);

  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - WEEKS * 7 + 1);
  start.setDate(start.getDate() - start.getDay()); // align to Sunday

  const weeks: Date[][] = Array.from({ length: WEEKS }, (_, wi) =>
    Array.from({ length: DAYS }, (_, di) => {
      const d = new Date(start);
      d.setDate(start.getDate() + wi * 7 + di);
      return d;
    })
  );

  return (
    <View style={{ flexDirection: 'row', gap: GAP, marginTop: space(3) }}>
      {weeks.map((week, wi) => (
        <View key={wi} style={{ flexDirection: 'column', gap: GAP }}>
          {week.map((day, di) => {
            const ds = day.toISOString().slice(0, 10);
            const count = counts.get(ds) ?? 0;
            const future = day > today;
            return (
              <View key={di} style={{
                width: cellSize, height: cellSize, borderRadius: 3,
                backgroundColor: future ? 'transparent' : heatColor(count),
              }} />
            );
          })}
        </View>
      ))}
    </View>
  );
}


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

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function Insights() {
  const { session } = useAuth();
  const uid = session?.user.id;

  const { data: profile } = useQuery({
    queryKey: ['profile', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('leetcode_username').eq('id', uid!).maybeSingle();
      return data;
    },
  });

  const safeUsername = safeLcUsername(profile?.leetcode_username);

  const { data: lcStats } = useLcStats(safeUsername);
  const { data: lcTagStats } = useLcTagStats(safeUsername);
  const { data: lcCalendar } = useLcCalendar(safeUsername);

  const { data, isLoading, error } = useQuery({
    queryKey: ['insights', uid],
    enabled: !!uid,
    queryFn: () => fetchStats(uid!),
    staleTime: 1000 * 60 * 5,
  });

  // Merge LC calendar (full year) with DB solves; LC calendar is source of truth for heatmap
  const { data: heatmapDbData } = useQuery({
    queryKey: ['heatmap', uid],
    enabled: !!uid,
    queryFn: () => fetchHeatmapData(uid!),
    staleTime: 1000 * 60 * 5,
  });
  const heatmapData = lcCalendar ?? heatmapDbData;

  const autoFetchedHints = useRef(false);
  const [hints, setHints] = useState<string[] | null>(null);
  const [hintsLoading, setHintsLoading] = useState(false);
  const [hintsConfigured, setHintsConfigured] = useState(true);
  const [hintsLastFetched, setHintsLastFetched] = useState(0);
  const [, setTick] = useState(0);
  const HINTS_TTL = 2 * 60 * 60 * 1000;
  const msLeft = Math.max(0, HINTS_TTL - (Date.now() - hintsLastFetched));
  const hintsCoolingDown = msLeft > 0 && hints !== null;

  useEffect(() => {
    if (!hintsCoolingDown) return;
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, [hintsCoolingDown]);

  const cooldownLabel = (() => {
    const h = Math.floor(msLeft / 3600000);
    const m = Math.floor((msLeft % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  })();

  // Wait for lcStats before auto-firing — avoids sending totalSolved:0 while LC API still loads
  useEffect(() => {
    if (lcStats?.total && !autoFetchedHints.current) {
      autoFetchedHints.current = true;
      fetchHints();
    }
  }, [lcStats?.total]);

  const fetchHints = async () => {
    if (!lcStats || lcStats.total === 0) return;
    setHintsLoading(true);
    try {
      const totalSolvedVal = lcStats.total;

      // Prefer DB tag stats; fall back to lcTagStats when DB has no solves
      let weakTopics: Array<{ label: string; pct: number }> = [];
      const dbHasTags = data?.tagStats && data.tagStats.some(t => t.pct > 0);
      if (dbHasTags) {
        weakTopics = [...data!.tagStats]
          .sort((a, b) => a.pct - b.pct)
          .slice(0, 4)
          .map(t => ({ label: TAG_SHORT[t.tag] ?? t.tag, pct: t.pct }));
      } else if (lcTagStats) {
        // Build weak topics from LC tag stats relative to radar targets
        weakTopics = Object.entries(RADAR_TARGET)
          .map(([label, target]) => {
            const tag = Object.entries(LC_TO_RADAR).find(([, v]) => v === label)?.[0];
            const solved = lcTagStats.find(t => t.tagName === tag)?.problemsSolved ?? 0;
            return { label, pct: Math.min(solved / target, 1) };
          })
          .sort((a, b) => a.pct - b.pct)
          .slice(0, 4);
      }
      const { data: res, error: fnErr } = await supabase.functions.invoke('ai-hints', {
        body: {
          userId: uid,
          weakTopics,
          totalSolved: totalSolvedVal,
          easy: lcStats?.easy ?? 0,
          medium: lcStats?.medium ?? 0,
          hard: lcStats?.hard ?? 0,
        },
      });
      if (fnErr) { setHintsConfigured(false); return; }
      if (res?.hints) {
        setHints(res.hints);
        setHintsLastFetched(res.refreshed_at ? new Date(res.refreshed_at).getTime() : Date.now());
      }
      if (res?.configured === false) setHintsConfigured(false);
    } catch {
      setHintsConfigured(false);
    } finally {
      setHintsLoading(false);
    }
  };

  if (isLoading || !data) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.loader}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={s.loaderText}>Loading insights…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.loader}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.hard} />
          <Text style={s.loaderText}>Failed to load stats</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { totalSolved, tagStats } = data;
  const noSyncedData = totalSolved === 0;

  // Build radar from LC tag data (direct from LeetCode, no DB dependency)
  const radarAxes = buildRadarAxes(lcTagStats);

  // Power level computation
  const powerBreakdown = computePowerBreakdown(lcStats, radarAxes, heatmapData);
  const powerRank = powerBreakdown ? getPowerRank(powerBreakdown.total) : null;
  const nextPowerRank = powerRank ? (POWER_RANKS[powerRank.index + 1] ?? null) : null;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.h1}>My Insights</Text>

        {/* Power Level */}
        {powerBreakdown && powerRank ? (
          <View style={[pl.card, { borderColor: powerRank.color + '35' }]}>
            <Text style={pl.label}>POWER LEVEL</Text>
            <Text style={[pl.number, { color: powerRank.color }]}>
              {powerBreakdown.total.toLocaleString()}
            </Text>
            <View style={pl.rankRow}>
              <View style={[pl.rankBadge, { backgroundColor: powerRank.color + '18', borderColor: powerRank.color + '55' }]}>
                <Text style={[pl.rankText, { color: powerRank.color }]}>{powerRank.label.toUpperCase()}</Text>
              </View>
            </View>
            {nextPowerRank ? (
              <>
                <View style={pl.progressBar}>
                  <View style={[pl.progressFill, {
                    width: `${Math.min(100, Math.round(((powerBreakdown.total - powerRank.min) / (nextPowerRank.min - powerRank.min)) * 100))}%` as any,
                    backgroundColor: powerRank.color,
                  }]} />
                </View>
                <Text style={pl.progressLabel}>
                  {(nextPowerRank.min - powerBreakdown.total).toLocaleString()} pts to {nextPowerRank.label}
                </Text>
              </>
            ) : (
              <Text style={[pl.progressLabel, { color: powerRank.color }]}>MAX RANK</Text>
            )}
            <View style={pl.breakdown}>
              <View style={pl.breakdownItem}>
                <Text style={pl.breakdownVal}>{powerBreakdown.diffScore.toLocaleString()}</Text>
                <Text style={pl.breakdownKey}>Difficulty</Text>
              </View>
              <View style={pl.breakdownDivider} />
              <View style={pl.breakdownItem}>
                <Text style={pl.breakdownVal}>{powerBreakdown.breadthBonus}</Text>
                <Text style={pl.breakdownKey}>Breadth</Text>
              </View>
              <View style={pl.breakdownDivider} />
              <View style={pl.breakdownItem}>
                <Text style={pl.breakdownVal}>{powerBreakdown.consistencyBonus}</Text>
                <Text style={pl.breakdownKey}>Consistency</Text>
              </View>
            </View>
          </View>
        ) : !lcStats && safeUsername ? (
          <View style={pl.card}>
            <Text style={pl.label}>POWER LEVEL</Text>
            <View style={[s.aiSkeleton, { width: 130, height: 44, alignSelf: 'center', marginBottom: space(3) }]} />
            <View style={[s.aiSkeleton, { width: 90, height: 22, alignSelf: 'center' }]} />
          </View>
        ) : null}

        {/* Skill Radar + AI Coach overlay */}
        <View style={s.radarCard}>
          <View style={s.radarWrap}>
            <RadarChart axes={radarAxes} color={colors.accent} />
            {!lcTagStats && (
              <View style={s.radarOverlay}>
                <Ionicons name="sync-outline" size={22} color={colors.accent} />
                <Text style={s.radarOverlayText}>
                  {safeUsername ? 'Loading topic data from LeetCode…' : 'Add your LeetCode username on the Me tab'}
                </Text>
              </View>
            )}
          </View>

          {/* AI Coach panel */}
          <View style={s.aiPanel}>
            <View style={s.aiPanelHeader}>
              <View style={s.aiLabelRow}>
                <View style={s.aiDot} />
                <Text style={s.aiLabel}>AI COACH ANALYSIS</Text>
              </View>
              <View style={s.aiRefreshWrap}>
                {hintsCoolingDown && <Text style={s.aiCooldown}>{cooldownLabel}</Text>}
                <Pressable onPress={fetchHints} disabled={hintsLoading || noSyncedData || hintsCoolingDown} style={s.aiRefresh}>
                  {hintsLoading
                    ? <ActivityIndicator size="small" color={colors.accent} />
                    : <Ionicons name="refresh" size={15} color={hintsCoolingDown ? colors.border : colors.textDim} />
                  }
                </Pressable>
              </View>
            </View>

            {!hintsConfigured && (
              <Text style={s.aiNotConfigured}>
                Deploy the ai-hints edge function and add ANTHROPIC_API_KEY to Supabase secrets.
              </Text>
            )}

            {hintsLoading && !hints && (
              <View style={s.aiLoading}>
                {[0, 1, 2].map(i => (
                  <View key={i} style={[s.aiSkeleton, { width: i === 2 ? '60%' : '100%' }]} />
                ))}
              </View>
            )}

            {hints && hints.map((h, i) => (
              <View key={i} style={[s.aiTip, i < hints.length - 1 && s.aiTipBorder]}>
                <Text style={s.aiTipNum}>{String(i + 1).padStart(2, '0')}</Text>
                <Text style={s.aiTipText}>{h}</Text>
              </View>
            ))}

            {!hints && !hintsLoading && hintsConfigured && (
              <Text style={s.aiEmpty}>
                {noSyncedData ? 'Sync LeetCode first to get personalized tips.' : 'Tap refresh to get personalized tips.'}
              </Text>
            )}
          </View>
        </View>

        {/* Solve heatmap */}
        {heatmapData && (
          <View style={s.card}>
            <Text style={s.cardTitle}>ACTIVITY — LAST 90 DAYS</Text>
            <HeatmapChart counts={heatmapData} />
            <View style={s.heatLegend}>
              <Text style={s.heatLegendLabel}>Less</Text>
              {[0,1,2,4,7].map(v => (
                <View key={v} style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: heatColor(v) }} />
              ))}
              <Text style={s.heatLegendLabel}>More</Text>
            </View>
          </View>
        )}


        {/* Time to next tier */}
        {lcStats && (() => {
          const solved = lcStats.total;
          const curTier = TIER_LABELS.find(t => solved >= t.min && solved <= t.max) ?? TIER_LABELS[0];
          const nextTier = TIER_LABELS[TIER_LABELS.indexOf(curTier) + 1];
          if (!nextTier) return null;
          const toNext = nextTier.min - solved;
          const weeksData = heatmapData
            ? Array.from({ length: 4 }, (_, w) => {
                let count = 0;
                for (let d = 0; d < 7; d++) {
                  const day = new Date(); day.setDate(day.getDate() - (w * 7 + d));
                  count += heatmapData.get(day.toISOString().slice(0, 10)) ?? 0;
                }
                return count;
              })
            : [];
          const avgPerWeek = weeksData.length
            ? weeksData.reduce((a, b) => a + b, 0) / weeksData.filter(w => w > 0).length || 1
            : 1;
          const weeksEta = Math.ceil(toNext / Math.max(avgPerWeek, 0.5));
          return (
            <View style={[s.card, s.tierEtaCard]}>
              <View style={s.tierEtaTop}>
                <Ionicons name="trophy-outline" size={16} color={colors.accent} />
                <Text style={s.cardTitle}>NEXT TIER</Text>
              </View>
              <Text style={s.tierEtaName}>{nextTier.label}</Text>
              <Text style={s.tierEtaSub}>
                {toNext} more solve{toNext !== 1 ? 's' : ''} · ~{weeksEta} week{weeksEta !== 1 ? 's' : ''} at your pace
              </Text>
              <View style={s.tierEtaBar}>
                <View style={[s.tierEtaFill, {
                  width: `${Math.round(((solved - curTier.min) / (nextTier.min - curTier.min)) * 100)}%` as any,
                }]} />
              </View>
            </View>
          );
        })()}

        {/* Top topic this week */}
        {lcTagStats && (() => {
          const acc = new Map<string, number>();
          for (const { tagName, problemsSolved } of lcTagStats) {
            const label = LC_TO_RADAR[tagName];
            if (label) acc.set(label, (acc.get(label) ?? 0) + problemsSolved);
          }
          const sorted = [...acc.entries()].sort((a, b) => b[1] - a[1]);
          if (!sorted.length) return null;
          const [topLabel, topCount] = sorted[0];
          const weakLabel = sorted[sorted.length - 1][0];
          return (
            <View style={s.row2card}>
              <View style={[s.miniCard, { borderColor: colors.success + '40' }]}>
                <Text style={s.miniCardIcon}>💪</Text>
                <Text style={s.miniCardLabel}>STRENGTH</Text>
                <Text style={[s.miniCardValue, { color: colors.success }]}>{topLabel}</Text>
                <Text style={s.miniCardSub}>{topCount} solved</Text>
              </View>
              <View style={[s.miniCard, { borderColor: colors.hard + '40' }]}>
                <Text style={s.miniCardIcon}>📉</Text>
                <Text style={s.miniCardLabel}>WEAKEST</Text>
                <Text style={[s.miniCardValue, { color: colors.hard }]}>{weakLabel}</Text>
                <Text style={s.miniCardSub}>needs work</Text>
              </View>
            </View>
          );
        })()}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space(2), paddingHorizontal: PAD },
  loaderText: { color: colors.textDim, fontSize: 15, fontWeight: '600' },
  emptySubtext: { color: colors.textLight, fontSize: 13, textAlign: 'center', marginTop: space(1) },
  scroll: { paddingHorizontal: PAD, paddingTop: space(4), paddingBottom: space(20) },
  h1: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginBottom: space(4) },

  // Card wrapper
  card: {
    backgroundColor: colors.card, borderRadius: radius.xl,
    padding: space(4), marginBottom: space(4), ...shadow.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  cardTitle: { color: colors.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: space(1) },

  // Heatmap
  heatLegend: { flexDirection: 'row', alignItems: 'center', gap: CELL_GAP, marginTop: space(3), justifyContent: 'flex-end' },
  heatLegendLabel: { color: colors.textLight, fontSize: 10 },

  // Tier ETA card
  tierEtaCard: { borderColor: colors.accent + '30' },
  tierEtaTop: { flexDirection: 'row', alignItems: 'center', gap: space(2), marginBottom: space(1) },
  tierEtaName: { color: colors.text, fontSize: 20, fontWeight: '900', letterSpacing: -0.3, marginBottom: 2 },
  tierEtaSub: { color: colors.textDim, fontSize: 12, marginBottom: space(3) },
  tierEtaBar: { height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' },
  tierEtaFill: { height: 4, backgroundColor: colors.accent, borderRadius: 2 },

  // Strength/weakness mini cards
  row2card: { flexDirection: 'row', gap: space(3), marginBottom: space(4) },
  miniCard: {
    flex: 1, backgroundColor: colors.card, borderRadius: radius.xl,
    padding: space(4), alignItems: 'center', gap: space(1),
    borderWidth: 1, ...shadow.sm,
  },
  miniCardIcon: { fontSize: 22 },
  miniCardLabel: { color: colors.textLight, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  miniCardValue: { fontSize: 14, fontWeight: '800', textAlign: 'center' },
  miniCardSub: { color: colors.textLight, fontSize: 11 },
  companyDiffCount: { width: 48, fontSize: 12, fontWeight: '700', textAlign: 'right' },

  // Radar + AI overlay card
  radarCard: {
    backgroundColor: colors.card, borderRadius: radius.xl,
    marginBottom: space(4), overflow: 'hidden', ...shadow.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  radarWrap: { alignItems: 'center', paddingTop: space(3), paddingBottom: space(1), position: 'relative' },
  radarOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', gap: space(2),
    backgroundColor: 'rgba(13,17,23,0.7)',
  },
  radarOverlayText: { color: colors.textDim, fontSize: 13, fontWeight: '600', textAlign: 'center', paddingHorizontal: space(8) },

  // AI Coach panel
  aiPanel: {
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#0D1117',
    padding: space(4),
  },
  aiPanelHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: space(3),
  },
  aiLabelRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  aiDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: colors.accent,
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 4,
  },
  aiLabel: { color: colors.accent, fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  aiRefreshWrap: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  aiRefresh: { padding: space(1) },
  aiCooldown: { color: colors.border, fontSize: 11, fontWeight: '600' },
  aiTip: { flexDirection: 'row', gap: space(3), paddingVertical: space(3) },
  aiTipBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  aiTipNum: { color: colors.accent, fontSize: 11, fontWeight: '800', width: 20, marginTop: 1, opacity: 0.7 },
  aiTipText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19 },
  aiLoading: { gap: space(2), paddingVertical: space(2) },
  aiSkeleton: {
    height: 12, borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignSelf: 'flex-start',
  },
  aiEmpty: { color: colors.textLight, fontSize: 13, textAlign: 'center', paddingVertical: space(3) },
  aiNotConfigured: { color: colors.textDim, fontSize: 12, fontStyle: 'italic', paddingBottom: space(2) },
});

const pl = StyleSheet.create({
  card: {
    backgroundColor: colors.card, borderRadius: radius.xl,
    padding: space(5), marginBottom: space(4), ...shadow.md,
    borderWidth: 1, alignItems: 'center',
  },
  label: { color: colors.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: space(2) },
  number: { fontSize: 56, fontWeight: '900', letterSpacing: -2 },
  rankRow: { marginTop: space(2), marginBottom: space(3) },
  rankBadge: { paddingHorizontal: space(4), paddingVertical: space(1), borderRadius: 20, borderWidth: 1 },
  rankText: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  progressBar: {
    width: '100%', height: 4, backgroundColor: colors.border,
    borderRadius: 2, overflow: 'hidden', marginBottom: space(2),
  },
  progressFill: { height: 4, borderRadius: 2 },
  progressLabel: { color: colors.textLight, fontSize: 11, marginBottom: space(2) },
  breakdown: {
    flexDirection: 'row', alignItems: 'center', width: '100%',
    marginTop: space(4), paddingTop: space(4),
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  breakdownItem: { flex: 1, alignItems: 'center', gap: 2 },
  breakdownDivider: { width: 1, height: 28, backgroundColor: colors.border },
  breakdownVal: { color: colors.text, fontSize: 16, fontWeight: '800' },
  breakdownKey: { color: colors.textLight, fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
});
