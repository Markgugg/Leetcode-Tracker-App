import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GlassCard } from '@/components/GlassCard';
import { Ring } from '@/components/Ring';
import { colors, pressed, ringSizes, tabular, type } from '@/theme';
import { CardHeader, ChevronButton } from './parts';
import { dayName, ringScope } from './dayScope';
import type { DayCell, Goals } from './useSummaryData';

export interface ActivityRingsCardProps {
  goals: Goals;
  week: { volume: number; medPlus: number; days: number };
  onOpenSheet: () => void;
  onTipPress: () => void;
  /** The day the week strip has scoped the card to — `null` = the whole week. */
  selectedDay?: DayCell | null;
  /** Every day of the visible week, for the "Thursday" caption's index. */
  days?: DayCell[];
  /** Daily volume target (the per-day ring goal). */
  dayGoal?: number;
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
 *
 * The whole card opens the Ring detail sheet; the chevron stays as the
 * affordance. The two interactive children — the chevron and the ring's arrow
 * tip — are their own `Pressable`s, and RN hands the touch responder to the
 * deepest view that wants it, so a tap on either never reaches the card's
 * press. Feedback is opacity only (no scale) so the rings do not jiggle.
 *
 * When the week strip has a past day selected the rings and the legend are
 * scoped to that day against the per-day targets (`ringScope`), and the
 * caption under the title says which day is in view.
 */
export function ActivityRingsCard({
  goals,
  week,
  onOpenSheet,
  onTipPress,
  selectedDay = null,
  days = [],
  dayGoal,
}: ActivityRingsCardProps) {
  const view = ringScope(selectedDay, week, goals, dayGoal);

  const rows: LegendRow[] = [
    {
      name: 'Volume',
      value: view.volume.value,
      goal: view.volume.goal,
      unit: 'SOLVED',
      color: colors.volume,
    },
    {
      name: 'Difficulty',
      value: view.difficulty.value,
      goal: view.difficulty.goal,
      unit: 'MED+',
      color: colors.difficulty,
    },
    {
      name: 'Streak',
      value: view.streak.value,
      goal: view.streak.goal,
      unit: 'DAYS',
      color: colors.streak,
    },
  ];

  const scopeLabel = selectedDay ? dayName(days, selectedDay) : 'This week';

  return (
    <GlassCard
      onPress={onOpenSheet}
      pressedStyle={{ opacity: pressed.opacity }}
      accessibilityLabel="Activity Rings — open details">
      <CardHeader title="Activity Rings" right={<ChevronButton onPress={onOpenSheet} />} />
      <Text style={s.scope}>{scopeLabel.toUpperCase()}</Text>

      <View style={s.body}>
        <Ring
          size={ringSizes.summary}
          stagger={90}
          tip
          tipSize={32}
          onTipPress={onTipPress}
          volume={view.volume}
          difficulty={view.difficulty}
          streak={view.streak}
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
  scope: { ...type.microLabel, color: colors.textTertiary, marginTop: 6 },
  body: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 14 },
  legend: { flex: 1, gap: 13 },
  metric: { fontSize: 14, fontWeight: '400', color: colors.textRingLegend },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 },
  value: { ...type.ringValue, ...tabular },
  unit: { ...type.ringUnit },
});

export default ActivityRingsCard;
