/**
 * Trophies — the single source of truth for the trophy economy.
 *
 * Spec: design_handoff/trophy-explorer.html, variant 3 "Arena card" (the owner's
 * pick). Trophies are an *economy* layered on top of the nine gem ranks: the
 * ranks are a pure function of solve count and can only go up, trophies are
 * difficulty-weighted, streak-multiplied, and can be given back.
 *
 * ── The rule that governs this file ──────────────────────────────────────────
 * A trophy total is NEVER stored. There is no counter column, no increment on
 * write, nothing that can drift from reality. `totalTrophies()` is a pure
 * function of the user's `solves` rows (⋈ `problems.difficulty`), and the
 * `user_trophies` view in migration 0029 computes the same number with the same
 * formula server-side for crew standings. If you change an earn rate here, you
 * MUST change 0029 to match — the two are asserted to agree, and any drift shows
 * up as a user's own card disagreeing with their row in the crew table.
 *
 * ── Earn table (variant 3) ───────────────────────────────────────────────────
 *   Easy solved                     +8
 *   Medium solved                  +20
 *   Hard solved                    +45
 *   Streak multiplier (7d / 30d)   ×1.25 / ×1.5   — applies to the base above
 *   First solve of the day          +5            — flat, never multiplied
 *   Any ring closed                +25            — weekly, see WEEKLY_BONUS
 *   All three rings (week)         +60            — weekly, in addition
 *   Crew member beaten (weekly)    +40            — weekly, per member
 *   Inactive week                 −150            — weekly decay
 *
 * The first four rows are *derivable from the solves table alone*, so they make
 * up the *base total* that both this file and the SQL view compute. The last
 * four depend on ring goals / crew membership and are supplied as `WeeklyLedger`
 * entries, because a view over `solves` cannot see them. Both layers use the
 * same constants, so a client that applies a ledger and a server that does not
 * differ by exactly the ledger's sum — never by an earn rate.
 *
 * The ledger is *not* left to callers. Two screens render the same total (the
 * Summary header chip and the You-tab Arena card); if each assembled its own
 * ledger the two would disagree the moment one of them forgot a row. So
 * `useTrophies` derives the ledger itself, from the solves and catalog it has
 * already fetched plus the ring goals the caller passes in, and the crew rows
 * come from one shared query. Both screens therefore render one number.
 */
import { useMemo } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { RANKS, type RankKey } from '@/ranks/ranks-data';
import {
  addDays,
  isoDate,
  mondayOf,
  type Difficulty,
  type ProblemRow,
  type SolveRow,
} from '@/screens/summary/useSummaryData';

const sb = supabase as unknown as SupabaseClient;

export type { Difficulty, ProblemRow, SolveRow };

/* ------------------------------------------------------------------ */
/* Earn table                                                          */
/* ------------------------------------------------------------------ */

/** Base trophies for one *first-time* solve, by difficulty. */
export const EARN: Readonly<Record<Difficulty, number>> = {
  easy: 8,
  medium: 20,
  hard: 45,
} as const;

/**
 * A solve whose slug is missing from the problems catalog (unseeded problem,
 * catalog still loading) is valued as a medium rather than dropped, so a total
 * can never silently shrink. Server-side this branch is unreachable:
 * `solves.problem_slug` is a FK onto `problems.slug`.
 */
export const DEFAULT_DIFFICULTY: Difficulty = 'medium';

/** Flat, un-multiplied bonus for the first solve logged on a given day. */
export const FIRST_SOLVE_OF_DAY = 5;

/** Weekly bonuses — not derivable from `solves`, supplied via `WeeklyLedger`. */
export const WEEKLY_BONUS = {
  /** Any one of the three rings closed. Paid once per closed ring. */
  ringClosed: 25,
  /** All three rings closed in the same week, on top of the three ×25. */
  allRings: 60,
  /** Per crew member out-solved over the week. */
  crewBeaten: 40,
  /** A week with zero solves. The only way the total goes down. */
  inactiveWeek: -150,
} as const;

