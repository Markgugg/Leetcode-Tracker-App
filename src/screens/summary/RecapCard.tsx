/**
 * The weekly recap card — the one surface in the app that leaves the app.
 *
 * It is a plain RN view tree (no `BlurView`, no `Animated` value it needs a
 * frame to settle): `react-native-view-shot` snapshots the *rendered* view, so
 * anything that depends on a backdrop or an in-flight animation would come out
 * of the capture looking different from the preview. Glass is faked here the
 * way an exported image has to fake it — an opaque black ground, two ambient
 * washes from `ambientGlows`, and translucent panels on top.
 *
 * Every dimension is derived from `width` through `k`, so the same component
 * renders as a 300px preview and as a 1080px PNG with identical proportions.
 * The frame is 9:16 — story-shareable, and the aspect every social surface
 * crops least.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ring } from '@/components/Ring';
import { TROPHY_GOLD } from '@/lib/trophies';
import { ambientGlows, colors, difficultyColor, heatmapRamp, radius, tabular } from '@/theme';
import type { WeekRecap } from './useRecapData';

/** Design width every number below is expressed in. */
const BASE = 360;
/** Story aspect. */
const ASPECT = 16 / 9;

export interface RecapCardProps {
  recap: WeekRecap;
  /** Rendered width in px. Height follows at 9:16. */
  width: number;
  /** Name under the headline. Omitted when the profile has none yet. */
  displayName?: string;
}

