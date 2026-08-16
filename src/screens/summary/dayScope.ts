/**
 * Day-scoping shared by the Activity Rings card and the Ring detail sheet.
 *
 * Both surfaces answer the same question — "what do the three rings read when
 * the scope is one day instead of the week?" — so the per-day targets and the
 * value/goal projection live here rather than being written twice.
 */
import { DAY_TARGETS } from './WeekStrip';
import type { DayCell, Goals } from './useSummaryData';

export interface RingTriple {
  volume: { value: number; goal: number };
  difficulty: { value: number; goal: number };
  streak: { value: number; goal: number };
}

export interface WeekTotals {
  volume: number;
  medPlus: number;
  days: number;
}

/**
 * Per-day targets when a day is in focus; the week's own goals otherwise.
 * `dayGoal` is the daily volume target (defaults to `DAY_TARGETS.volume`).
 */
export function ringScope(
  day: DayCell | null,
  week: WeekTotals,
  goals: Goals,
  dayGoal: number = DAY_TARGETS.volume,
): RingTriple {
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
}

export const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/** Monday-first index → a readable name, so the two "T"s are never ambiguous. */
export function dayName(days: DayCell[], day: DayCell): string {
  if (day.isToday) return 'Today';
  const i = days.findIndex((d) => d.date === day.date);
  return DAY_NAMES[i] ?? day.letter;
}

/** Resolve a `YYYY-MM-DD` selection against the week. `null` = whole week. */
export function findDay(days: DayCell[], date: string | null): DayCell | null {
  if (!date) return null;
  return days.find((d) => d.date === date) ?? null;
}