/**
 * Streak multiplier tiers, richest first. `days` is the length of the run of
 * consecutive active days ending on (and including) the day of the solve.
 */
export const STREAK_TIERS: ReadonlyArray<{ days: number; mult: number }> = [
  { days: 30, mult: 1.5 },
  { days: 7, mult: 1.25 },
] as const;

/** The multiplier a streak of `days` consecutive active days is worth. */
export function streakMultiplier(days: number): number {
  for (const t of STREAK_TIERS) if (days >= t.days) return t.mult;
  return 1;
}

/** Per-solve modifiers. Everything is optional; omitting all of it is ×1, +0. */
export interface SolveBonuses {
  /** Consecutive active days ending on this solve's day. Drives the multiplier. */
  streakDays?: number;
  /** Pre-computed multiplier. Overrides `streakDays` when both are given. */
  multiplier?: number;
  /** This solve was the first one logged on its day → +5. */
  firstOfDay?: boolean;
}

/**
 * Trophies for one solve. The rounding point is fixed here and mirrored in SQL:
 * `round(base × multiplier)` first, *then* the flat daily bonus — so a Hard on a
 * 30-day streak that opens the day is `round(45 × 1.5) + 5 = 73`, never
 * `round((45 + 5) × 1.5)`.
 */
export function earnForSolve(difficulty: Difficulty, bonuses: SolveBonuses = {}): number {
  const base = EARN[difficulty] ?? EARN[DEFAULT_DIFFICULTY];
  const mult = bonuses.multiplier ?? streakMultiplier(bonuses.streakDays ?? 0);
  return Math.round(base * mult) + (bonuses.firstOfDay ? FIRST_SOLVE_OF_DAY : 0);
}

/* ------------------------------------------------------------------ */
/* Leagues                                                             */
/* ------------------------------------------------------------------ */

export type LeagueKey = RankKey;

export interface League {
  /** Same key as the gem rank, so `GemBadge`/`GemChip` render it unchanged. */
  key: LeagueKey;
  /** Gem name — Bronze … Grandmaster. */
  name: string;
  /** Arena name, the variant-3 identity — Sandbox … Singularity. */
  arena: string;
  /** Trophy total at which this league starts. */
  threshold: number;
  /** Single-hue tint for chips, road fill and glow. */
  tint: string;
  /** Gem gradient stops, for the marker on the road. */
  gradient: readonly [string, string, string];
  /** 0-based position, 0 = Bronze … 8 = Grandmaster. */
  index: number;
}

/** Arena names, index-aligned with `RANKS`. Spec line: `ARENA` in the explorer. */
export const ARENA_NAMES = [
  'Sandbox',
  'Scratchpad',
  'Whiteboard',
  'Terminal',
  'Compiler',
  'Debugger',
  'Runtime',
  'Kernel',
  'Singularity',
] as const;

/**
 * Thresholds = the shipped solve thresholds (0/25/75/150/275/450/650/900/1200)
 * × the ~20-trophy average value of a solve, rounded to human numbers.
 */
export const LEAGUE_THRESHOLDS = [0, 500, 1500, 3000, 5500, 9000, 13000, 18000, 24000] as const;

/**
 * The nine leagues. Colours are read off `RANKS` rather than re-typed, so the
 * league table can never disagree with the gem art it renders.
 */
export const LEAGUES: readonly League[] = RANKS.map((r, i) => ({
  key: r.key,
  name: r.name,
  arena: ARENA_NAMES[i],
  threshold: LEAGUE_THRESHOLDS[i],
  tint: r.glow,
  gradient: r.g as readonly [string, string, string],
  index: i,
}));

/** The gold the Arena card itself is drawn in (cup, numeral, road fill). */
export const TROPHY_GOLD = '#F5C842';
export const TROPHY_GOLD_LIGHT = '#FFEEB0';

