import {
  View, Text, ScrollView, StyleSheet, Pressable,
} from 'react-native';
import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming,
} from 'react-native-reanimated';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import { GlassCard } from '@/components/GlassCard';
import { ProgressRing } from '@/components/Ring';
import {
  EASE, clamp, colors, duration, pressed, radius, space, tabular, type as T,
} from '@/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type ScoreRow = { label: string; score: number; note: string };

type Report = {
  verdict: string;
  signal: number;
  summary: string;
  scores: ScoreRow[];
  coaching: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/* Verdict + score colors come from the §1 ring/difficulty hues only — the old
   ad-hoc `#22C55E` green is gone. */
const VERDICT_COLOR: Record<string, string> = {
  'Strong Hire':  colors.difficulty,
  'Lean Hire':    colors.difficulty,
  'Mixed':        colors.medium,
  'Lean No Hire': colors.volume,
  'No Hire':      colors.volume,
};

/* Rank naming lives in exactly one place per §3.9/§6: `RANKS` in
   src/ranks/ranks-data.ts. This screen reports rating delta only. */

function scoreBarColor(s: number) {
  if (s >= 3.5) return colors.difficulty;
  if (s >= 2.5) return colors.medium;
  return colors.volume;
}

function mmss(secs: number) {
  return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
}

function optimalFromSignal(signal: number): string {
  if (signal >= 75) return 'Yes';
  if (signal >= 50) return 'Likely';
  return 'No';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CompetencyRow({ row, last, index }: { row: ScoreRow; last: boolean; index: number }) {
  const c = scoreBarColor(row.score);
  const pct = clamp(row.score / 5);

  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withDelay(
      120 + index * 70,
      withTiming(pct, { duration: duration.progressBar, easing: Easing.bezier(...EASE.ring) }),
    );
  }, [pct]);
  const barStyle = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));

  return (
    <View style={[s.compRow, !last && s.compRowBorder]}>
      <View style={s.compTop}>
        <Text style={s.compLabel}>{row.label}</Text>
        <Text style={[s.compScore, { color: c }]}>
          {row.score}<Text style={s.compScoreOf}>/5</Text>
        </Text>
      </View>
      <View style={s.barTrack}>
        <Animated.View style={[s.barFill, { backgroundColor: c }, barStyle]} />
      </View>
      <Text style={s.compNote}>{row.note}</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function InterviewReport() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    reportJson: string;
    problemTitle: string;
    problemDiff: string;
    elapsed: string;
    hintsUsed: string;
  }>();

  const report: Report = JSON.parse(params.reportJson ?? '{}');
  const elapsed = parseInt(params.elapsed ?? '0', 10);
  const hintsUsed = params.hintsUsed ?? '0';
  const verdictColor = VERDICT_COLOR[report.verdict] ?? colors.difficulty;
  const optimal = optimalFromSignal(report.signal ?? 0);
  const ratingGain = Math.round((report.signal ?? 0) * 0.2);

  const META: [string, string, string][] = [
    ['Time',  mmss(elapsed), colors.streak],
    ['Hints', hintsUsed,     colors.medium],
    ['Optimal', optimal,     colors.difficulty],
  ];

  return (
    <View style={s.root}>
      <AmbientBackdrop />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + space(12) }}>

        {/* ── Top bar ──────────────────────────────────── */}
        <View style={s.topBar}>
          <Pressable
            style={({ pressed: p }) => [s.iconBtn, p && pressed]}
            onPress={() => router.push('/(tabs)/practice')}
            hitSlop={12}>
            <Ionicons name="close" size={17} color={colors.textSecondary} />
          </Pressable>
          <Text style={s.topTitle}>INTERVIEW REPORT</Text>
          <Pressable style={({ pressed: p }) => [s.iconBtn, p && pressed]} hitSlop={12}>
            <Ionicons name="share-outline" size={16} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* ── Verdict hero ─────────────────────────────── */}
        <View style={s.hero}>
          <Text style={s.eyebrow}>LEETAI VERDICT</Text>
          <Text style={[s.verdictText, { color: verdictColor }]}>{report.verdict}</Text>
          {params.problemTitle ? (
            <Text style={s.heroProblem}>{params.problemTitle}</Text>
          ) : null}
        </View>

        <View style={s.section}>
          <GlassCard>
            <View style={s.signalRow}>
              <ProgressRing
                progress={clamp((report.signal ?? 0) / 100)}
                size={104}
                strokeWidth={6}
                r={25}
                color={verdictColor}
                trackColor="rgba(255,255,255,0.10)">
                <View style={s.ringCenter}>
                  <Text style={s.signalNum}>{report.signal ?? 0}</Text>
                  <Text style={s.signalUnit}>SIGNAL</Text>
                </View>
              </ProgressRing>
              <Text style={s.summaryText}>{report.summary}</Text>
            </View>
          </GlassCard>
        </View>

        {/* ── Meta row ─────────────────────────────────── */}
        <View style={[s.metaRow, s.section]}>
          {META.map(([k, v, c]) => (
            <GlassCard key={k} variant="small" style={{ flex: 1 }} contentStyle={s.metaInner}>
              <Text style={[s.metaVal, { color: c }]} numberOfLines={1}>{v}</Text>
              <Text style={s.metaKey}>{k}</Text>
            </GlassCard>
          ))}
        </View>

        {/* ── Signal breakdown ─────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>SIGNAL BREAKDOWN</Text>
          <GlassCard>
            {report.scores?.map((row, i) => (
              <CompetencyRow
                key={row.label}
                row={row}
                index={i}
                last={i === report.scores.length - 1}
              />
            ))}
          </GlassCard>
        </View>

        {/* ── Rating tier tie-in ───────────────────────── */}
        <View style={s.section}>
          <GlassCard
            fill={colors.accentSelectedFill}
            borderColor={colors.accentSelectedBorder}
            onPress={() => router.push('/(tabs)/you')}
            contentStyle={s.tierInner}>
            <View style={s.tierIconWrap}>
              <Ionicons name="trophy-outline" size={19} color={colors.accentText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.tierTitle}>+{ratingGain} Interview Rating</Text>
              <Text style={s.tierSub}>
                Signal {report.signal ?? 0}/100 · see your rank in You
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.accentText} />
          </GlassCard>
        </View>

        {/* ── AI coaching note ─────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>NEXT REP</Text>
          <GlassCard>
            <View style={s.coachRow}>
              <View style={s.coachDot} />
              <Text style={s.coachText}>{report.coaching}</Text>
            </View>
          </GlassCard>
        </View>

        {/* ── CTAs ─────────────────────────────────────── */}
        <View style={[s.ctaRow, s.section]}>
          <Pressable style={({ pressed: p }) => [s.ctaSecondary, p && pressed]}>
            <Text style={s.ctaSecondaryText}>Share card</Text>
          </Pressable>
          <Pressable
            style={({ pressed: p }) => [s.ctaPrimary, p && pressed]}
            onPress={() => router.replace('/interview')}>
            <Text style={s.ctaPrimaryText}>Run another round</Text>
          </Pressable>
        </View>

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PAD = 20;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: PAD, height: 44,
  },
  iconBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.controlAlt16, borderWidth: 0.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  topTitle: { ...T.microLabel, color: colors.textTertiary },

  // Hero
  hero: { paddingHorizontal: PAD, paddingTop: space(4), paddingBottom: space(4) },
  eyebrow: { ...T.microLabel, color: colors.textTertiary, marginBottom: space(2) },
  verdictText: { ...T.largeTitle },
  heroProblem: { ...T.bodySecondary, color: colors.textSecondary, marginTop: 4 },

  section: { paddingHorizontal: PAD, marginBottom: space(3.5) },
  sectionLabel: {
    ...T.microLabel, color: colors.textTertiary, marginBottom: space(2.5), marginLeft: 2,
  },

  // Signal
  signalRow: { flexDirection: 'row', alignItems: 'center', gap: space(4) },
  ringCenter: { alignItems: 'center' },
  signalNum: { ...T.statNumeralSm, ...tabular, color: colors.text },
  signalUnit: { ...T.chartLabel, color: colors.textTertiary, letterSpacing: 0.6, marginTop: 1 },
  summaryText: { ...T.bodySecondary, color: colors.textSecondary, flex: 1 },

  // Meta
  metaRow: { flexDirection: 'row', gap: space(2.5) },
  metaInner: { paddingVertical: 14, paddingHorizontal: 10, alignItems: 'center' },
  metaVal: { ...T.ringValue, ...tabular },
  metaKey: { ...T.chartLabel, color: colors.textTertiary, letterSpacing: 0.5, marginTop: 3 },

  // Competency rows
  compRow: { paddingVertical: space(3) },
  compRowBorder: { borderBottomWidth: 0.5, borderBottomColor: colors.hairline },
  compTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: space(2),
  },
  compLabel: { ...T.bodyRow, color: colors.text },
  compScore: { fontSize: 15.5, fontWeight: '700', letterSpacing: -0.3, ...tabular },
  compScoreOf: { color: colors.textQuaternary, fontSize: 11.5, fontWeight: '600' },
  barTrack: {
    height: 5, backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3, overflow: 'hidden', marginBottom: space(2),
  },
  barFill: { height: 5, borderRadius: 3 },
  compNote: { ...T.bodySecondary, fontSize: 12.5, lineHeight: 18, color: colors.textTertiary },

  // Tier card
  tierInner: {
    flexDirection: 'row', alignItems: 'center', gap: space(3), padding: space(4),
  },
  tierIconWrap: {
    width: 38, height: 38, borderRadius: radius.iconSquare,
    backgroundColor: 'rgba(123,97,255,0.24)',
    alignItems: 'center', justifyContent: 'center',
  },
  tierTitle: { ...T.bodyRow, color: colors.text, fontWeight: '600' },
  tierSub: { ...T.caption, color: colors.accentText, marginTop: 2 },

  // Coach
  coachRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space(3) },
  coachDot: {
    width: 6, height: 6, borderRadius: 3, marginTop: 8,
    backgroundColor: colors.streak,
  },
  coachText: { ...T.body, fontSize: 15, lineHeight: 22, color: colors.textSecondary, flex: 1 },

  // CTAs
  ctaRow: { flexDirection: 'row', gap: space(2.5), marginTop: space(1) },
  ctaSecondary: {
    flex: 1, paddingVertical: 15, borderRadius: radius.pill,
    borderWidth: 0.5, borderColor: colors.borderOutline,
    backgroundColor: colors.control, alignItems: 'center', justifyContent: 'center',
  },
  ctaSecondaryText: { ...T.buttonLabelInline, color: colors.text },
  ctaPrimary: {
    flex: 1.35, paddingVertical: 15, borderRadius: radius.pill, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaPrimaryText: { ...T.buttonLabelInline, color: '#FFFFFF' },
});
