import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GlassCard } from '@/components/GlassCard';
import { Ring } from '@/components/Ring';
import { colors, ringSizes, tabular, type } from '@/theme';
import { CardHeader, ChevronButton } from './parts';
import type { Goals } from './useSummaryData';

export interface ActivityRingsCardProps {
  goals: Goals;
  week: { volume: number; medPlus: number; days: number };
  onOpenSheet: () => void;
  onTipPress: () => void;
}

interface LegendRow {
  name: string;
  value: number;
  goal: number;
  unit: string;
  color: string;
}

/**
 * §3.6.3 — title row with a 26px chevron; body is a 158px tri-ring with the
 * arrow tip on the left, 16px gap, then three legend blocks (13px apart):
 * metric name 14/400 at rgba(235,235,245,.85), then `{value}/{goal}` at
 * 21/600/-0.6 in the ring color with the unit at 12/700 uppercase.
 */
export function ActivityRingsCard({
  goals,
  week,
  onOpenSheet,
  onTipPress,
}: ActivityRingsCardProps) {
  const rows: LegendRow[] = [
    { name: 'Volume', value: week.volume, goal: goals.volume, unit: 'SOLVED', color: colors.volume },
    {
      name: 'Difficulty',
      value: week.medPlus,
      goal: goals.difficulty,
      unit: 'MED+',
      color: colors.difficulty,
    },
    { name: 'Streak', value: week.days, goal: goals.streak, unit: 'DAYS', color: colors.streak },
  ];

  return (
    <GlassCard>
      <CardHeader title="Activity Rings" right={<ChevronButton onPress={onOpenSheet} />} />

      <View style={s.body}>
        <Ring
          size={ringSizes.summary}
          stagger={90}
          tip
          tipSize={32}
          onTipPress={onTipPress}
          volume={{ value: week.volume, goal: goals.volume }}
          difficulty={{ value: week.medPlus, goal: goals.difficulty }}
          streak={{ value: week.days, goal: goals.streak }}
        />

        <View style={s.legend}>
          {rows.map((r) => (
            <View key={r.name}>
              <Text style={s.metric}>{r.name}</Text>
              <View style={s.valueRow}>
                <Text style={[s.value, { color: r.color }]}>
                  {r.value}/{r.goal}
                </Text>
                <Text style={[s.unit, { color: r.color }]}>{r.unit}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </GlassCard>
  );
}

const s = StyleSheet.create({
  body: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 18 },
  legend: { flex: 1, gap: 13 },
  metric: { fontSize: 14, fontWeight: '400', color: colors.textRingLegend },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 },
  value: { ...type.ringValue, ...tabular },
  unit: { ...type.ringUnit },
});

export default ActivityRingsCard;
