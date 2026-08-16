import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { Sheet } from '@/components/Sheet';
import { Ring } from '@/components/Ring';
import { colors, pressed, ringSizes, tabular, type } from '@/theme';
import { Bar, Hairline } from './parts';
import type { DayCell, Goals } from './useSummaryData';

const CHART_H = 96;

export interface RingDetailSheetProps {
  visible: boolean;
  onClose: () => void;
  weekNumber: number;
  goals: Goals;
  week: { volume: number; medPlus: number; days: number; points: number; attempts: number };
  days: DayCell[];
  /** Daily volume target — the dotted goal line under the bars. */
  dayGoal: number;
  onAdd: () => void;
}

/**
 * §3.11 "Ring detail sheet" — a 196px tri-ring with the arrow tip, three
 * progress rows, a 96px SOLVES BY DAY bar chart with three gridlines and a
 * dotted `rgba(250,17,79,.55)` goal line, the TOTAL line, a three-up stat row,
 * and the primary CTA.
 */
export function RingDetailSheet({
  visible,
  onClose,
  weekNumber,
  goals,
  week,
  days,
  dayGoal,
  onAdd,
}: RingDetailSheetProps) {
  const rows = [
    { label: 'Volume', value: week.volume, goal: goals.volume, unit: 'SOLVED', color: colors.volume },
    {
      label: 'Difficulty',
      value: week.medPlus,
      goal: goals.difficulty,
      unit: 'MED+',
      color: colors.difficulty,
    },
    { label: 'Streak', value: week.days, goal: goals.streak, unit: 'DAYS', color: colors.streak },
  ];

  // Bars are percentages of an explicitly-sized box with align-items: flex-end,
  // otherwise the percentage heights resolve to zero (§3.11).
  const peak = Math.max(dayGoal, ...days.map((d) => d.solves), 1);

  return (
    <Sheet visible={visible} onClose={onClose} title="Activity Rings" subtitle={`Week ${weekNumber}`}>
      <View style={s.ringWrap}>
        <Ring
          size={ringSizes.sheet}
          stagger={90}
          tip
          tipSize={36}
          volume={{ value: week.volume, goal: goals.volume }}
          difficulty={{ value: week.medPlus, goal: goals.difficulty }}
          streak={{ value: week.days, goal: goals.streak }}
        />
      </View>

      <Hairline />

      {rows.map((r) => (
        <View key={r.label}>
          <View style={s.progressRow}>
            <Text style={s.progressLabel}>{r.label}</Text>
            <View style={s.progressValueRow}>
              <Text style={[s.progressValue, { color: r.color }]}>
                {r.value}/{r.goal}
              </Text>
              <Text style={[s.progressUnit, { color: r.color }]}>{r.unit}</Text>
            </View>
          </View>
          <Bar progress={r.goal > 0 ? r.value / r.goal : 0} color={r.color} />
          <View style={s.rowGap} />
          <Hairline />
        </View>
      ))}

      <Text style={s.section}>SOLVES BY DAY</Text>

      <View style={s.chart}>
        {[0.25, 0.5, 0.75].map((g) => (
          <View key={g} style={[s.gridline, { bottom: CHART_H * g }]} />
        ))}
        {/* dotted goal line — SVG, because RN's single-edge dotted border
            renders solid on iOS */}
        <View style={s.goalLine} pointerEvents="none">
          <Svg width="100%" height={2}>
            <Line
              x1="0"
              y1={1}
              x2="100%"
              y2={1}
              stroke="rgba(250,17,79,0.55)"
              strokeWidth={1.5}
              strokeDasharray="2 3"
            />
          </Svg>
        </View>
        <View style={s.bars}>
          {days.map((d) => (
            <View key={d.date} style={s.barCol}>
              <View
                style={[
                  s.bar,
                  { height: Math.max(2, (d.solves / peak) * CHART_H) },
                ]}
              />
            </View>
          ))}
        </View>
      </View>

      <View style={s.dayLabels}>
        {days.map((d) => (
          <Text key={d.date} style={[s.dayLabel, d.isToday && s.dayLabelToday]}>
            {d.letter}
          </Text>
        ))}
      </View>

      <Text style={s.total}>TOTAL {week.volume} SOLVED</Text>

      <Hairline style={{ marginTop: 18 }} />

      <View style={s.stats}>
        <Stat label="Points" value={`${week.points}`} />
        <Stat label="Attempts" value={`${week.attempts}`} />
        <Stat label="Avg time" value="—" unit={undefined} />
      </View>

      <Pressable onPress={onAdd} style={({ pressed: p }) => [s.cta, p && pressed]}>
        <Text style={s.ctaText}>Add to Your Rings</Text>
      </Pressable>
    </Sheet>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <View style={s.statValueRow}>
        <Text style={s.statValue}>{value}</Text>
        {unit ? <Text style={s.statUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  ringWrap: { alignItems: 'center', paddingVertical: 10, marginBottom: 12 },

  progressRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 10,
  },
  progressLabel: { fontSize: 15, fontWeight: '400', color: colors.text },
  progressValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  progressValue: { fontSize: 20, fontWeight: '600', letterSpacing: -0.5, ...tabular },
  progressUnit: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.4 },
  rowGap: { height: 16 },

  section: { ...type.microLabel, color: colors.textTertiary, marginTop: 22, marginBottom: 14 },

  chart: { height: CHART_H, justifyContent: 'flex-end' },
  gridline: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.gridLine,
  },
  goalLine: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: CHART_H },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  bar: { width: 9, borderRadius: 5, backgroundColor: colors.volume },

  dayLabels: { flexDirection: 'row', marginTop: 8 },
  dayLabel: {
    flex: 1,
    textAlign: 'center',
    ...type.chartLabel,
    color: colors.textChartLabel,
  },
  dayLabelToday: { color: colors.volume },

  total: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, color: colors.volume, marginTop: 14 },

  stats: { flexDirection: 'row', paddingVertical: 18 },
  stat: { flex: 1, gap: 4 },
  statLabel: { fontSize: 13, fontWeight: '400', color: colors.textSecondary },
  statValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  statValue: { ...type.statNumeralSm, color: colors.text, ...tabular },
  statUnit: { fontSize: 11.5, fontWeight: '700', color: colors.textTertiary },

  cta: {
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  ctaText: { ...type.buttonLabel, color: '#FFFFFF' },
});

export default RingDetailSheet;
