/**
 * §3.11 "Topic Coverage sheet" — rebuilt Fitness-style.
 *
 * The old sheet was a flat, undifferentiated list of 24 topics: nothing owned
 * the top of the screen and every row weighed the same, so clicking in told you
 * nothing you could act on. The rebuild borrows Apple Fitness's day drill-down
 * shape, with our colours and our data:
 *
 *   • the metric owns the top — the radar (small, morphing) sits above a huge
 *     coverage-coloured "{solved}/{total}" numeral and a "TOTAL n TOPICS"
 *     caption in the same colour;
 *   • no boxy cards inside the sheet: content sits directly on the sheet
 *     surface, separated by hairlines and generous vertical rhythm;
 *   • the flat list becomes three state sections — STRONG / DEVELOPING / WEAK —
 *     headed by plain uppercase labels in the bucket colour, and the single
 *     weakest topic gets a featured treatment (big #FA114F numeral, a one-line
 *     verdict, and a tinted "Practice {topic}" pill);
 *   • buttons are calm grey pills (`PillButton`), never bordered chips.
 *
 * The hero radar needs `radarByRange` / `medianByRange` / `topicCount`, which
 * `app/(tabs)/index.tsx` passes straight through from `useSummaryData`. They
 * stay optional so the sheet degrades to "sections only" — no radar, no crew
 * comparison — for any other call site that has topics but no radar.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { PillButton } from '@/components/PillButton';
import { Segmented } from '@/components/Segmented';
import { Sheet } from '@/components/Sheet';
import { EASE, clamp, colors, duration, spacing, tabular } from '@/theme';
import { Hairline } from './parts';
import { MorphRadar } from './MorphRadar';
import { AXIS_DIVISOR, RADAR_AXES } from './useSummaryData';
import type { RadarAxisStat, TopicRange, TopicStat } from './useSummaryData';

const OPTIONS = [
  { label: 'This week', value: 'week' as TopicRange },
  { label: 'This month', value: 'month' as TopicRange },
  { label: 'All time', value: 'all' as TopicRange },
];

const RANGE_PHRASE: Record<TopicRange, string> = {
  week: 'this week',
  month: 'this month',
  all: 'all time',
};

/* §3.7 coverage ramp, as three named states. `coverageColor` uses the same
   thresholds — kept as an explicit table because the sections need the label
   and the ordering too, not just the colour. */
const STRONG_AT = 0.4;
const DEVELOPING_AT = 0.25;

type Bucket = 'strong' | 'developing' | 'weak';

const BUCKETS: { key: Bucket; label: string; color: string; blurb: string }[] = [
  { key: 'strong', label: 'Strong', color: colors.difficulty, blurb: '40% and up' },
  { key: 'developing', label: 'Developing', color: colors.medium, blurb: '25–39%' },
  { key: 'weak', label: 'Weak', color: colors.volume, blurb: 'under 25%' },
];

/**
 * Displayed percentage, floored — never rounded.
 *
 * The bucket boundaries are exact (`bucketOf` / `coverageColor` both split at
 * 0.40 and 0.25) but the section headers quote whole-number ranges, so rounding
 * printed a row that contradicted the header it sat under: 0.396 rendered "40%"
 * inside "DEVELOPING · 25–39%", and 0.246 rendered "25%" inside "WEAK · under
 * 25%". Flooring makes the printed number mean "has reached this threshold",
 * which is exactly what the bucketing tests.
 */
const pctLabel = (pct: number) => Math.floor(pct * 100);

const bucketOf = (pct: number): Bucket =>
  pct >= STRONG_AT ? 'strong' : pct >= DEVELOPING_AT ? 'developing' : 'weak';

/**
 * A tag needs this many catalog problems before it can be "the" weakest topic.
 * Mirrors `MIN_TOPIC_SIZE` in `useSummaryData`: a 3-problem tag sits at 0%
 * forever and would win the featured slot every single time.
 */
const MIN_FEATURED_SIZE = 4;

/**
 * The lower clamp inside `axisValue` (`useSummaryData`: `clamp(pct / 0.55,
 * 0.04, 1)`). Mirrored rather than imported because it is a plotting floor that
 * belongs to the radar, not a coverage value — here it is only used to
 * recognise a saturated reading and decline to draw it.
 */
const AXIS_FLOOR = 0.04;

export interface TopicCoverageSheetProps {
  visible: boolean;
  onClose: () => void;
  topicsByRange: Record<TopicRange, TopicStat[]>;
  /** Distinct catalog problems solved, per range. */
  solvedByRange: Record<TopicRange, number>;
  totalProblems: number;
  /** The eight §4 axes per range — drives the hero radar's morph. */
  radarByRange?: Record<TopicRange, RadarAxisStat[]>;
  /** Crew median per axis, per range; `null` when the user has no crew. */
  medianByRange?: Record<TopicRange, number[] | null>;
  /** Distinct seeded tags in the catalog. */
  topicCount?: number;
}