export const leagueByKey = (k: LeagueKey): League =>
  LEAGUES.find((l) => l.key === k) ?? LEAGUES[0];

/** The league a total sits in. Monotonic, never below Bronze. */
export function leagueForTotal(total: number): League {
  let out = LEAGUES[0];
  for (const l of LEAGUES) if (total >= l.threshold) out = l;
  return out;
}

/** The league above `l`, or null at Grandmaster. */
export const nextLeague = (l: League): League | null =>
  l.index < LEAGUES.length - 1 ? LEAGUES[l.index + 1] : null;

/** 0…1 through the *current* segment only — never across the whole range. */
export function progressWithinLeague(total: number): number {
  const cur = leagueForTotal(total);
  const nx = nextLeague(cur);
  if (!nx) return 1;
  const span = nx.threshold - cur.threshold;
  return Math.max(0, Math.min(1, (total - cur.threshold) / span));
}

/** Trophies still owed to promote. 0 at Grandmaster. */
export function trophiesToNextLeague(total: number): number {
  const nx = nextLeague(leagueForTotal(total));
  return nx ? Math.max(0, nx.threshold - total) : 0;
}

/**
 * 0…1 across the nine equal-pitch markers of the trophy road: whole leagues
 * advance in equal steps and the fill interpolates *within* the current
 * segment. That is what keeps Bronze→Silver from collapsing to a pixel.
 */
export function roadPosition(total: number): number {
  const cur = leagueForTotal(total);
  const last = LEAGUES.length - 1;
  return Math.min(1, (cur.index + progressWithinLeague(total)) / last);
}

export interface LeagueProgress {
  league: League;
  next: League | null;
  /** 0…1 within the current league. 1 at Grandmaster. */
  progress: number;
  /** Trophies still needed to promote. 0 at Grandmaster. */
  remaining: number;
  /** 0…1 along the equal-pitch road. */
  road: number;
  /** True once there is nothing above. */
  isMax: boolean;
}

/** Everything the Arena card needs about where a total sits, in one call. */
export function leagueProgress(total: number): LeagueProgress {
  const league = leagueForTotal(total);
  const next = nextLeague(league);
  return {
    league,
    next,
    progress: progressWithinLeague(total),
    remaining: trophiesToNextLeague(total),
    road: roadPosition(total),
    isMax: !next,
  };
}

/** `7,240` — tabular-friendly, matches the explorer's `fmt`. */
export const formatTrophies = (n: number): string => n.toLocaleString('en-US');

/** `+318` / `−150` / `0`, for the week-gain chip. Uses a real minus sign. */
export function formatGain(n: number): string {
  if (n === 0) return '0';
  return n > 0 ? `+${formatTrophies(n)}` : `−${formatTrophies(-n)}`;
}

/* ------------------------------------------------------------------ */
/* Derivation                                                          */
/* ------------------------------------------------------------------ */

/** The minimum a row needs to be worth trophies. `SolveRow` satisfies it. */
export interface SolveLike {
  problem_slug: string;
  /** `YYYY-MM-DD`. */
  solved_date: string;
}

/** One solve, priced. Emitted in date order — the `+N` toast feed. */
export interface TrophyEvent {
  slug: string;
  date: string;
  difficulty: Difficulty;
  /** Consecutive active days ending on `date`. */
  streakDays: number;
  multiplier: number;
  firstOfDay: boolean;
  /** Trophies this solve paid. 0 for a re-solve of a slug already counted. */
  amount: number;
}

/** A week's non-solve ledger — the four bonuses a view over `solves` can't see. */
export interface WeeklyLedger {
  /** Monday, `YYYY-MM-DD`. */
  weekStart: string;
  /** How many of the three rings closed (0–3). */
  ringsClosed?: number;
  /** Crew members out-solved this week. */
  crewBeaten?: number;
  /** Week had zero solves → −150. */
  inactive?: boolean;
}

