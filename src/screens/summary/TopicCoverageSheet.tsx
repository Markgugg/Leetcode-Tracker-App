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
  totalSolved: number;
  totalProblems: number;
}

/**
 * §3.11 "Topic Coverage sheet" — title + "{n} of {m} problems across {k}
 * topics", a range segmented control, then every topic sorted by coverage
 * descending with a 6px bar that animates over 800ms.
 */
export function TopicCoverageSheet({
  visible,
  onClose,
  topicsByRange,
  totalSolved,
  totalProblems,
}: TopicCoverageSheetProps) {
  const [range, setRange] = useState<TopicRange>('week');
  const topics = topicsByRange[range];
  const topicCount = topicsByRange.all.length;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Topic Coverage"
      headerRight={null}>
      <Text style={s.sub}>
        {totalSolved} of {totalProblems} problems across {topicCount} topics.
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
  sub: { fontSize: 15, fontWeight: '400', color: colors.textSecondary, marginTop: -8 },
  seg: { marginTop: 18, marginBottom: 8 },
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
