/**
 * Weekly recap data — everything the shareable recap card prints.
 *
 * **No new queries.** The two rows this needs (`solves`, `problems`) are the
 * exact ones `useSummaryData` and `useTrophies` already hold, read back under
 * the identical `TROPHY_QUERY_KEYS`, so mounting this hook costs zero requests
 * and the recap can never disagree with the screen behind it.
 *
 * The trophy side is not recomputed either: the caller passes the `byDate` map
 * and the weekly ledger it already has from `useTrophies`, and a week's payout
 * is the sum of the dates inside it plus that week's ledger row. Trophies stay
 * derived from solves — never a stored counter (TROPHY SPEC).
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TROPHY_QUERY_KEYS,
  fetchProblems,
  fetchSolves,
  weeklyLedgerValue,
  type WeeklyLedger,
} from '@/lib/trophies';
import {
  RADAR_AXES,
  addDays,
  isoDate,
  isoWeekNumber,
  mondayOf,
  type Difficulty,
  type Goals,
} from './useSummaryData';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface RecapDay {
  /** `YYYY-MM-DD` */
  date: string;
  /** M T W T F S S */
  letter: string;
  solves: number;
  medPlus: number;
  /** Day has not happened yet — drawn as an empty column. */
  isFuture: boolean;
}

export interface RecapMetric {
  value: number;
  goal: number;
}

export interface WeekRecap {
  /** Monday, `YYYY-MM-DD`. Stable key for the segmented control. */
  weekStart: string;
  /** Sunday, `YYYY-MM-DD`. */
  weekEnd: string;
  /** ISO week number — the "Week 34" the card wears. */
  weekNumber: number;
  /** Is this the live week? */
  isCurrent: boolean;
  /** `Aug 18 – Aug 24` */
  range: string;

  volume: number;
  medPlus: number;
  activeDays: number;
  /** Solve rows per difficulty — the split bar. */
  split: Record<Difficulty, number>;

  goals: Goals;
  rings: { volume: RecapMetric; difficulty: RecapMetric; streak: RecapMetric };
  /** 0–3, scored the same way `buildWeeklyLedger` scores it. */
  ringsClosed: number;

  /** Trophies the week paid: solve payouts inside it + its ledger row. */
  trophies: number;

  /** Consecutive active days ending on the week's last elapsed day. */
  streakDays: number;
  /** …and whether that run is still alive as of today. */
  streakLive: boolean;

  days: RecapDay[];
  /** Busiest day of the week, `null` for a week with no solves. */
  bestDay: { date: string; letter: string; name: string; solves: number } | null;
  /** The week's toughest solve — hard beats medium beats easy, latest wins. */
  hardest: { title: string; difficulty: Difficulty } | null;
  /** The tag the week leaned on hardest. */
  topTopic: { label: string; solves: number } | null;
}

export interface UseRecapDataOptions {
  goals: Goals;
  /** `TrophyBreakdown.byDate` from `useTrophies` — trophies per `YYYY-MM-DD`. */
  trophyByDate?: ReadonlyMap<string, number>;
  /** The ledger `useTrophies` applied, for the weekly bonus rows. */
  ledger?: readonly WeeklyLedger[];
  today?: Date;
}