export interface TrophyBreakdown {
  /** Derived from solves alone. Equals `user_trophies.trophies` in 0029. */
  base: number;
  /** Sum of every `WeeklyLedger` passed in. 0 when none were. */
  bonus: number;
  /** `base + bonus`, floored at 0 — decay can never push a user negative. */
  total: number;
  /** Trophies earned since Monday (base + this week's ledger). */
  weekGain: number;
  /** Base trophies grouped by difficulty, for the card's split. */
  byDifficulty: Record<Difficulty, number>;
  /** Trophies per `YYYY-MM-DD`, for the road's recent history. */
  byDate: Map<string, number>;
  /** Distinct problems that paid out. */
  countedSolves: number;
  /** Consecutive active days ending today (or yesterday, if today is idle). */
  streakDays: number;
  /** The multiplier the *next* solve would earn at. */
  currentMultiplier: number;
  /** Per-solve detail, oldest first. */
  events: TrophyEvent[];
}

export interface TrophyOptions {
  /** Difficulty per slug. Missing slugs fall back to `DEFAULT_DIFFICULTY`. */
  difficultyBySlug?: ReadonlyMap<string, Difficulty>;
  /** Weekly bonus rows. Omit for the pure, server-comparable base total. */
  ledger?: readonly WeeklyLedger[];
  /** Injectable "now" so tests and the streak edge case are deterministic. */
  today?: Date;
}

const dayNumber = (iso: string): number =>
  Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

/** Value of one weekly ledger row under the variant-3 table. */
export function weeklyLedgerValue(w: WeeklyLedger): number {
  if (w.inactive) return WEEKLY_BONUS.inactiveWeek;
  const rings = Math.max(0, Math.min(3, w.ringsClosed ?? 0));
  return (
    rings * WEEKLY_BONUS.ringClosed +
    (rings === 3 ? WEEKLY_BONUS.allRings : 0) +
    Math.max(0, w.crewBeaten ?? 0) * WEEKLY_BONUS.crewBeaten
  );
}

/* ------------------------------------------------------------------ */
/* Weekly ledger — the four rows a view over `solves` cannot see        */
/* ------------------------------------------------------------------ */

/** The three weekly ring targets. Same shape the Summary tab already derives. */
export interface RingGoals {
  volume: number;
  difficulty: number;
  /** Active days — `Goals.streak` on the Summary tab, `days_goal` on profiles. */
  days: number;
}

/** How far back the ledger looks. Matches the You tab's 12-week ring grid. */
export const LEDGER_WEEKS = 12;

export interface LedgerInput {
  goals: RingGoals;
  /** Difficulty per slug — an *empty* map here would misprice `medPlus`. */
  difficultyBySlug: ReadonlyMap<string, Difficulty>;
  /** Crew members out-solved, per Monday `YYYY-MM-DD`. Omit for no crew. */
  crewBeatenByWeek?: ReadonlyMap<string, number>;
  today?: Date;
  weeks?: number;
}

/**
 * The weekly ledger, derived from the same solve rows the base total is.
 *
 * Three rules that keep it from paying (or charging) for weeks it shouldn't:
 *
 * 1. **Rings are counted per week, against that week's goals.** Volume and
 *    med+ count solve *rows* (a re-solve is still work done this week), active
 *    days count distinct dates — identical to the You tab's ring grid, so the
 *    grid and the bonus can never tell different stories.
 * 2. **The live week is never "inactive."** A Monday with nothing logged yet is
 *    not a missed week, so `−150` can only ever land on a week that has ended.
 * 3. **Decay starts at the first solve.** Weeks before a user's first ever
 *    solve are not theirs to have missed; without this a brand-new account
 *    would open on `−150 × 11` and a floored total of 0.
 */
