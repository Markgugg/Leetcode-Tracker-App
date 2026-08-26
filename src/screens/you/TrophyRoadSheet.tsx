/**
 * Trophy Road drill-down — the sheet behind the Arena card.
 *
 * Same chrome and typography as the other drill-downs (`RingDetailSheet`,
 * `WeekDetailSheet`): shared `Sheet`, nothing boxed, sections separated by
 * hairlines, a big colour-carrying numeral per section over a track.
 *
 * Everything on it is a pure function of `computeTrophies` — the total, the
 * league, the split. Nothing here reads or keeps a counter, so the road can
 * never tell a different story from the Arena card that opened it.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Sheet } from '@/components/Sheet';
import { GemBadge } from '@/ranks/GemBadge';
import type { RankKey } from '@/ranks/ranks-data';
import {
  EARN,
  LEAGUES,
  TROPHY_GOLD,
  formatGain,
  formatTrophies,
  type Difficulty,
  type League,
} from '@/lib/trophies';
import { clamp, colors, difficultyColor, tabular, type } from '@/theme';

/** Gem size on the road. A gem is drawn 130×138, so its box is a touch taller. */
const ROAD_GEM = 30;
const ROAD_GEM_H = Math.round((ROAD_GEM * 138) / 130);
/** Width of the rail column — gem plus air either side. */
const RAIL_W = 44;

const GOLD_HAIRLINE = 'rgba(245,200,66,0.24)';
const GOLD_TINT = 'rgba(245,200,66,0.08)';

export interface TrophyRoadDetail {
  /** Lifetime total, derived. */
  total: number;
  /** Earned since Monday, base + ledger. */
  weekGain: number;
  league: League;
  next: League | null;
  /** Trophies still owed to promote. 0 at Grandmaster. */
  remaining: number;
  /** 0…1 through the current league only. */
  progress: number;
  /** Base trophies grouped by difficulty. */
  byDifficulty: Record<Difficulty, number>;
  /** Distinct problems that paid out. */
  countedSolves: number;
  /** Consecutive active days ending today. */
  streakDays: number;
  /** What the next solve would be multiplied by. */
  currentMultiplier: number;
  /** False while the total is still a placeholder 0. */
  ready: boolean;
}

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];
const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

