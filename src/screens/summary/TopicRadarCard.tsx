import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { GlassCard } from '@/components/GlassCard';
import Svg, { Line } from 'react-native-svg';
import { RadarChart } from '@/components/RadarChart';
import { colors, pressed, spacing } from '@/theme';
import { CardHeader, ChevronButton, Hairline } from './parts';
import type { RadarAxisStat } from './useSummaryData';

export interface TopicRadarCardProps {
  radar: RadarAxisStat[];
  /** Crew median per axis, or `null` when the user has no crew. */
  median: number[] | null;
  thinnest: RadarAxisStat | null;
  compare: boolean;
  onToggleCompare: () => void;
  onOpenSheet: () => void;
}

/**
 * §3.6.4 / §4 — the radar on the home tab.
 *
 * The compare chip is a sibling of the chevron, not a child of a card-wide
 * Pressable: the card itself is NOT tappable (only the chevron is), so the
 * chip's press can never be swallowed by an outer responder. This is the
 * stopPropagation gotcha called out in §4, solved structurally.
 */
export function TopicRadarCard({
  radar,
  median,
  thinnest,
  compare,
  onToggleCompare,
  onOpenSheet,
}: TopicRadarCardProps) {
  const { width } = useWindowDimensions();
  // card = screen - 2×20 h-padding; chart = card - 2×20 card padding
  const chartWidth = Math.min(290, width - spacing.screenH * 2 - spacing.cardPadding * 2);

  return (
    <GlassCard>
      <CardHeader title="Topic Coverage" right={<ChevronButton onPress={onOpenSheet} />} />

      <View style={s.chartWrap}>
        <RadarChart
          axes={radar.map((a) => ({ label: a.label, value: a.value }))}
          compare={compare ? median : null}
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
            <Text style={s.calloutText}>
              Thinnest axis — {thinnest.label} at {Math.round(thinnest.pct * 100)}%
            </Text>
          </View>
        </>
      ) : null}
    </GlassCard>
  );
}

const s = StyleSheet.create({
  chartWrap: { alignItems: 'center', marginTop: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 },
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
    backgroundColor: colors.controlAlt,
  },
  chipOn: {
    backgroundColor: colors.accentSelectedFill,
    borderColor: colors.accentSelectedBorder,
  },
  chipText: { fontSize: 12.5, fontWeight: '600', color: colors.textSecondary },
  chipTextOn: { color: colors.accentText },
  hairline: { marginVertical: 14 },
  callout: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  calloutDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.volume },
  calloutText: { fontSize: 13.5, fontWeight: '500', color: colors.textSecondary },
});

export default TopicRadarCard;
