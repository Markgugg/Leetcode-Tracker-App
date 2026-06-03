import {
  View, Text, ScrollView, StyleSheet, Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, shadow } from '@/theme';

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

const VERDICT_COLOR: Record<string, string> = {
  'Strong Hire':  colors.success,
  'Lean Hire':    '#22C55E',
  'Mixed':        colors.medium,
  'Lean No Hire': colors.hard,
  'No Hire':      colors.hard,
};

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

function scoreBarColor(s: number) {
  if (s >= 4.5) return colors.success;
  if (s >= 3.5) return '#22C55E';
  if (s >= 2.5) return colors.medium;
  return colors.hard;
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

function CompetencyRow({ row, last }: { row: ScoreRow; last: boolean }) {
  const c = scoreBarColor(row.score);
  const pct = (row.score / 5) * 100;
  return (
    <View style={[s.compRow, !last && s.compRowBorder]}>
      <View style={s.compTop}>
        <Text style={s.compLabel}>{row.label}</Text>
        <Text style={[s.compScore, { color: c }]}>
          {row.score}<Text style={s.compScoreOf}>/s</Text>
        </Text>
      </View>
      <View style={s.barTrack}>
        <View style={[s.barFill, { width: `${pct}%`, backgroundColor: c }]} />
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
  const verdictColor = VERDICT_COLOR[report.verdict] ?? colors.success;
  const optimal = optimalFromSignal(report.signal ?? 0);
  const ratingGain = Math.round((report.signal ?? 0) * 0.2);

  // Find next tier for pace line
  const nextTier = TIER_LABELS.find(t => t.min > 0) ?? TIER_LABELS[1];
  const roundsToNext = Math.max(1, Math.ceil(3 - (report.signal ?? 0) / 40));

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space(20) }}>

        {/* ── Top bar ──────────────────────────────────── */}
        <View style={s.topBar}>
          <Pressable style={s.iconBtn} onPress={() => router.push('/(tabs)/log')} hitSlop={12}>
            <Ionicons name="close" size={16} color={colors.textDim} />
          </Pressable>
          <Text style={s.topTitle}>INTERVIEW REPORT</Text>
          <Pressable style={s.iconBtn} hitSlop={12}>
            <Ionicons name="share-outline" size={16} color={colors.textDim} />
          </Pressable>
        </View>

        {/* ── Verdict hero ─────────────────────────────── */}
        <View style={s.heroSection}>
          <View style={s.aiAvatarRow}>
            <View style={s.aiAvatar}>
              <Ionicons name="sparkles" size={13} color="#fff" />
            </View>
            <Text style={s.aiLabel}>LeetAI verdict</Text>
          </View>

          <View style={s.verdictRow}>
            {/* Signal donut */}
            <View style={s.donutWrap}>
              <View style={[s.donutOuter, { borderColor: verdictColor }]}>
                <View style={s.donutInner}>
                  <Text style={s.donutNum}>{report.signal}</Text>
                  <Text style={s.donutSub}>SIGNAL</Text>
                </View>
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.verdictText, { color: verdictColor }]}>{report.verdict}</Text>
              <Text style={s.summaryText}>{report.summary}</Text>
            </View>
          </View>
        </View>

        {/* ── Meta row ─────────────────────────────────── */}
        <View style={s.metaRow}>
          {([
            ['Time',       mmss(elapsed)],
            ['Hints used', hintsUsed],
            ['Optimal',    optimal],
          ] as [string, string][]).map(([k, v]) => (
            <View key={k} style={s.metaCard}>
              <Text style={s.metaVal} numberOfLines={1}>{v}</Text>
              <Text style={s.metaKey}>{k}</Text>
            </View>
          ))}
        </View>

        {/* ── Signal breakdown ─────────────────────────── */}
        <View style={[s.card, s.section]}>
          <Text style={s.sectionLabel}>SIGNAL BREAKDOWN</Text>
          {report.scores?.map((row, i) => (
            <CompetencyRow key={row.label} row={row} last={i === report.scores.length - 1} />
          ))}
        </View>

        {/* ── Rating tier tie-in ───────────────────────── */}
        <View style={s.section}>
          <Pressable style={s.tierCard} onPress={() => router.push('/(tabs)/log')}>
            <View style={[s.tierIconWrap]}>
              <Ionicons name="trophy-outline" size={18} color={colors.accentText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.tierTitle}>+{ratingGain} Interview Rating</Text>
              <Text style={s.tierSub}>
                On pace for FAANG Slayer · {roundsToNext} strong round{roundsToNext !== 1 ? 's' : ''} to go
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={colors.accentText} />
          </Pressable>
        </View>

        {/* ── AI coaching note ─────────────────────────── */}
        <View style={[s.card, s.section]}>
          <View style={s.coachRow}>
            <View style={s.aiAvatar}>
              <Ionicons name="sparkles" size={13} color="#fff" />
            </View>
            <Text style={s.coachText}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>Next rep: </Text>
              {report.coaching}
            </Text>
          </View>
        </View>

        {/* ── CTAs ─────────────────────────────────────── */}
        <View style={[s.ctaRow, s.section]}>
          <Pressable style={s.ctaSecondary}>
            <Text style={s.ctaSecondaryText}>Share card</Text>
          </Pressable>
          <Pressable style={s.ctaPrimary} onPress={() => router.replace('/interview')}>
            <Ionicons name="sparkles" size={15} color="#fff" />
            <Text style={s.ctaPrimaryText}>Run another round</Text>
          </Pressable>
        </View>

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PAD = space(4);

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: PAD, paddingBottom: space(3),
  },
  iconBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  topTitle: { color: colors.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },

  // Hero
  heroSection: { paddingHorizontal: PAD, marginBottom: space(4) },
  aiAvatarRow: { flexDirection: 'row', alignItems: 'center', gap: space(2), marginBottom: space(4) },
  aiAvatar: {
    width: 26, height: 26, borderRadius: 8, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  aiLabel: { color: colors.textDim, fontSize: 12, fontWeight: '600' },

  verdictRow: { flexDirection: 'row', alignItems: 'center', gap: space(4) },
  donutWrap: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  donutOuter: {
    width: 92, height: 92, borderRadius: 46, borderWidth: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  donutInner: { alignItems: 'center' },
  donutNum: { color: colors.text, fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  donutSub: { color: colors.textLight, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },

  verdictText: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  summaryText: { color: colors.textDim, fontSize: 12, marginTop: 4, lineHeight: 17, maxWidth: 180 },

  // Meta
  metaRow: { flexDirection: 'row', gap: space(2), paddingHorizontal: PAD, marginBottom: space(4) },
  metaCard: {
    flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: space(3), alignItems: 'center',
  },
  metaVal: { color: colors.text, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  metaKey: { color: colors.textDim, fontSize: 10, fontWeight: '600', marginTop: 2 },

  // Competency card
  section: { paddingHorizontal: PAD, marginBottom: space(4) },
  sectionLabel: {
    color: colors.textDim, fontSize: 10, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: space(3),
  },
  card: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.xl, padding: space(4), ...shadow.sm,
  },

  compRow: { paddingVertical: space(3) },
  compRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  compTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: space(2),
  },
  compLabel: { color: colors.text, fontSize: 13, fontWeight: '600' },
  compScore: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  compScoreOf: { color: colors.textLight, fontSize: 10, fontWeight: '600' },
  barTrack: { height: 5, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden', marginBottom: space(2) },
  barFill: { height: 5, borderRadius: 3 },
  compNote: { color: colors.textDim, fontSize: 11, lineHeight: 16 },

  // Tier card
  tierCard: {
    flexDirection: 'row', alignItems: 'center', gap: space(3),
    backgroundColor: colors.accentLight, borderWidth: 1, borderColor: colors.accent + '50',
    borderRadius: radius.xl, padding: space(4),
  },
  tierIconWrap: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: colors.accent + '20',
    alignItems: 'center', justifyContent: 'center',
  },
  tierTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  tierSub: { color: colors.accentText, fontSize: 11, marginTop: 2 },

  // Coach
  coachRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space(3) },
  coachText: { flex: 1, color: colors.textDim, fontSize: 13, lineHeight: 20 },

  // CTAs
  ctaRow: { flexDirection: 'row', gap: space(3) },
  ctaSecondary: {
    flex: 1, paddingVertical: space(4), borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center',
  },
  ctaSecondaryText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  ctaPrimary: {
    flex: 1.4, paddingVertical: space(4), borderRadius: radius.lg, backgroundColor: colors.accent,
    alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: space(2),
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 5,
  },
  ctaPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
