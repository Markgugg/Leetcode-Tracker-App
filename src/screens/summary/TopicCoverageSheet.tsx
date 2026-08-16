import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Segmented } from '@/components/Segmented';
import { Sheet } from '@/components/Sheet';
import { EASE, clamp, colors, coverageColor, duration, tabular } from '@/theme';
import { Hairline } from './parts';
import type { TopicRange, TopicStat } from './useSummaryData';

const OPTIONS = [
  { label: 'This week', value: 'week' as TopicRange },
  { label: 'This month', value: 'month' as TopicRange },
  { label: 'All time', value: 'all' as TopicRange },
];

export interface TopicCoverageSheetProps {
  visible: boolean;
  onClose: () => void;
  topicsByRange: Record<TopicRange, TopicStat[]>;
  /** Distinct catalog problems solved, per range. */
  solvedByRange: Record<TopicRange, number>;
  totalProblems: number;
}

const RANGE_PHRASE: Record<TopicRange, string> = {
  week: 'this week',
  month: 'this month',
  all: 'all time',
};

/**
 * §3.11 "Topic Coverage sheet" — title + "{n} of {m} problems across {k}
 * topics", a range segmented control, then every topic sorted by coverage
 * descending with a 6px bar that animates over 800ms.
 */
export function TopicCoverageSheet({
  visible,
  onClose,
  topicsByRange,
  solvedByRange,
  totalProblems,
}: TopicCoverageSheetProps) {
  const [range, setRange] = useState<TopicRange>('all');
  const topics = topicsByRange[range];
  const topicCount = topicsByRange.all.length;
  const solved = solvedByRange[range];

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Topic Coverage"
      headerRight={null}>
      <Text style={s.sub}>
        {range === 'all'
          ? `${solved} of ${totalProblems} problems across ${topicCount} topics.`
          : `${solved} solved ${RANGE_PHRASE[range]} across ${topicCount} topics.`}
      </Text>

      <Segmented options={OPTIONS} value={range} onChange={setRange} style={s.seg} />

      {topics.map((t, i) => {
        const color = coverageColor(t.pct);
        return (
          <View key={t.tag}>
            {i > 0 ? <Hairline /> : null}
            <View style={s.row}>
              <Text style={s.name} numberOfLines={1}>
                {t.tag}
              </Text>
              <Text style={s.count}>
                {t.solved} of {t.total}
              </Text>
              <Text style={[s.pct, { color }]}>{Math.round(t.pct * 100)}%</Text>
            </View>
            <AnimatedBar progress={t.pct} color={color} deps={range} />
            <View style={s.rowGap} />
          </View>
        );
      })}
    </Sheet>
  );
}

/** 6px bar, width animated 800ms on the standard curve (§1 "progress bar"). */
function AnimatedBar({
  progress,
  color,
  deps,
}: {
  progress: number;
  color: string;
  deps: string;
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

  return (
    <View style={s.track}>
      <Animated.View style={[s.fill, { backgroundColor: color }, style]} />
    </View>
  );
}

const s = StyleSheet.create({
  /* No negative margin here: the sheet body is a ScrollView, which clips at its
     top edge, so pulling the first line up by 8px sliced the ascenders off
     ("106 of 1000 problems…" appeared cut in half). The title row already
     provides the gap; this line just needs an explicit lineHeight. */
  sub: { fontSize: 15, fontWeight: '400', lineHeight: 20, color: colors.textSecondary },
  seg: { marginTop: 16, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    paddingTop: 16,
    paddingBottom: 10,
  },
  name: { flex: 1, fontSize: 15.5, fontWeight: '500', color: colors.text },
  count: { fontSize: 13, fontWeight: '400', color: colors.textTertiary, ...tabular },
  pct: { fontSize: 16, fontWeight: '700', ...tabular, minWidth: 42, textAlign: 'right' },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(120,120,128,0.30)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  rowGap: { height: 14 },
});

export default TopicCoverageSheet;