export function TrophyRoadSheet({
  visible,
  onClose,
  detail,
}: {
  visible: boolean;
  onClose: () => void;
  detail: TrophyRoadDetail | null;
}) {
  if (!detail) {
    return <Sheet visible={visible} onClose={onClose} title="Trophy Road" />;
  }

  const { league, next, ready } = detail;
  const earned = DIFFICULTIES.reduce((a, d) => a + detail.byDifficulty[d], 0);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Trophy Road"
      subtitle={`${league.arena} Arena`}>
      {/* ---- hero ------------------------------------------------------- */}
      <View style={s.hero}>
        <GemBadge tier={league.key as RankKey} size={64} />
        <Text style={s.heroNumeral}>{ready ? formatTrophies(detail.total) : '—'}</Text>
        <Text style={s.heroCaption}>
          {!ready
            ? ' '
            : detail.weekGain !== 0
              ? `${formatGain(detail.weekGain)} this week`
              : 'No trophies yet this week'}
        </Text>
      </View>

      {/* ---- progress through the current league ------------------------ */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>{next ? `To ${next.name}` : 'Max league'}</Text>
        <View style={s.numeralRow}>
          <Text style={[s.numeral, { color: TROPHY_GOLD }]}>
            {next ? formatTrophies(detail.remaining) : formatTrophies(detail.total)}
          </Text>
          <Text style={[s.numeralUnit, { color: TROPHY_GOLD }]}>
            {next ? 'TO GO' : 'TROPHIES'}
          </Text>
        </View>
        <View style={s.track}>
          <View
            style={[
              s.fill,
              { width: `${clamp(detail.progress) * 100}%`, backgroundColor: TROPHY_GOLD },
            ]}
          />
        </View>
        <View style={s.trackLabels}>
          <Text style={s.trackLabel}>{formatTrophies(league.threshold)}</Text>
          <Text style={s.trackLabel}>
            {next ? formatTrophies(next.threshold) : 'Grandmaster'}
          </Text>
        </View>
      </View>

      <View style={s.rule} />

      {/* ---- the road --------------------------------------------------- */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>The road</Text>
        <Text style={s.sectionCaption}>
          Nine leagues. A promotion sticks — the gem you are wearing is the
          highest total you have held.
        </Text>

        <View style={s.road}>
          {LEAGUES.map((l, i) => (
            <RoadStop
              key={l.key}
              league={l}
              state={i < league.index ? 'earned' : i === league.index ? 'current' : 'locked'}
              first={i === 0}
              last={i === LEAGUES.length - 1}
              total={detail.total}
              next={i === league.index ? next : null}
              progress={detail.progress}
            />
          ))}
        </View>
      </View>

      <View style={s.rule} />

      {/* ---- earn rates -------------------------------------------------- */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Earn rates</Text>
        <Text style={s.sectionCaption}>
          Paid once per problem, the first time you solve it.
          {detail.currentMultiplier > 1
            ? ` Your ${detail.streakDays}-day streak multiplies every one of these by ×${detail.currentMultiplier}.`
            : ' A 7-day streak multiplies these by ×1.25, a 30-day one by ×1.5.'}
        </Text>

        {DIFFICULTIES.map((d) => {
          const got = detail.byDifficulty[d];
          const color = difficultyColor(d);
          return (
            <View key={d} style={s.earnRow}>
              <View style={s.earnHead}>
                <View style={s.earnLabelWrap}>
                  <View style={[s.dot, { backgroundColor: color }]} />
                  <Text style={s.earnLabel}>{DIFFICULTY_LABEL[d]}</Text>
                </View>
                <Text style={[s.earnRate, { color }]}>+{EARN[d]}</Text>
              </View>
              <View style={s.earnTrack}>
                <View
                  style={[
                    s.earnFill,
                    {
                      width: `${(earned ? got / earned : 0) * 100}%`,
                      backgroundColor: color,
                    },
                  ]}
                />
              </View>
              <Text style={s.earnTotal}>
                {formatTrophies(got)} earned · {earned ? Math.round((got / earned) * 100) : 0}% of
                your total
              </Text>
            </View>
          );
        })}
      </View>

      <View style={s.rule} />

      {/* ---- quiet secondary numerals ------------------------------------ */}
      <View style={s.statPair}>
        <Stat label="Problems paid" value={formatTrophies(detail.countedSolves)} />
        <Stat label="Streak" value={`${detail.streakDays}d`} />
        <Stat label="Multiplier" value={`×${detail.currentMultiplier}`} />
      </View>

      <Text style={s.footnote}>
        Trophies are never stored. Every number here is recomputed from your
        solve history, so it can only ever agree with what you have actually
        solved. Weekly rings, crew wins and idle weeks are settled on top of the
        rates above.
      </Text>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* One stop on the road                                                */
/* ------------------------------------------------------------------ */

function RoadStop({
  league,
  state,
  first,
  last,
  total,
  next,
  progress,
}: {
  league: League;
  state: 'earned' | 'current' | 'locked';
  first: boolean;
  last: boolean;
  /** Lifetime total — only read by the current stop. */
  total: number;
  /** The league above, on the current stop only. */
  next: League | null;
  progress: number;
}) {
  const locked = state === 'locked';
  const current = state === 'current';

  return (
    <View style={s.stop}>
      {/* rail + gem */}
      <View style={s.rail}>
        {/* The rail behind the gem, gold up to and including the current stop.
            Two halves so a stop can be the end of the earned run. */}
        {!first ? (
          <View
            style={[s.railSeg, s.railTop, { backgroundColor: locked ? RAIL_OFF : RAIL_ON }]}
          />
        ) : null}
        {!last ? (
          <View
            style={[
              s.railSeg,
              s.railBottom,
              { backgroundColor: locked || current ? RAIL_OFF : RAIL_ON },
            ]}
          />
        ) : null}
        <View style={locked ? s.gemLocked : undefined}>
          <GemBadge tier={league.key as RankKey} size={ROAD_GEM} />
        </View>
      </View>

      {/* body */}
      <View style={[s.stopBody, current && s.stopBodyCurrent, locked && s.stopBodyLocked]}>
        <View style={s.stopHead}>
          <View style={s.stopNames}>
            <Text style={[s.stopName, locked && { color: colors.textSecondary }]}>
              {league.name}
            </Text>
            <Text style={s.stopArena}>{league.arena} Arena</Text>
          </View>
          <View style={s.stopRight}>
            <Text
              style={[
                s.stopThreshold,
                { color: locked ? colors.textTertiary : TROPHY_GOLD },
              ]}>
              {formatTrophies(league.threshold)}
            </Text>
            <Text style={s.stopState}>
              {state === 'earned' ? 'Earned' : current ? 'You are here' : 'Locked'}
            </Text>
          </View>
        </View>

        {current && next ? (
          <>
            <View style={s.stopTrack}>
              <View
                style={[
                  s.stopFill,
                  { width: `${clamp(progress) * 100}%`, backgroundColor: TROPHY_GOLD },
                ]}
              />
            </View>
            <Text style={s.stopProgress}>
              {formatTrophies(total)} / {formatTrophies(next.threshold)} toward {next.name}
            </Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

const RAIL_ON = 'rgba(245,200,66,0.55)';
const RAIL_OFF = colors.controlAlt16;

/* ------------------------------------------------------------------ */

/** Big quiet numeral under a small label — the pattern `RingDetailSheet` uses. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { alignItems: 'center', paddingTop: 2, paddingBottom: 18 },
  heroNumeral: {
    ...type.heroDisplay,
    ...tabular,
    color: TROPHY_GOLD,
    marginTop: 6,
  },
  heroCaption: { ...type.caption, ...tabular, color: colors.textTertiary, marginTop: 2 },

  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline },

  section: { paddingTop: 22, paddingBottom: 24 },
  sectionTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3, color: colors.text },
  sectionCaption: {
    ...type.bodySecondary,
    color: colors.textTertiary,
    marginTop: 6,
  },

  numeralRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 },
  numeral: { fontSize: 28, fontWeight: '700', letterSpacing: -1, ...tabular },
  numeralUnit: { fontSize: 13.5, fontWeight: '700', letterSpacing: 0.3 },

  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.controlAlt16,
    marginTop: 12,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: 3 },
  trackLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  trackLabel: { ...type.chartLabel, ...tabular, color: colors.textChartLabel },

  /* road */
  road: { marginTop: 16 },
  stop: { flexDirection: 'row', alignItems: 'stretch' },
  rail: { width: RAIL_W, alignItems: 'center', justifyContent: 'center' },
  railSeg: { position: 'absolute', width: 2.5, borderRadius: 1.5, left: RAIL_W / 2 - 1.25 },
  /* Halves rather than one full-height line, so the run can stop at a gem. */
  railTop: { top: 0, bottom: '50%' },
  railBottom: { top: '50%', bottom: 0 },
  gemLocked: { opacity: 0.34 },

  stopBody: {
    flex: 1,
    paddingVertical: 12,
    paddingLeft: 10,
    paddingRight: 12,
    minHeight: ROAD_GEM_H + 16,
    justifyContent: 'center',
  },
  stopBodyCurrent: {
    backgroundColor: GOLD_TINT,
    borderWidth: 0.5,
    borderColor: GOLD_HAIRLINE,
    borderRadius: 16,
  },
  stopBodyLocked: { opacity: 0.42 },
  stopHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stopNames: { flex: 1, paddingRight: 10 },
  stopName: { fontSize: 15.5, fontWeight: '700', letterSpacing: -0.3, color: colors.text },
  stopArena: { fontSize: 11.5, fontWeight: '500', color: colors.textQuaternary, marginTop: 1 },
  stopRight: { alignItems: 'flex-end' },
  stopThreshold: { fontSize: 15, fontWeight: '700', letterSpacing: -0.4, ...tabular },
  stopState: { fontSize: 10, fontWeight: '600', letterSpacing: 0.4, color: colors.textQuaternary, marginTop: 1 },
  stopTrack: {
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(0,0,0,0.45)',
    marginTop: 10,
    overflow: 'hidden',
  },
  stopFill: { height: 5, borderRadius: 2.5 },
  stopProgress: { ...type.chartLabel, ...tabular, color: colors.textChartLabel, marginTop: 6 },

  /* earn rates */
  earnRow: { paddingTop: 18 },
  earnHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  earnLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  earnLabel: { fontSize: 15.5, fontWeight: '600', letterSpacing: -0.2, color: colors.text },
  earnRate: { fontSize: 22, fontWeight: '700', letterSpacing: -0.7, ...tabular },
  earnTrack: {
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.controlAlt16,
    marginTop: 10,
    overflow: 'hidden',
  },
  earnFill: { height: 5, borderRadius: 2.5 },
  earnTotal: { ...type.chartLabel, ...tabular, color: colors.textChartLabel, marginTop: 6 },

  /* secondary stats */
  statPair: { flexDirection: 'row', paddingTop: 18, paddingBottom: 4 },
  stat: { flex: 1, gap: 2 },
  statLabel: { fontSize: 13.5, fontWeight: '400', color: colors.text },
  statValue: {
    fontSize: 26,
    fontWeight: '500',
    letterSpacing: -0.8,
    color: colors.textSecondary,
    ...tabular,
  },

  footnote: { ...type.bodySecondary, color: colors.textTertiary, marginTop: 22 },
});

export default TrophyRoadSheet;
