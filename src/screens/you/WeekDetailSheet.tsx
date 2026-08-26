import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Sheet } from '@/components/Sheet';
import { DoubleRing } from '@/components/Ring';
import { clamp, colors, tabular, type } from '@/theme';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The subset of the You screen's `WeekRow` this sheet reads. */
export interface WeekDetail {
  start: string;
  volume: number;
  medPlus: number;
  activeDays: number;
  volumeGoal: number;
  difficultyGoal: number;
  daysGoal: number;
  closed: boolean;
  inProgress: boolean;
}

/** "11 – 17 Aug" for the Monday `start`. */
function weekLabel(start: string) {
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(a);
  b.setDate(b.getDate() + 6);
  const same = a.getMonth() === b.getMonth();
  return same
    ? `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]}`
    : `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`;
}

/**
 * Drill-down behind one glyph of the "Weeks closed" grid, in the shape the
 * Summary drill-downs use: the week's own tri-ring over one section per metric,
 * each in that metric's color with a `{value}/{goal}` numeral and a track.
 *
 * Everything here is already in the `weeks` array the grid renders — opening a
 * week costs nothing but a render.
 */
export function WeekDetailSheet({
  visible,
  onClose,
  week,
}: {
  visible: boolean;
  onClose: () => void;
  week: WeekDetail | null;
}) {
  if (!week) {
    return <Sheet visible={visible} onClose={onClose} title="Week" />;
  }

  const status = week.closed ? 'Rings closed' : week.inProgress ? 'In progress' : 'Missed';
  const statusColor = week.closed
    ? colors.difficulty
    : week.inProgress
      ? colors.accentText
      : colors.textTertiary;

  return (
    <Sheet visible={visible} onClose={onClose} title={weekLabel(week.start)} subtitle={status}>
      <View style={s.ringWrap}>
        <DoubleRing
          size={132}
          volume={clamp(week.volumeGoal ? week.volume / week.volumeGoal : 0)}
          difficulty={clamp(week.difficultyGoal ? week.medPlus / week.difficultyGoal : 0)}
        />
      </View>

      <Text style={[s.status, { color: statusColor }]}>{status.toUpperCase()}</Text>

      <Metric
        label="Volume"
        color={colors.volume}
        value={week.volume}
        goal={week.volumeGoal}
        unit="solved"
      />
      <Metric
        label="Difficulty"
        color={colors.difficulty}
        value={week.medPlus}
        goal={week.difficultyGoal}
        unit="med+"
      />
      <Metric
        label="Active days"
        color={colors.streak}
        value={week.activeDays}
        goal={week.daysGoal}
        unit="days"
      />

      <Text style={s.footnote}>
        {week.inProgress
          ? 'This week is still open — it is not scored until Sunday night.'
          : week.closed
            ? 'All three targets met. Worth +25 trophies, +60 with the sweep.'
            : `${[
                week.volume < week.volumeGoal ? 'volume' : null,
                week.medPlus < week.difficultyGoal ? 'difficulty' : null,
                week.activeDays < week.daysGoal ? 'active days' : null,
              ]
                .filter(Boolean)
                .join(', ')} came up short.`}
      </Text>
    </Sheet>
  );
}

function Metric({
  label,
  color,
  value,
  goal,
  unit,
}: {
  label: string;
  color: string;
  value: number;
  goal: number;
  unit: string;
}) {
  const pct = clamp(goal ? value / goal : 0);
  return (
    <View style={s.metric}>
      <Text style={s.metricLabel}>{label}</Text>
      <View style={s.numeralRow}>
        <Text style={[s.numeral, { color }]}>
          {value}/{goal}
        </Text>
        <Text style={[s.numeralUnit, { color }]}>{unit.toUpperCase()}</Text>
      </View>
      <View style={s.track}>
        <View style={[s.fill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  ringWrap: { alignItems: 'center', paddingTop: 6, paddingBottom: 14 },
  status: { ...type.microLabel, textAlign: 'center', marginBottom: 6 },

  metric: { paddingTop: 20 },
  metricLabel: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3, color: colors.text },
  numeralRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 2 },
  numeral: { fontSize: 28, fontWeight: '700', letterSpacing: -1, ...tabular },
  numeralUnit: { fontSize: 13.5, fontWeight: '700', letterSpacing: 0.3 },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.controlAlt16,
    marginTop: 10,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: 3 },

  footnote: {
    ...type.bodySecondary,
    color: colors.textTertiary,
    marginTop: 24,
  },
});

export default WeekDetailSheet;