export function buildWeeklyLedger(
  solves: readonly SolveLike[],
  input: LedgerInput,
): WeeklyLedger[] {
  const { goals, difficultyBySlug, crewBeatenByWeek } = input;
  const span = input.weeks ?? LEDGER_WEEKS;
  const monday = mondayOf(input.today ?? new Date());
  const currentWeek = isoDate(monday);

  const keys: string[] = [];
  for (let i = span - 1; i >= 0; i--) keys.push(isoDate(addDays(monday, -i * 7)));
  const earliest = keys[0];

  const agg = new Map<string, { volume: number; medPlus: number; days: Set<string> }>();
  let firstSolveDate: string | null = null;
  for (const s of solves) {
    if (!firstSolveDate || s.solved_date < firstSolveDate) firstSolveDate = s.solved_date;
    if (s.solved_date < earliest) continue;
    const wk = isoDate(mondayOf(new Date(`${s.solved_date}T00:00:00`)));
    const e = agg.get(wk) ?? { volume: 0, medPlus: 0, days: new Set<string>() };
    e.volume++;
    const d = difficultyBySlug.get(s.problem_slug) ?? DEFAULT_DIFFICULTY;
    if (d === 'medium' || d === 'hard') e.medPlus++;
    e.days.add(s.solved_date);
    agg.set(wk, e);
  }

  /* The Monday of the week the account started earning in. Weeks before it are
     skipped entirely — no rings to close, no week to have missed. */
  const startWeek = firstSolveDate
    ? isoDate(mondayOf(new Date(`${firstSolveDate}T00:00:00`)))
    : null;

  const out: WeeklyLedger[] = [];
  for (const weekStart of keys) {
    if (!startWeek || weekStart < startWeek) continue;
    const e = agg.get(weekStart);
    const volume = e?.volume ?? 0;
    const isCurrent = weekStart === currentWeek;
    if (volume === 0) {
      if (isCurrent) continue; // rule 2 — the live week has not been missed
      out.push({ weekStart, inactive: true });
      continue;
    }
    /* A goal of 0 would make its ring close on every week that has any solve at
       all, so every target is worth at least one. */
    const rings =
      (volume >= Math.max(1, goals.volume) ? 1 : 0) +
      ((e?.medPlus ?? 0) >= Math.max(1, goals.difficulty) ? 1 : 0) +
      ((e?.days.size ?? 0) >= Math.max(1, goals.days) ? 1 : 0);
    out.push({
      weekStart,
      ringsClosed: rings,
      crewBeaten: crewBeatenByWeek?.get(weekStart) ?? 0,
    });
  }
  return out;
}

/**
 * The whole economy, computed from rows.
 *
 * Two rules that keep this honest and keep it matching 0029:
 *
 * 1. **One payout per problem.** Only the earliest solve of a given
 *    `problem_slug` pays base trophies; a re-solve on a later date pays 0. The
 *    `solves` unique key is `(user_id, problem_slug, solved_date)`, so without
 *    this a user could farm one Hard for 45 a day.
 * 2. **Every solve day counts as activity.** Streak runs and the first-solve-of
 *    -day bonus are computed over *all* solve days, re-solves included — a day
 *    spent on review still keeps the streak alive.
 */
