import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line } from 'react-native-svg';
import { Sheet } from '@/components/Sheet';
import { Ring } from '@/components/Ring';
import { PillButton } from '@/components/PillButton';
import { colors, pressed, ringSizes, tabular, type } from '@/theme';
import { Hairline } from './parts';
import { DAY_TARGETS } from './WeekStrip';
import type { DayCell, Goals } from './useSummaryData';

const VOLUME_CHART_H = 92;
const MINI_CHART_H = 54;

/** Chrome above the scroller inside `Sheet`: grab handle + title row + padding. */
const SHEET_CHROME = 108;

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
  /** Opens the goal stepper (Settings sheet / goal flow). */
  onChangeGoal?: () => void;
}

/**
 * Ring detail sheet, Fitness-style day drill-down with our spin.
 *
 * Top → bottom: a tappable week day-strip of mini tri-rings · the 196px
 * tri-ring with the arrow tip · one section per ring in that ring's color
 * (huge metric-colored `{value}/{goal} unit` numeral with the metric's own
 * chart directly beneath, dotted goal line, `TOTAL n` caption) · quiet
 * secondary numerals on hairlines · a grey PillButton pair.
 *
 * Nothing is boxed: content sits directly on the sheet surface, separated by
 * hairlines. Tapping a day scopes the ring and the numerals to that day;
 * tapping it again returns to the week. The charts always show the whole week
 * with the selected column lit.
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
  onChangeGoal,
}: RingDetailSheetProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  /** `null` = the whole week; otherwise a `YYYY-MM-DD` from `days`. */
  const [selected, setSelected] = useState<string | null>(null);

  // Each open starts on the week, so a stale day never greets the next open.
  useEffect(() => {
    if (visible) setSelected(null);
  }, [visible]);

  const day = selected ? days.find((d) => d.date === selected) ?? null : null;

  /* Per-day targets when a day is in focus; the week's own goals otherwise. */
  const view = useMemo(() => {
    if (day) {
      return {
        volume: { value: day.solves, goal: Math.max(1, dayGoal) },
        difficulty: { value: day.medPlus, goal: DAY_TARGETS.difficulty },
        streak: { value: day.solves > 0 ? 1 : 0, goal: DAY_TARGETS.streak },
      };
    }
    return {
      volume: { value: week.volume, goal: goals.volume },
      difficulty: { value: week.medPlus, goal: goals.difficulty },
      streak: { value: week.days, goal: goals.streak },
    };
  }, [day, dayGoal, week, goals]);

  const volumePeak = Math.max(dayGoal, ...days.map((d) => d.solves), 1);
  const medPeak = Math.max(DAY_TARGETS.difficulty, ...days.map((d) => d.medPlus), 1);

  const scopeLabel = day ? dayName(days, day) : `Week ${weekNumber}`;

  /** Active days in the current scope: 1/0 for a selected day, the week's count
   *  otherwise — the same scoping the Volume and Difficulty totals use. */
  const activeDays = day ? (day.solves > 0 ? 1 : 0) : week.days;

  const body = (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      // An explicit cap is what makes the panel scroll instead of growing past
      // the screen — that overflow is what clipped the CTA before.
      style={{ maxHeight: height * 0.9 - SHEET_CHROME }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
      {/* ---- week day-strip -------------------------------------------- */}
      <View style={s.strip}>
        {days.map((d) => {
          const isSel = d.date === selected;
          return (
            <Pressable
              key={d.date}
              onPress={() => setSelected((cur) => (cur === d.date ? null : d.date))}
              style={({ pressed: p }) => [s.stripCol, p && pressed]}>
              {/* Today's marker is applied last so it survives selection: the
                  selected column is already called out by the dot beneath the
                  ring, and letting the grey selected fill win erased the only
                  indication of which column is today. */}
              <View style={[s.dayPill, isSel && s.dayPillSel, d.isToday && s.dayPillToday]}>
                <Text
                  style={[
                    s.dayLetter,
                    (d.isToday || isSel) && s.dayLetterOn,
                  ]}>
                  {d.letter}
                </Text>
              </View>
              <Ring
                variant="day"
                size={ringSizes.day}
                stagger={40}
                animate={!d.isFuture}
                volume={{ value: d.solves, goal: dayGoal }}
                difficulty={{ value: d.medPlus, goal: DAY_TARGETS.difficulty }}
                streak={{ value: d.solves > 0 ? 1 : 0, goal: DAY_TARGETS.streak }}
              />
              <View style={[s.selDot, isSel && s.selDotOn]} />
            </Pressable>
          );
        })}
      </View>

      {/* ---- the big tri-ring ------------------------------------------ */}
      <View style={s.ringWrap}>
        <Ring
          size={ringSizes.sheet}
          stagger={90}
          tip
          tipSize={36}
          volume={view.volume}
          difficulty={view.difficulty}
          streak={view.streak}
        />
      </View>

      <Text style={s.scope}>{scopeLabel.toUpperCase()}</Text>

      <Hairline style={s.rule} />

      {/* ---- Volume ----------------------------------------------------- */}
      <Section
        title="Volume"
        color={colors.volume}
        value={view.volume.value}
        goal={view.volume.goal}
        unit="solved">
        <BarChart
          days={days}
          selected={selected}
          height={VOLUME_CHART_H}
          peak={volumePeak}
          goalAt={dayGoal}
          color={colors.volume}
          barWidth={9}
        />
        <DayLetters days={days} selected={selected} color={colors.volume} />
        <Text style={[s.total, { color: colors.volume }]}>
          TOTAL {day ? day.solves : week.volume} SOLVED
        </Text>
      </Section>

      <Hairline style={s.rule} />

      {/* ---- Difficulty -------------------------------------------------- */}
      <Section
        title="Difficulty"
        color={colors.difficulty}
        value={view.difficulty.value}
        goal={view.difficulty.goal}
        unit="med+">
        <BarChart
          days={days}
          selected={selected}
          height={MINI_CHART_H}
          peak={medPeak}
          goalAt={DAY_TARGETS.difficulty}
          color={colors.difficulty}
          barWidth={9}
          metric="medPlus"
        />
        <DayLetters days={days} selected={selected} color={colors.difficulty} />
        <Text style={[s.total, { color: colors.difficulty }]}>
          TOTAL {day ? day.medPlus : week.medPlus} MED+
        </Text>
      </Section>

      <Hairline style={s.rule} />

      {/* ---- Streak ------------------------------------------------------ */}
      <Section
        title="Streak"
        color={colors.streak}
        value={view.streak.value}
        goal={view.streak.goal}
        unit="days">
        <View style={s.dotsRow}>
          {days.map((d) => {
            const on = d.solves > 0;
            const isSel = d.date === selected;
            return (
              <View key={d.date} style={s.dotCol}>
                <View
                  style={[
                    s.dot,
                    on && s.dotOn,
                    isSel && { transform: [{ scale: 1.18 }] },
                    !on && d.isFuture && s.dotFuture,
                  ]}
                />
              </View>
            );
          })}
        </View>
        <DayLetters days={days} selected={selected} color={colors.streak} />
        {/* Scoped like the other two totals: a selected day is active or it is
            not, so the total is 1 or 0 — leaving the week's count here made the
            three captions read at two scopes at once. */}
        <Text style={[s.total, { color: colors.streak }]}>
          TOTAL {activeDays} ACTIVE {activeDays === 1 ? 'DAY' : 'DAYS'}
        </Text>
      </Section>

      <Hairline style={s.rule} />

      {/* ---- quiet secondary numerals ------------------------------------ */}
      <View style={s.statPair}>
        <Stat label="Points" value={`${week.points}`} />
        <Stat label="Attempts" value={`${week.attempts}`} />
      </View>

      <Hairline />

      <View style={s.statPair}>
        <Stat label="Avg time" value="—" />
      </View>

      {/* ---- buttons ------------------------------------------------------ */}
      <View style={s.buttons}>
        <PillButton
          label="Change Goal"
          variant="grey"
          size="lg"
          onPress={onChangeGoal ?? onClose}
          style={s.button}
        />
        <PillButton
          label="Add to Your Rings"
          variant="grey"
          size="lg"
          onPress={onAdd}
          style={s.button}
        />
      </View>
    </ScrollView>
  );

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Activity Rings"
      subtitle={`Week ${weekNumber}`}
      scroll={false}>
      {body}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

/** A metric owns its section: bold white header, huge metric-colored numeral,
 *  then that metric's own chart directly beneath. */
function Section({
  title,
  color,
  value,
  goal,
  unit,
  children,
}: {
  title: string;
  color: string;
  value: number;
  goal: number;
  unit: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.numeralRow}>
        <Text style={[s.numeral, { color }]}>
          {value}/{goal}
        </Text>
        <Text style={[s.numeralUnit, { color }]}>{unit.toUpperCase()}</Text>
      </View>
      {children}
    </View>
  );
}

