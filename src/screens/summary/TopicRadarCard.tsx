import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { GlassCard } from '@/components/GlassCard';
import { Segmented } from '@/components/Segmented';
import { colors, pressed, spacing, type } from '@/theme';
import { ChevronButton, Hairline } from './parts';
import { MorphRadar } from './MorphRadar';
import type { RadarAxisStat, TopicRange } from './useSummaryData';

const RANGES = [
  { label: 'Week', value: 'week' as TopicRange },
  { label: 'Month', value: 'month' as TopicRange },
  { label: 'All time', value: 'all' as TopicRange },
];

export interface TopicRadarCardProps {
  /** The eight §4 axes, per range. */
  radarByRange: Record<TopicRange, RadarAxisStat[]>;
  /** Crew median per axis, per range — `null` when the user has no crew. */
  medianByRange: Record<TopicRange, number[] | null>;
  /** Distinct catalog problems solved, per range. */
  solvedByRange: Record<TopicRange, number>;
  totalProblems: number;
  topicCount: number;
  compare: boolean;
  onToggleCompare: () => void;
  onOpenSheet: () => void;
}

const RANGE_PHRASE: Record<TopicRange, string> = {
  week: 'this week',
  month: 'this month',
  all: 'all time',
};

/**
 * §3.6.4 / §4 — the radar on the home tab.
 *
 * Layout notes (the "cut off at the top" bug): the subtitle is a normal
 * in-flow line inside the header column with an explicit `lineHeight`. It is
 * never pulled up with a negative margin and never sits under an absolutely
 * positioned title, which is what was clipping it before.
 *
 * The whole card opens the Topic Coverage sheet, with the chevron kept as the
 * affordance. Its interactive children — the range `Segmented` and the
 * "Compare crew" chip — are each their own `Pressable`, and RN gives the touch
 * responder to the deepest view that claims it, so their presses are never
 * swallowed by the card and never also fire the card's press. This is the §4
 * stopPropagation gotcha: no wrapper here blocks or intercepts child touches
 * (nothing uses `pointerEvents="box-only"` or an `onStartShouldSetResponder`),
 * so the nesting alone is enough. Feedback is opacity only — no scale — so the
 * radar does not jiggle under the finger.
 */
export function TopicRadarCard({
  radarByRange,
  medianByRange,
  solvedByRange,
  totalProblems,
  topicCount,
  compare,
  onToggleCompare,
  onOpenSheet,
}: TopicRadarCardProps) {
  const { width } = useWindowDimensions();
  const [range, setRange] = useState<TopicRange>('all');

  // card = screen - 2×20 h-padding; chart = card - 2×20 card padding
  const chartWidth = Math.min(290, width - spacing.screenH * 2 - spacing.cardPadding * 2);

  const radar = radarByRange[range];
  const median = medianByRange[range];
  const solved = solvedByRange[range];
  const thinnest = radar.length
    ? radar.reduce((lo, a) => (a.value < lo.value ? a : lo), radar[0])
    : null;

  const subtitle =
    range === 'all'
      ? `${solved} of ${totalProblems} problems across ${topicCount} topics`
      : `${solved} solved ${RANGE_PHRASE[range]} across ${topicCount} topics`;

  return (
    <GlassCard
      onPress={onOpenSheet}
      pressedStyle={{ opacity: pressed.opacity }}
      accessibilityLabel="Topic Coverage — open details">
      <View style={s.header}>
        <View style={s.headerText}>
          <Text style={s.title}>Topic Coverage</Text>
          <Text style={s.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        </View>
        <ChevronButton onPress={onOpenSheet} />
      </View>

      <Segmented options={RANGES} value={range} onChange={setRange} style={s.seg} />

      <View style={s.chartWrap}>
        <MorphRadar
          labels={radar.map((a) => a.label)}
          values={radar.map((a) => a.value)}
          median={median}
          showMedian={compare}
          width={chartWidth}
        />
      </View>

      <View style={s.legendRow}>
        <View style={s.legendItem}>
          <View style={[s.swatch, { backgroundColor: colors.difficulty }]} />
          <Text style={s.legendText}>You</Text>
        </View>
        {median ? (
          <View style={s.legendItem}>
            {/* RN's `borderStyle: 'dashed'` is unreliable on a single edge,
                so the dashed swatch is an SVG line. */}
            <Svg width={12} height={3}>
              <Line
                x1={0}
                y1={1.5}
                x2={12}
                y2={1.5}
                stroke="rgba(255,255,255,0.32)"
                strokeWidth={1.5}
                strokeDasharray="3 4"
              />
            </Svg>
            <Text style={s.legendText}>Crew median</Text>
          </View>
        ) : null}

        {median ? (
          <Pressable
            onPress={onToggleCompare}
            hitSlop={8}
            accessibilityRole="switch"
            accessibilityState={{ checked: compare }}
            style={({ pressed: p }) => [s.chip, compare && s.chipOn, p && pressed]}>
            <Text style={[s.chipText, compare && s.chipTextOn]}>Compare crew</Text>
          </Pressable>
        ) : null}
      </View>

      {thinnest ? (
        <>
          <Hairline style={s.hairline} />
          <View style={s.callout}>
            <View style={s.calloutDot} />
            <Text style={s.calloutText} numberOfLines={2}>
              Thinnest axis — {thinnest.label} at {Math.round(thinnest.pct * 100)}%
            </Text>
          </View>
        </>
      ) : null}
    </GlassCard>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  headerText: { flex: 1 },
  title: { ...type.cardTitle, color: colors.text, lineHeight: 25, includeFontPadding: false },
  subtitle: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: 3,
  },
  seg: { marginTop: 14 },
  chartWrap: { alignItems: 'center', marginTop: 10, marginBottom: 2 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 3, borderRadius: 2 },
  legendText: { fontSize: 12, fontWeight: '500', color: colors.textTertiary },
  chip: {
    marginLeft: 'auto',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: 'transparent',
    backgroundColor: colors.controlAlt26,
  },
  chipOn: {
    backgroundColor: colors.accentSelectedFill,
    borderColor: colors.accentSelectedBorder,
  },
  chipText: { fontSize: 12.5, fontWeight: '600', color: colors.textSecondary },
  chipTextOn: { color: colors.accentText },
  hairline: { marginTop: 14, marginBottom: 12 },
  callout: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  calloutDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.volume },
  calloutText: { flex: 1, fontSize: 13.5, fontWeight: '500', color: colors.textSecondary },
});

export default TopicRadarCard;