export function computeTrophies(
  solves: readonly SolveLike[],
  opts: TrophyOptions = {},
): TrophyBreakdown {
  const diffOf = (slug: string): Difficulty =>
    opts.difficultyBySlug?.get(slug) ?? DEFAULT_DIFFICULTY;

  /* Active days → streak length ending on each day (gaps-and-islands). */
  const activeDays = Array.from(new Set(solves.map((s) => s.solved_date))).sort();
  const runLength = new Map<string, number>();
  let run = 0;
  let prev: number | null = null;
  for (const d of activeDays) {
    const n = dayNumber(d);
    run = prev !== null && n === prev + 1 ? run + 1 : 1;
    runLength.set(d, run);
    prev = n;
  }

  /* Earliest solve wins the payout; ties inside a day are broken by slug so the
     result is stable no matter what order the rows came back in. */
  const ordered = [...solves].sort(
    (a, b) =>
      a.solved_date.localeCompare(b.solved_date) ||
      a.problem_slug.localeCompare(b.problem_slug),
  );

  const weekStart = isoDate(mondayOf(opts.today ?? new Date()));
  const byDifficulty: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 };
  const byDate = new Map<string, number>();
  const events: TrophyEvent[] = [];
  const paid = new Set<string>();
  const dayOpened = new Set<string>();

  let base = 0;
  let weekBase = 0;

  for (const s of ordered) {
    const streakDays = runLength.get(s.solved_date) ?? 1;
    const multiplier = streakMultiplier(streakDays);
    const difficulty = diffOf(s.problem_slug);
    const isNew = !paid.has(s.problem_slug);

    // A re-solve pays nothing, not even the daily opener: the +5 belongs to the
    // day's first *earning* solve, so a review-only day is worth 0. The opener
    // is therefore claimed only by a paying solve — a re-solve that happens to
    // sort first within the day must not consume it, or a day that opens on
    // review would come out 5 short of `user_trophies` (0029, rule 4).
    const firstOfDay = isNew && !dayOpened.has(s.solved_date);
    if (isNew) {
      paid.add(s.problem_slug);
      dayOpened.add(s.solved_date);
    }

    const amount = isNew ? earnForSolve(difficulty, { multiplier, firstOfDay }) : 0;

    if (amount) {
      base += amount;
      byDifficulty[difficulty] += amount;
      byDate.set(s.solved_date, (byDate.get(s.solved_date) ?? 0) + amount);
      if (s.solved_date >= weekStart) weekBase += amount;
    }
    events.push({
      slug: s.problem_slug,
      date: s.solved_date,
      difficulty,
      streakDays,
      multiplier,
      firstOfDay,
      amount,
    });
  }

  const ledger = opts.ledger ?? [];
  let bonus = 0;
  let weekBonus = 0;
  for (const w of ledger) {
    const v = weeklyLedgerValue(w);
    bonus += v;
    if (w.weekStart >= weekStart) weekBonus += v;
  }

  /* Streak as of *now*: today's run if the user solved today, yesterday's if
     they haven't yet — a streak only breaks once a whole day has passed. */
  const todayIso = isoDate(opts.today ?? new Date());
  const yesterdayIso = isoDate(
    new Date(Date.parse(`${todayIso}T00:00:00Z`) - 86_400_000),
  );
  const solvedToday = runLength.has(todayIso);
  const streakDays = runLength.get(todayIso) ?? runLength.get(yesterdayIso) ?? 0;
  /* What the next solve would be multiplied by: solving again today rides the
     same run, solving for the first time today extends it by one. */
  const nextStreakDays = solvedToday ? streakDays : streakDays + 1;

  return {
    base,
    bonus,
    total: Math.max(0, base + bonus),
    weekGain: weekBase + weekBonus,
    byDifficulty,
    byDate,
    countedSolves: paid.size,
    streakDays,
    currentMultiplier: streakMultiplier(nextStreakDays),
    events,
  };
}

/** Shorthand when only the number matters (crew rows, header chip). */
export const totalTrophies = (
  solves: readonly SolveLike[],
  opts: TrophyOptions = {},
): number => computeTrophies(solves, opts).total;

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

/**
 * Query keys are deliberately the ones `useSummaryData` already uses, with
 * byte-identical `select` lists, so the two share one cache entry: opening the
 * You tab after the Summary tab costs zero requests, and a solve logged
 * anywhere invalidates both at once.
 */
export const TROPHY_QUERY_KEYS = {
  solves: (uid: string | null | undefined) => ['summary-solves', uid] as const,
  problems: () => ['problems-catalog'] as const,
  crew: (uid: string | null | undefined) => ['trophy-crew-weekly', uid] as const,
};