function BarChart({
  days,
  selected,
  height,
  peak,
  goalAt,
  color,
  barWidth,
  metric = 'solves',
}: {
  days: DayCell[];
  selected: string | null;
  height: number;
  peak: number;
  goalAt: number;
  color: string;
  barWidth: number;
  metric?: 'solves' | 'medPlus';
}) {
  // Bars are laid out in an explicitly-sized, flex-end box: percentage heights
  // would resolve to zero here.
  const goalY = Math.min(height - 1, (goalAt / peak) * height);
  return (
    <View style={[s.chart, { height }]}>
      <View style={[s.baseline, { bottom: 0 }]} pointerEvents="none">
        <Svg width="100%" height={2}>
          <Line
            x1="0"
            y1={1}
            x2="100%"
            y2={1}
            stroke={color}
            strokeWidth={1.5}
            strokeDasharray="1.5 3"
            strokeLinecap="round"
          />
        </Svg>
      </View>
      <View style={[s.baseline, { bottom: goalY }]} pointerEvents="none">
        <Svg width="100%" height={2}>
          <Line
            x1="0"
            y1={1}
            x2="100%"
            y2={1}
            stroke={colors.gridLine}
            strokeWidth={1}
            strokeDasharray="2 3"
          />
        </Svg>
      </View>
      <View style={[s.bars, { height }]}>
        {days.map((d) => {
          const v = metric === 'solves' ? d.solves : d.medPlus;
          const dim = selected != null && d.date !== selected;
          return (
            <View key={d.date} style={s.barCol}>
              <View
                style={[
                  s.bar,
                  {
                    width: barWidth,
                    height: Math.max(v > 0 ? 3 : 0, (v / peak) * height),
                    backgroundColor: color,
                    opacity: dim ? 0.32 : 1,
                  },
                ]}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

function DayLetters({
  days,
  selected,
  color,
}: {
  days: DayCell[];
  selected: string | null;
  color: string;
}) {
  return (
    <View style={s.letters}>
      {days.map((d) => {
        const on = selected ? d.date === selected : d.isToday;
        return (
          <Text key={d.date} style={[s.letter, on && { color }]}>
            {d.letter}
          </Text>
        );
      })}
    </View>
  );
}

/** Big quiet numeral under a small label — Fitness's "Steps 654". */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
    </View>
  );
}

const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/** Monday-first index → a readable name, so the two "T"s are never ambiguous. */
function dayName(days: DayCell[], day: DayCell): string {
  if (day.isToday) return 'Today';
  const i = days.findIndex((d) => d.date === day.date);
  return DAY_NAMES[i] ?? day.letter;
}

const s = StyleSheet.create({
  /* week strip */
  strip: { flexDirection: 'row', gap: 5, marginBottom: 6 },
  stripCol: { flex: 1, alignItems: 'center', gap: 6 },
  dayPill: {
    height: 20,
    minWidth: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPillToday: { backgroundColor: colors.volume },
  dayPillSel: { backgroundColor: colors.controlSelected },
  dayLetter: { fontSize: 13, fontWeight: '700', color: colors.textTertiary },
  dayLetterOn: { color: colors.text },
  selDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
  selDotOn: { backgroundColor: colors.text },

  ringWrap: { alignItems: 'center', paddingTop: 18, paddingBottom: 12 },
  scope: {
    ...type.microLabel,
    color: colors.textTertiary,
    textAlign: 'center',
    marginBottom: 20,
  },

  rule: { marginVertical: 0 },

  /* one section per ring */
  section: { paddingTop: 22, paddingBottom: 24 },
  sectionTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3, color: colors.text },
  numeralRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 },
  numeral: { fontSize: 28, fontWeight: '700', letterSpacing: -1, ...tabular },
  numeralUnit: { fontSize: 13.5, fontWeight: '700', letterSpacing: 0.3 },

  chart: { justifyContent: 'flex-end', marginTop: 18 },
  baseline: { position: 'absolute', left: 0, right: 0, height: 2 },
  bars: { flexDirection: 'row', alignItems: 'flex-end' },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  bar: { borderRadius: 5 },

  letters: { flexDirection: 'row', marginTop: 8 },
  letter: {
    flex: 1,
    textAlign: 'center',
    ...type.chartLabel,
    color: colors.textChartLabel,
  },

  total: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, marginTop: 12 },

  /* streak dots */
  dotsRow: { flexDirection: 'row', marginTop: 22, height: 22, alignItems: 'center' },
  dotCol: { flex: 1, alignItems: 'center' },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.streakTrack,
  },
  dotOn: { backgroundColor: colors.streak },
  dotFuture: { opacity: 0.4 },

  /* secondary stats */
  statPair: { flexDirection: 'row', paddingTop: 16, paddingBottom: 18 },
  stat: { flex: 1, gap: 2 },
  statLabel: { fontSize: 17, fontWeight: '400', color: colors.text },
  statValue: {
    fontSize: 32,
    fontWeight: '500',
    letterSpacing: -1,
    color: colors.textSecondary,
    ...tabular,
  },

  buttons: { flexDirection: 'row', gap: 12, marginTop: 14 },
  button: { flex: 1 },
});

export default RingDetailSheet;
