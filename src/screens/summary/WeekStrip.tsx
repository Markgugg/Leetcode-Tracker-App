import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ring } from '@/components/Ring';
import { colors, pressed, ringSizes } from '@/theme';
import type { DayCell } from './useSummaryData';

/** Per-day ring targets (§2): 3 solves · 2 med+ · 1 day. */
export const DAY_TARGETS = { volume: 3, difficulty: 2, streak: 1 };

export interface WeekStripProps {
  days: DayCell[];
  onDayPress?: (day: DayCell) => void;
}

/**
 * §3.6.2 — seven columns, 5px gap: a 20px day pill above a 38px tri-ring.
 * Today's letter sits in a filled `#FA114F` pill; the rest are
 * `rgba(235,235,245,.45)` with no pill.
 */
export function WeekStrip({ days, onDayPress }: WeekStripProps) {
  return (
    <View style={s.row}>
      {days.map((d) => (
        <Pressable
          key={d.date}
          onPress={() => onDayPress?.(d)}
          style={({ pressed: p }) => [s.col, p && pressed]}>
          <View style={[s.pill, d.isToday && s.pillToday]}>
            <Text style={[s.letter, d.isToday && s.letterToday]}>{d.letter}</Text>
          </View>
          <Ring
            variant="day"
            size={ringSizes.day}
            stagger={40}
            animate={!d.isFuture}
            volume={{ value: d.solves, goal: DAY_TARGETS.volume }}
            difficulty={{ value: d.medPlus, goal: DAY_TARGETS.difficulty }}
            streak={{ value: d.solves > 0 ? 1 : 0, goal: DAY_TARGETS.streak }}
          />
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 5 },
  col: { flex: 1, alignItems: 'center', gap: 6 },
  pill: {
    height: 20,
    minWidth: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillToday: { backgroundColor: colors.volume },
  letter: { fontSize: 13, fontWeight: '700', color: colors.textTertiary },
  letterToday: { color: colors.text },
});

export default WeekStrip;