export function TopicCoverageSheet({
  visible,
  onClose,
  topicsByRange,
  solvedByRange,
  totalProblems,
  radarByRange,
  medianByRange,
  topicCount,
}: TopicCoverageSheetProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [range, setRange] = useState<TopicRange>('all');
  const [compare, setCompare] = useState(false);

  const topics = topicsByRange[range];
  const topicTotal = topicCount ?? topicsByRange.all.length;
  const solved = solvedByRange[range];
  /* Topics with at least one solve *in this range* — the only topic count that
     can honestly sit next to a "· THIS WEEK" caption. `topicTotal` is the whole
     catalog's tag count and is only used as the all-time denominator. */
  const topicsTouched = useMemo(() => topics.filter((t) => t.solved > 0).length, [topics]);
  const radar = radarByRange?.[range] ?? null;
  const median = medianByRange?.[range] ?? null;

  /* Hero radar: small, so the numeral under it — not the chart — is the thing
     that reads first. Sheet padding is 22 a side. */
  const radarWidth = Math.min(196, width - spacing.sheetPadding * 2);

  /**
   * Crew median, per topic tag, as a raw coverage fraction.
   *
   * `medianByRange` is already in *plotted* radar units (`axisValue`, i.e.
   * pct / 0.55 clamped to 0.04–1), so it is multiplied back out to compare
   * against a bar's own 0–1 progress. Only the eight radar tags have a median;
   * every other row simply has no marker.
   *
   * `axisValue` clamps at both ends, and clamping is lossy: a plotted 0.04 is
   * every crew median from "genuinely 2.2%" down to "zero, including the
   * `total === 0` early return", and a plotted 1 is every median at or above
   * 55% coverage stacked on one x. A marker drawn there would state a precision
   * the number does not have, so the two saturated ends get no marker at all —
   * only medians strictly inside the plottable band are placed.
   */
  const medianByTag = useMemo(() => {
    const m = new Map<string, number>();
    if (!median) return m;
    RADAR_AXES.forEach((axis, i) => {
      const v = median[i];
      if (typeof v !== 'number' || v <= AXIS_FLOOR || v >= 1) return;
      m.set(axis.tag, clamp(v * AXIS_DIVISOR));
    });
    return m;
  }, [median]);

  /* --- the three sections, each sorted strongest-first --- */
  const sections = useMemo(() => {
    const by: Record<Bucket, TopicStat[]> = { strong: [], developing: [], weak: [] };
    for (const t of topics) by[bucketOf(t.pct)].push(t);
    for (const k of Object.keys(by) as Bucket[]) {
      by[k].sort((a, b) => b.pct - a.pct || a.tag.localeCompare(b.tag));
    }
    return by;
  }, [topics]);

  /* The featured topic: the weakest row in WEAK that is big enough to be real. */
  const featured = useMemo(() => {
    const weak = sections.weak;
    const sizeable = weak.filter((t) => t.total >= MIN_FEATURED_SIZE);
    const pool = sizeable.length ? sizeable : weak;
    return pool.length ? pool[pool.length - 1] : null;
  }, [sections]);

  /**
   * The hero is a Fitness metric: one number, one hue, one scope. Which metric
   * it is depends on the range, because only 'all' has a denominator.
   *
   *   all           → *coverage*: distinct catalog problems solved / catalog
   *                   size, coloured on the §3.7 ramp like every bucket below.
   *   week / month  → *volume*: how many problems were solved in that window.
   *                   There is no catalog-sized goal for a week, so it carries
   *                   no fraction and no ramp — pairing a week's numerator with
   *                   the all-time denominator read as "4/1200" and pinned the
   *                   ramp to WEAK forever no matter how the week went. It gets
   *                   the volume hue instead, the same metric the solve ring
   *                   already owns.
   */
  const isAll = range === 'all';
  const overallPct = totalProblems > 0 ? solved / totalProblems : 0;
  const heroColor = !isAll
    ? colors.volume
    : overallPct >= STRONG_AT
      ? colors.difficulty
      : overallPct >= DEVELOPING_AT
        ? colors.medium
        : colors.volume;

  const goPractice = (tag?: string) => {
    onClose();
    /* Practice keeps its open pathway in local state (`openTag`) but now seeds
       that state from the `topic` route param, so "Practice {tag}" actually
       lands on that tag's pathway instead of the Practice tab root. */
    router.push(tag ? { pathname: '/practice', params: { topic: tag } } : '/practice');
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Topic Coverage" headerRight={null}>
      {/* ---------------- hero: chart, then the numeral it belongs to -------- */}
      {radar ? (
        <View style={s.radarWrap}>
          <MorphRadar
            labels={radar.map((a) => a.label)}
            values={radar.map((a) => a.value)}
            median={median}
            showMedian={compare}
            width={radarWidth}
          />
        </View>
      ) : null}

      <Segmented options={OPTIONS} value={range} onChange={setRange} style={s.seg} />

      <View style={s.hero}>
        <Text style={[s.heroNumeral, { color: heroColor }]} numberOfLines={1}>
          {solved}
          {isAll ? (
            <Text style={[s.heroSlash, { color: heroColor }]}>/{totalProblems}</Text>
          ) : null}
          <Text style={[s.heroUnit, { color: heroColor }]}>SOLVED</Text>
        </Text>
        <Text style={[s.heroCaption, { color: heroColor }]}>
          {isAll
            ? `TOTAL ${topicTotal} TOPICS · ALL TIME`
            : `${topicsTouched} OF ${topicTotal} TOPICS · ${RANGE_PHRASE[range].toUpperCase()}`}
        </Text>
      </View>

      {median ? (
        <View style={s.compare}>
          <PillButton
            label={compare ? 'Hide crew median' : 'Compare crew'}
            onPress={() => setCompare((v) => !v)}
            variant={compare ? 'tint' : 'grey'}
            tintColor={colors.accent}
            size="md"
          />
        </View>
      ) : null}

      {/* ---------------- one section per state bucket ---------------------- */}
      {BUCKETS.map((b) => {
        const rows = sections[b.key].filter((t) => t !== featured);
        const isWeak = b.key === 'weak';
        if (rows.length === 0 && !(isWeak && featured)) return null;

        return (
          <View key={b.key} style={s.section}>
            <View style={s.sectionHead}>
              <Text style={[s.sectionTitle, { color: b.color }]}>{b.label.toUpperCase()}</Text>
              <Text style={s.sectionCount}>
                {sections[b.key].length} · {b.blurb}
              </Text>
            </View>

            {isWeak && featured ? (
              <FeaturedTopic
                topic={featured}
                range={range}
                median={medianByTag.get(featured.tag)}
                showMedian={compare}
                onPractice={() => goPractice(featured.tag)}
              />
            ) : null}

            {rows.map((t, i) => (
              <View key={t.tag}>
                {i > 0 || (isWeak && featured) ? <Hairline style={s.rowLine} /> : null}
                <TopicRow
                  topic={t}
                  color={b.color}
                  range={range}
                  median={medianByTag.get(t.tag)}
                  showMedian={compare}
                />
              </View>
            ))}
          </View>
        );
      })}

      {/* ---------------- bottom action ------------------------------------- */}
      <View style={s.footer}>
        <PillButton label="Choose what's next" onPress={() => goPractice()} style={s.footerBtn} />
      </View>

      {/* The Sheet body already pads 38 + safe-area at the bottom; this is the
          extra breathing room under the pill so the tallest home indicator
          never sits on top of it. */}
      <View style={{ height: Math.max(insets.bottom > 0 ? 4 : 12, 4) }} />
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

/** One quiet topic row: name, big quiet numeral, bar. */
function TopicRow({
  topic,
  color,
  range,
  median,
  showMedian,
}: {
  topic: TopicStat;
  color: string;
  range: TopicRange;
  median?: number;
  showMedian: boolean;
}) {
  return (
    <View style={s.row}>
      <View style={s.rowHead}>
        <Text style={s.rowName} numberOfLines={1}>
          {topic.tag}
        </Text>
        <Text style={s.rowCount}>
          {topic.solved}
          <Text style={s.rowCountDim}>/{topic.total}</Text>
        </Text>
        <Text style={[s.rowPct, { color }]}>{pctLabel(topic.pct)}%</Text>
      </View>
      <AnimatedBar
        progress={topic.pct}
        color={color}
        deps={range}
        median={median}
        showMedian={showMedian}
      />
    </View>
  );
}

/**
 * The weakest topic, given the Fitness "metric owns its section" treatment:
 * a big #FA114F numeral, a one-line verdict, its own bar, and the one action
 * that changes the number.
 */
function FeaturedTopic({
  topic,
  range,
  median,
  showMedian,
  onPractice,
}: {
  topic: TopicStat;
  range: TopicRange;
  median?: number;
  showMedian: boolean;
  onPractice: () => void;
}) {
  const pct = pctLabel(topic.pct);
  const left = Math.max(topic.total - topic.solved, 0);

  return (
    <View style={s.featured}>
      <Text style={s.featuredName} numberOfLines={1}>
        {topic.tag}
      </Text>
      <Text style={s.featuredNumeral} numberOfLines={1}>
        {topic.solved}
        <Text style={s.featuredSlash}>/{topic.total}</Text>
        <Text style={s.featuredUnit}>{pct}%</Text>
      </Text>
      <Text style={s.featuredVerdict}>
        Your thinnest area {RANGE_PHRASE[range]} — {left} untouched here, and every one of them
        moves the radar further than anything else you could pick.
      </Text>
      <AnimatedBar
        progress={topic.pct}
        color={colors.volume}
        deps={range}
        median={median}
        showMedian={showMedian}
      />
      <PillButton
        label={`Practice ${topic.tag}`}
        onPress={onPractice}
        variant="tint"
        tintColor={colors.volume}
        style={s.featuredBtn}
      />
    </View>
  );
}

/**
 * 6px bar, width animated 800ms on the standard curve (§1 "progress bar"),
 * with an optional hairline crew-median marker laid over it.
 */
function AnimatedBar({
  progress,
  color,
  deps,
  median,
  showMedian,
}: {
  progress: number;
  color: string;
  deps: string;
  median?: number;
  showMedian?: boolean;
}) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = 0;
    w.value = withTiming(clamp(progress), {
      duration: duration.progressBar,
      easing: Easing.bezier(...EASE.standard),
    });
  }, [progress, deps]);
  const style = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));

  const marker = showMedian && typeof median === 'number' ? clamp(median) : null;

  /* The marker is a sibling of the track, not a child: the track clips to its
     own 6px so the fill keeps its rounded ends, and a 10px tick inside it would
     be sliced back down to 6. */
  return (
    <View style={s.barWrap}>
      <View style={s.track}>
        <Animated.View style={[s.fill, { backgroundColor: color }, style]} />
      </View>
      {marker !== null ? (
        <View
          pointerEvents="none"
          style={[s.medianMark, { left: `${marker * 100}%` }]}
          accessibilityLabel="Crew median"
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  radarWrap: { alignItems: 'center', marginTop: -2, marginBottom: 2 },
  seg: { marginTop: 6 },

  /* --- hero ------------------------------------------------------------- */
  hero: { marginTop: 22 },
  heroNumeral: { fontSize: 46, fontWeight: '700', letterSpacing: -2, ...tabular },
  heroSlash: { fontSize: 46, fontWeight: '700', letterSpacing: -2, opacity: 0.72, ...tabular },
  heroUnit: { fontSize: 17, fontWeight: '700', letterSpacing: 0.2 },
  heroCaption: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    opacity: 0.9,
  },

  /* The pill sizes itself; the wrapper only keeps it off the full width so it
     reads as a toggle rather than the sheet's primary action. */
  compare: { alignSelf: 'flex-start', marginTop: 16 },

  /* --- sections --------------------------------------------------------- */
  section: { marginTop: 34 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 4,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', letterSpacing: 0.8 },
  sectionCount: { fontSize: 12.5, fontWeight: '500', color: colors.textTertiary, ...tabular },

  /* --- quiet row -------------------------------------------------------- */
  row: { paddingTop: 16 },
  rowLine: { marginTop: 16 },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 10 },
  rowName: { flex: 1, fontSize: 16, fontWeight: '500', color: colors.text, letterSpacing: -0.2 },
  rowCount: { fontSize: 22, fontWeight: '600', letterSpacing: -0.6, color: colors.text, ...tabular },
  rowCountDim: { fontSize: 17, fontWeight: '500', color: colors.textTertiary, ...tabular },
  rowPct: {
    fontSize: 15,
    fontWeight: '700',
    minWidth: 44,
    textAlign: 'right',
    ...tabular,
  },

  /* --- featured --------------------------------------------------------- */
  featured: { paddingTop: 14 },
  featuredName: { fontSize: 16, fontWeight: '600', color: colors.text, letterSpacing: -0.2 },
  featuredNumeral: {
    marginTop: 2,
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: -1.8,
    color: colors.volume,
    ...tabular,
  },
  featuredSlash: { fontSize: 40, fontWeight: '700', letterSpacing: -1.8, opacity: 0.65 },
  featuredUnit: { fontSize: 17, fontWeight: '700', letterSpacing: 0.2 },
  featuredVerdict: {
    marginTop: 6,
    marginBottom: 14,
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    color: colors.textSecondary,
  },
  featuredBtn: { marginTop: 16, alignSelf: 'stretch' },

  /* --- bar -------------------------------------------------------------- */
  barWrap: { height: 10, justifyContent: 'center' },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.controlAlt30,
    overflow: 'hidden',
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  medianMark: {
    position: 'absolute',
    top: 0,
    width: 1.5,
    height: 10,
    marginLeft: -0.75,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },

  /* --- footer ----------------------------------------------------------- */
  footer: { marginTop: 34 },
  footerBtn: { alignSelf: 'stretch' },
});

export default TopicCoverageSheet;