/**
 * Identical to `useSummaryData`'s private `fetchSolves`. Exported so any screen
 * that needs the raw history reads it under `TROPHY_QUERY_KEYS.solves` instead
 * of opening a second full download of the same rows.
 */
export async function fetchSolves(userId: string): Promise<SolveRow[]> {
  const { data, error } = await sb
    .from('solves')
    .select('id, problem_slug, solved_date, points')
    .eq('user_id', userId)
    .order('solved_date', { ascending: false })
    .limit(5000);
  if (error) throw error;
  return (data ?? []) as SolveRow[];
}

/** Identical to `useSummaryData`'s private `fetchProblems`. */
export async function fetchProblems(): Promise<ProblemRow[]> {
  const { data, error } = await sb
    .from('problems')
    .select('slug, title, difficulty, tags, is_premium')
    .range(0, 9999);
  if (error) throw error;
  return (data ?? []) as ProblemRow[];
}

/**
 * Crew members out-solved, per week — the one ledger row that is not in the
 * user's own rows. One query, one cache entry, both screens.
 *
 * Returns an empty map (not an error) for a soloist or a crew RLS keeps hidden:
 * "no crew" and "no bonus" are the same outcome, and the total must not stall
 * on it.
 */
async function fetchCrewBeatenByWeek(
  userId: string,
  weeks: number,
): Promise<Map<string, number>> {
  const since = isoDate(addDays(mondayOf(new Date()), -(weeks - 1) * 7));
  const out = new Map<string, number>();

  const { data: mine } = await sb.from('group_members').select('group_id').eq('user_id', userId);
  const groupIds = (mine ?? []).map((g: { group_id: string }) => g.group_id);
  if (!groupIds.length) return out;

  const { data: peers } = await sb
    .from('group_members')
    .select('user_id')
    .in('group_id', groupIds);
  const ids = Array.from(new Set((peers ?? []).map((p: { user_id: string }) => p.user_id)));
  if (ids.length < 2) return out;

  const { data: rows, error } = await sb
    .from('solves')
    .select('user_id, solved_date')
    .in('user_id', ids)
    .gte('solved_date', since);
  if (error) return out;

  /* week → member → solves that week */
  const perWeek = new Map<string, Map<string, number>>();
  for (const r of (rows ?? []) as Array<{ user_id: string; solved_date: string }>) {
    const wk = isoDate(mondayOf(new Date(`${r.solved_date}T00:00:00`)));
    const m = perWeek.get(wk) ?? new Map<string, number>();
    m.set(r.user_id, (m.get(r.user_id) ?? 0) + 1);
    perWeek.set(wk, m);
  }
  for (const [wk, m] of perWeek) {
    const mineCount = m.get(userId) ?? 0;
    if (!mineCount) continue; // you cannot out-solve anyone on a week you sat out
    let beaten = 0;
    for (const [id, n] of m) if (id !== userId && n < mineCount) beaten++;
    /* Members with zero rows that week are absent from `m` entirely, so they
       count too — everyone in the crew who is not me and not ahead. */
    beaten += ids.length - 1 - (m.size - 1);
    out.set(wk, beaten);
  }
  return out;
}

export interface UseTrophiesResult extends TrophyBreakdown, LeagueProgress {
  /**
   * True until every input the total depends on has landed. The total is 0 and
   * the league is Bronze while it is true — read it as "there is no number
   * yet", never as "the number is 0", or the UI will paint a zero and snap.
   */
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  /** The ledger that was applied. Empty until `isLoading` clears. */
  ledger: readonly WeeklyLedger[];
  refetch: () => void;
}