export function RecapCard({ recap, width, displayName }: RecapCardProps) {
  const k = width / BASE;
  const u = (n: number) => n * k;
  const height = width * ASPECT;

  const { split } = recap;
  const splitTotal = Math.max(1, split.easy + split.medium + split.hard);
  const ringLabel =
    recap.ringsClosed === 3
      ? 'All three rings closed'
      : `${recap.ringsClosed} of 3 rings closed`;

  const peak = Math.max(1, ...recap.days.map((d) => d.solves));
  const barMax = u(40);

  return (
    <View
      style={[
        s.root,
        { width, height, borderRadius: u(radius.cardLarge), padding: u(22) },
      ]}>
      {/* ---- ambient wash — the same three glows the app sits on --------- */}
      <View style={[StyleSheet.absoluteFillObject, { borderRadius: u(radius.cardLarge), overflow: 'hidden' }]}>
        <LinearGradient
          colors={[heatmapRamp[1], 'transparent']}
          start={{ x: 0.9, y: 0 }}
          end={{ x: 0.1, y: 0.62 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={['transparent', ambientGlows[0].color]}
          start={{ x: 0.8, y: 0.45 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* ---- 1 · brand row ---------------------------------------------- */}
      <View style={s.row}>
        <View style={[s.row, { gap: u(7) }]}>
          <View
            style={{
              width: u(16),
              height: u(16),
              borderRadius: u(5),
              backgroundColor: colors.accent,
            }}
          />
          <Text style={{ fontSize: u(15), fontWeight: '700', letterSpacing: u(-0.3), color: colors.text }}>
            LeetAI
          </Text>
        </View>
        <Text
          style={{
            fontSize: u(11.5),
            fontWeight: '600',
            letterSpacing: u(0.6),
            color: colors.textTertiary,
          }}>
          {`WEEK ${recap.weekNumber}`.toUpperCase()}
        </Text>
      </View>

      {/* ---- 2 · headline ------------------------------------------------ */}
      <View>
        <Text
          style={{
            fontSize: u(11.5),
            fontWeight: '600',
            letterSpacing: u(0.6),
            color: colors.accentText,
          }}>
          {displayName ? `${displayName.split(' ')[0].toUpperCase()}'S RECAP` : 'WEEKLY RECAP'}
        </Text>
        <Text
          style={{
            fontSize: u(28),
            fontWeight: '800',
            letterSpacing: u(-1),
            color: colors.text,
            marginTop: u(3),
          }}>
          {recap.range}
        </Text>
      </View>

      {/* ---- 3 · the rings, with their legend beside them ----------------- */}
      <View style={[s.row, { gap: u(18) }]}>
        <Ring
          size={u(132)}
          animate={false}
          volume={recap.rings.volume}
          difficulty={recap.rings.difficulty}
          streak={recap.rings.streak}
        />
        <View style={{ flex: 1, gap: u(8) }}>
          {(
            [
              ['Volume', recap.rings.volume, 'SOLVED', colors.volume],
              ['Difficulty', recap.rings.difficulty, 'MED+', colors.difficulty],
              ['Streak', recap.rings.streak, 'DAYS', colors.streak],
            ] as const
          ).map(([name, m, unit, color]) => (
            <View key={name}>
              <Text style={{ fontSize: u(12.5), fontWeight: '400', color: colors.textRingLegend }}>
                {name}
              </Text>
              <View style={[s.row, { justifyContent: 'flex-start', alignItems: 'baseline', gap: u(4), marginTop: u(1) }]}>
                <Text style={[tabular, { fontSize: u(21), fontWeight: '600', letterSpacing: u(-0.6), color }]}>
                  {m.value}/{m.goal}
                </Text>
                <Text style={{ fontSize: u(10), fontWeight: '700', letterSpacing: u(0.2), color }}>
                  {unit}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <Text
        style={{
          fontSize: u(11.5),
          fontWeight: '600',
          letterSpacing: u(0.6),
          color: recap.ringsClosed === 3 ? colors.difficulty : colors.textTertiary,
        }}>
        {ringLabel.toUpperCase()}
      </Text>

      {/* ---- 4 · difficulty split ---------------------------------------- */}
      <View>
        <View style={[s.row, { alignItems: 'baseline' }]}>
          <Text style={{ fontSize: u(11.5), fontWeight: '600', letterSpacing: u(0.6), color: colors.textTertiary }}>
            DIFFICULTY SPLIT
          </Text>
          <Text style={[tabular, { fontSize: u(12.5), fontWeight: '600', color: colors.textSecondary }]}>
            {recap.volume} solves
          </Text>
        </View>

        <View
          style={{
            flexDirection: 'row',
            height: u(10),
            borderRadius: u(5),
            overflow: 'hidden',
            marginTop: u(9),
            backgroundColor: colors.controlAlt16,
            gap: recap.volume > 0 ? u(2) : 0,
          }}>
          {(['easy', 'medium', 'hard'] as const).map((d) =>
            split[d] > 0 ? (
              <View
                key={d}
                style={{
                  flex: split[d] / splitTotal,
                  backgroundColor: colors[d],
                  borderRadius: u(5),
                }}
              />
            ) : null,
          )}
        </View>

        <View style={[s.row, { justifyContent: 'flex-start', gap: u(16), marginTop: u(10) }]}>
          {(
            [
              ['Easy', split.easy, colors.easy],
              ['Medium', split.medium, colors.medium],
              ['Hard', split.hard, colors.hard],
            ] as const
          ).map(([label, n, color]) => (
            <View key={label} style={[s.row, { gap: u(6), justifyContent: 'flex-start' }]}>
              <View style={{ width: u(7), height: u(7), borderRadius: u(3.5), backgroundColor: color }} />
              <Text style={[tabular, { fontSize: u(12.5), fontWeight: '600', color: colors.textSecondary }]}>
                {label} {n}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* ---- 5 · the week, day by day ------------------------------------ */}
      <View>
        <View style={[s.row, { alignItems: 'flex-end', height: barMax, gap: u(6) }]}>
          {recap.days.map((d) => {
            const isBest = d.date === recap.bestDay?.date;
            return (
              <View key={d.date} style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
                <View
                  style={{
                    height: d.solves > 0 ? Math.max(u(4), (d.solves / peak) * barMax) : u(3),
                    borderRadius: u(4),
                    backgroundColor:
                      d.solves > 0
                        ? isBest
                          ? colors.accentText
                          : heatmapRamp[2]
                        : colors.controlAlt16,
                  }}
                />
              </View>
            );
          })}
        </View>
        <View style={[s.row, { marginTop: u(8), gap: u(6) }]}>
          {recap.days.map((d) => (
            <Text
              key={d.date}
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: u(10),
                fontWeight: '600',
                color: d.solves > 0 ? colors.textChartLabel : colors.textQuaternary,
              }}>
              {d.letter}
            </Text>
          ))}
        </View>
      </View>

      {/* ---- 6 · standouts ------------------------------------------------ */}
      <View style={{ gap: u(8) }}>
        <View style={[s.row, { gap: u(8) }]}>
          <Tile
            u={u}
            label="TROPHIES"
            value={recap.trophies > 0 ? `+${recap.trophies}` : `${recap.trophies}`}
            color={TROPHY_GOLD}
          />
          <Tile
            u={u}
            label="STREAK"
            value={
              recap.streakDays > 0
                ? `${recap.streakDays} day${recap.streakDays === 1 ? '' : 's'}`
                : 'None'
            }
            color={recap.streakDays > 0 ? colors.streakOrange : colors.textTertiary}
          />
          <Tile
            u={u}
            label="BEST DAY"
            value={recap.bestDay ? `${recap.bestDay.name.slice(0, 3)} · ${recap.bestDay.solves}` : '—'}
            color={colors.text}
          />
        </View>
        <Tile
          u={u}
          label="HARDEST SOLVE"
          value={recap.hardest ? recap.hardest.title : 'Nothing logged yet'}
          color={recap.hardest ? difficultyColor(recap.hardest.difficulty) : colors.textTertiary}
        />
      </View>

      {/* ---- 7 · footer --------------------------------------------------- */}
      <View style={[s.row, s.footer, { paddingTop: u(13) }]}>
        <Text style={{ fontSize: u(10.5), fontWeight: '600', letterSpacing: u(0.4), color: colors.textQuaternary }}>
          LEETAI · SOLVE TOGETHER
        </Text>
        <Text style={{ fontSize: u(10.5), fontWeight: '600', letterSpacing: u(0.4), color: colors.textQuaternary }}>
          {recap.topTopic ? `TOP TOPIC · ${recap.topTopic.label.toUpperCase()}` : `WEEK ${recap.weekNumber}`}
        </Text>
      </View>
    </View>
  );
}

/** One standout: a micro label over a single value, on a translucent panel. */
function Tile({
  u,
  label,
  value,
  color,
}: {
  u: (n: number) => number;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.cardSmall,
        borderWidth: 0.5,
        borderColor: colors.borderSmall,
        borderRadius: u(radius.chip + 5),
        paddingHorizontal: u(11),
        paddingVertical: u(9),
      }}>
      <Text style={{ fontSize: u(9.5), fontWeight: '600', letterSpacing: u(0.5), color: colors.textTertiary }}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={[
          tabular,
          {
            fontSize: u(15.5),
            fontWeight: '700',
            letterSpacing: u(-0.4),
            color,
            marginTop: u(3),
          },
        ]}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { backgroundColor: colors.bg, overflow: 'hidden', justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
});

export default RecapCard;
