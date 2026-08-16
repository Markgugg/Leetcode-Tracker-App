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
  /** `YYYY-MM-DD` of the day scoping the Activity Rings card — `null` = week. */
  selectedDate?: string | null;
}

/**
 * §3.6.2 — seven columns, 5px gap: a 20px day pill above a 38px tri-ring.
 * Today's letter sits in a filled `#FA114F` pill; the rest are
 * `rgba(235,235,245,.45)` with no pill.
 *
 * A selected day wears the grey pill the ring sheet's own strip uses. Today's
 * marker is applied last so it always survives — the selected column keeps its
 * dot underneath, which is the indicator that would otherwise be lost.
 */
export function WeekStrip({ days, onDayPress, selectedDate = null }: WeekStripProps) {
  return (
    <View style={s.row}>
      {days.map((d) => {
        const isSel = d.date === selectedDate;
        return (
        <Pressable
          key={d.date}
          onPress={() => onDayPress?.(d)}
          accessibilityRole="button"
          accessibilityState={{ selected: isSel }}
          style={({ pressed: p }) => [s.col, p && pressed]}>
          <View style={[s.pill, isSel && s.pillSel, d.isToday && s.pillToday]}>
            <Text style={[s.letter, (d.isToday || isSel) && s.letterToday]}>{d.letter}</Text>
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
          <View style={[s.selDot, isSel && s.selDotOn]} />
        </Pressable>
        );
      })}
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
  pillSel: { backgroundColor: colors.controlSelected },
  letter: { fontSize: 13, fontWeight: '700', color: colors.textTertiary },
  letterToday: { color: colors.text },
  selDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
  selDotOn: { backgroundColor: colors.text },
});

export default WeekStrip;