export interface UseTrophiesOptions {
  /**
   * This user's three weekly ring targets. Supplied by the caller because both
   * screens have already fetched the profile they live on.
   *
   * Three states, deliberately: an object means "score the weekly rows against
   * these"; `null` means "my profile is still loading, hold everything" — goals
   * that arrive late would otherwise re-score every week and walk the total
   * after it had already been shown; `undefined` means "no weekly rows at all",
   * which is the pure, server-comparable base that tests and crew rows want.
   */
  goals?: RingGoals | null;
  /** Pre-built ledger. Overrides derivation; for tests and Storybook. */
  ledger?: readonly WeeklyLedger[];
  today?: Date;
}

const EMPTY_LEDGER: readonly WeeklyLedger[] = [];

/**
 * The Arena card's data source: total, league, week gain, all derived client
 * side from the solves already in cache. Nothing here reads a stored counter.
 *
 * **Nothing is computed from a partial input.** The catalog decides what a
 * solve is worth (8 / 20 / 45), so computing while it is in flight prices every
 * solve as a medium and publishes a total that is wrong by hundreds — then
 * corrects itself a beat later, which the gain-toast feed reads as a windfall.
 * Until both queries have resolved this hook reports `isLoading` with a zeroed
 * breakdown, and callers render a placeholder rather than that zero.
 */
export function useTrophies(
  uid: string | null | undefined,
  options: UseTrophiesOptions = {},
): UseTrophiesResult {
  const solvesQ: UseQueryResult<SolveRow[]> = useQuery({
    queryKey: TROPHY_QUERY_KEYS.solves(uid),
    queryFn: () => fetchSolves(uid!),
    enabled: !!uid,
  });
  const problemsQ: UseQueryResult<ProblemRow[]> = useQuery({
    queryKey: TROPHY_QUERY_KEYS.problems(),
    queryFn: fetchProblems,
    staleTime: Infinity,
  });
  const crewQ: UseQueryResult<Map<string, number>> = useQuery({
    queryKey: TROPHY_QUERY_KEYS.crew(uid),
    queryFn: () => fetchCrewBeatenByWeek(uid!, LEDGER_WEEKS),
    enabled: !!uid,
    staleTime: 1000 * 60 * 5,
  });

  const { goals, ledger: ledgerOverride, today } = options;
  const solves = solvesQ.data;
  const problems = problemsQ.data;

  /* Ring/crew bonuses may still be resolving after the total itself can be
     trusted, but the crew query only ever *adds* — so the total waits for it
     too, rather than printing a base and then jumping by a bonus. */
  const ready =
    !!solves &&
    !!problems &&
    goals !== null &&
    (!uid || !!crewQ.data || crewQ.isError);

  const difficultyBySlug = useMemo(
    () => new Map<string, Difficulty>((problems ?? []).map((p) => [p.slug, p.difficulty])),
    [problems],
  );

  const ledger = useMemo<readonly WeeklyLedger[]>(() => {
    if (ledgerOverride) return ledgerOverride;
    if (!ready || !goals || !solves) return EMPTY_LEDGER;
    return buildWeeklyLedger(solves, {
      goals,
      difficultyBySlug,
      crewBeatenByWeek: crewQ.data,
      today,
    });
  }, [ledgerOverride, ready, goals, solves, difficultyBySlug, crewQ.data, today]);

  const breakdown = useMemo(() => {
    if (!ready) return computeTrophies([], { today });
    return computeTrophies(solves ?? [], { difficultyBySlug, ledger, today });
  }, [ready, solves, difficultyBySlug, ledger, today]);

  const progress = useMemo(() => leagueProgress(breakdown.total), [breakdown.total]);

  return {
    ...breakdown,
    ...progress,
    ledger,
    isLoading: !ready,
    isFetching: solvesQ.isFetching || problemsQ.isFetching || crewQ.isFetching,
    error: solvesQ.error ?? problemsQ.error,
    refetch: () => {
      void solvesQ.refetch();
      void problemsQ.refetch();
      void crewQ.refetch();
    },
  };
}