export interface RecapData {
  isLoading: boolean;
  /** Current week first, then last week when it has anything to show. */
  weeks: WeekRecap[];
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
const DIFF_RANK: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

/** `Aug 18 – Aug 24`, dropping the repeated month inside one month. */
function rangeLabel(start: string, end: string): string {
  const a = shortDate(start);
  const b = shortDate(end);
  const sameMonth = a.split(' ')[0] === b.split(' ')[0];
  return `${a} – ${sameMonth ? b.split(' ')[1] : b}`;
}

/** Consecutive active days ending on `endIso` (0 when that day is idle). */
function runEndingOn(active: ReadonlySet<string>, endIso: string): number {
  let n = 0;
  let cursor = new Date(`${endIso}T00:00:00`);
  while (active.has(isoDate(cursor))) {
    n += 1;
    cursor = addDays(cursor, -1);
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* Builder                                                             */
/* ------------------------------------------------------------------ */

export interface RecapInput {
  solves: readonly { problem_slug: string; solved_date: string }[];
  problems: ReadonlyMap<string, { title: string; difficulty: Difficulty; tags: string[] }>;
  goals: Goals;
  trophyByDate?: ReadonlyMap<string, number>;
  ledger?: readonly WeeklyLedger[];
  today: Date;
}

/** One week of recap, built from rows the app already has in memory. */
export function buildWeekRecap(monday: Date, input: RecapInput): WeekRecap {
  const { solves, problems, goals, trophyByDate, ledger, today } = input;
  const weekStart = isoDate(monday);
  const weekEnd = isoDate(addDays(monday, 6));
  const todayIso = isoDate(today);
  const currentWeekStart = isoDate(mondayOf(today));

  const split: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 };
  const perDay = new Map<string, { solves: number; medPlus: number }>();
  const tagCount = new Map<string, number>();
  const activeDays = new Set<string>();
  let volume = 0;
  let medPlus = 0;
  let hardest: { title: string; difficulty: Difficulty; date: string } | null = null;

  for (const s of solves) {
    activeDays.add(s.solved_date);
    if (s.solved_date < weekStart || s.solved_date > weekEnd) continue;

    const p = problems.get(s.problem_slug);
    const difficulty: Difficulty = p?.difficulty ?? 'medium';
    volume += 1;
    split[difficulty] += 1;
    if (difficulty !== 'easy') medPlus += 1;

    const cell = perDay.get(s.solved_date) ?? { solves: 0, medPlus: 0 };
    cell.solves += 1;
    if (difficulty !== 'easy') cell.medPlus += 1;
    perDay.set(s.solved_date, cell);

    for (const t of p?.tags ?? []) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);

    if (
      p &&
      (!hardest ||
        DIFF_RANK[difficulty] > DIFF_RANK[hardest.difficulty] ||
        (DIFF_RANK[difficulty] === DIFF_RANK[hardest.difficulty] &&
          s.solved_date > hardest.date))
    ) {
      hardest = { title: p.title, difficulty, date: s.solved_date };
    }
  }

  const days: RecapDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = isoDate(addDays(monday, i));
    const cell = perDay.get(date) ?? { solves: 0, medPlus: 0 };
    return { date, letter: DAY_LETTERS[i], solves: cell.solves, medPlus: cell.medPlus, isFuture: date > todayIso };
  });

  const activeCount = days.filter((d) => d.solves > 0).length;

  /* Ring scoring, identical to `buildWeeklyLedger`: a goal of 0 would close on
     any week with a single solve, so every target is worth at least one. */
  const ringsClosed =
    (volume >= Math.max(1, goals.volume) ? 1 : 0) +
    (medPlus >= Math.max(1, goals.difficulty) ? 1 : 0) +
    (activeCount >= Math.max(1, goals.streak) ? 1 : 0);

  let trophies = 0;
  if (trophyByDate) {
    for (const d of days) trophies += trophyByDate.get(d.date) ?? 0;
  }
  const row = ledger?.find((w) => w.weekStart === weekStart);
  if (row) trophies += weeklyLedgerValue(row);

  const best = days.reduce<RecapDay | null>(
    (hi, d) => (d.solves > 0 && (!hi || d.solves > hi.solves) ? d : hi),
    null,
  );

  /* The streak the week ended on: measured from its last *elapsed* day, so the
     live week reads today's run rather than a Sunday that hasn't happened. */
  const lastElapsed = weekEnd > todayIso ? todayIso : weekEnd;
  const streakDays = runEndingOn(activeDays, lastElapsed);

  const axisLabel = new Map(RADAR_AXES.map((a) => [a.tag, a.label]));
  let topTopic: WeekRecap['topTopic'] = null;
  for (const [tag, n] of tagCount) {
    if (!topTopic || n > topTopic.solves) topTopic = { label: axisLabel.get(tag) ?? tag, solves: n };
  }

  return {
    weekStart,
    weekEnd,
    weekNumber: isoWeekNumber(monday),
    isCurrent: weekStart === currentWeekStart,
    range: rangeLabel(weekStart, weekEnd),
    volume,
    medPlus,
    activeDays: activeCount,
    split,
    goals,
    rings: {
      volume: { value: volume, goal: goals.volume },
      difficulty: { value: medPlus, goal: goals.difficulty },
      streak: { value: activeCount, goal: goals.streak },
    },
    ringsClosed,
    trophies,
    streakDays,
    streakLive: streakDays > 0 && lastElapsed === todayIso,
    days,
    bestDay: best
      ? {
          date: best.date,
          letter: best.letter,
          name: DAY_NAMES[days.indexOf(best)] ?? '',
          solves: best.solves,
        }
      : null,
    hardest: hardest ? { title: hardest.title, difficulty: hardest.difficulty } : null,
    topTopic,
  };
}

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

export function useRecapData(
  userId: string,
  { goals, trophyByDate, ledger, today }: UseRecapDataOptions,
): RecapData {
  const solvesQ = useQuery({
    queryKey: TROPHY_QUERY_KEYS.solves(userId),
    queryFn: () => fetchSolves(userId),
    enabled: !!userId,
  });
  const problemsQ = useQuery({
    queryKey: TROPHY_QUERY_KEYS.problems(),
    queryFn: fetchProblems,
    staleTime: Infinity,
  });

  const solves = solvesQ.data;
  const problems = problemsQ.data;

  const weeks = useMemo<WeekRecap[]>(() => {
    if (!solves || !problems) return [];
    const now = today ?? new Date();
    const bySlug = new Map(problems.map((p) => [p.slug, p]));
    const input: RecapInput = { solves, problems: bySlug, goals, trophyByDate, ledger, today: now };

    const thisMonday = mondayOf(now);
    const lastMonday = addDays(thisMonday, -7);
    const current = buildWeekRecap(thisMonday, input);
    const previous = buildWeekRecap(lastMonday, input);
    /* Last week is only offered when there is a week to look back on — a
       brand-new account gets one segment, not an empty second one. */
    return previous.volume > 0 ? [current, previous] : [current];
  }, [solves, problems, goals, trophyByDate, ledger, today]);

  return { isLoading: !solves || !problems, weeks };
}

export default useRecapData;
