import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { GlassCard } from '@/components/GlassCard';
import { colors, pressed, radius, type } from '@/theme';
import { MicroLabel } from './parts';
import type { NextUpPick } from './useSummaryData';

const DIFF: Record<string, { label: string; color: string; bg: string; border: string }> = {
  easy: { label: 'Easy', color: colors.easy, bg: colors.easyBg, border: colors.easyBorder },
  medium: { label: 'Medium', color: colors.medium, bg: colors.mediumBg, border: colors.mediumBorder },
  hard: { label: 'Hard', color: colors.hard, bg: colors.hardBg, border: colors.hardBorder },
};

export interface NextUpCardProps {
  pick: NextUpPick | null;
  onStart: () => void;
  onReroll: () => void;
  /**
   * Where to send someone with nothing left to solve. Defaults to the Practice
   * tab, where packs are picked and imported.
   */
  onBrowse?: () => void;
}

/**
 * §3.6.5 — micro-label with a `#FFD426` dot; problem title 22/700/-0.7; three
 * chips (difficulty tinted, then tag and estimate on `rgba(120,120,128,.26)`);
 * a one-line reason; then a full-width `#7B61FF` "Start" pill (48px, radius 24)
 * beside a 48px circular reroll button.
 */
export function NextUpCard({ pick, onStart, onReroll, onBrowse }: NextUpCardProps) {
  const router = useRouter();

  if (!pick) {
    /*
     * The recommendation ranks the whole seeded catalog, so an empty pick means
     * there is nothing left in *that* catalog — which is not the same as "you
     * have finished your pack", and the copy must not claim it is. The card
     * offers the one action that changes the answer: go pick or import a list.
     */
    return (
      <GlassCard>
        <MicroLabel text="Next up · picked for you" dot={colors.easy} />

        <View style={s.emptyHead}>
          <View style={s.emptyIcon}>
            <Svg width={22} height={22} viewBox="0 0 24 24">
              <Path
                d="M4.5 12.5 10 18 19.5 6.5"
                stroke={colors.easy}
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </Svg>
          </View>
          <Text style={s.emptyTitle}>All caught up</Text>
        </View>

        <Text style={s.reason}>
          Every problem the catalog can track is already solved. Add a pack in Practice — a
          LeetCode list, a NeetCode set, or your own paste — to line up what&apos;s next.
        </Text>

        <View style={s.actions}>
          <Pressable
            onPress={onBrowse ?? (() => router.push('/practice'))}
            accessibilityRole="button"
            style={({ pressed: p }) => [s.start, p && pressed]}>
            <Text style={s.startText}>Browse packs</Text>
          </Pressable>
        </View>
      </GlassCard>
    );
  }

  const d = DIFF[pick.problem.difficulty] ?? DIFF.medium;

  return (
    <GlassCard>
      <MicroLabel text="Next up · picked for you" dot={colors.medium} />

      <Text style={s.title} numberOfLines={2}>
        {pick.problem.title}
      </Text>

      <View style={s.chips}>
        <View style={[s.chip, { backgroundColor: d.bg, borderColor: d.border }]}>
          <Text style={[s.chipText, { color: d.color }]}>{d.label}</Text>
        </View>
        <View style={s.chipPlain}>
          <Text style={s.chipPlainText}>{pick.tag}</Text>
        </View>
        <View style={s.chipPlain}>
          <Text style={s.chipPlainText}>~{pick.estimate} min</Text>
        </View>
      </View>

      <Text style={s.reason}>{pick.reason}</Text>

      <View style={s.actions}>
        <Pressable
          onPress={onStart}
          style={({ pressed: p }) => [s.start, p && pressed]}>
          <Text style={s.startText}>Start</Text>
        </Pressable>

        <Pressable
          onPress={onReroll}
          accessibilityLabel="Pick another problem"
          style={({ pressed: p }) => [s.reroll, p && pressed]}>
          <Svg width={22} height={22} viewBox="0 0 24 24">
            <Path
              d="M20 12a8 8 0 1 1-2.34-5.66"
              stroke={colors.text}
              strokeWidth={2.2}
              strokeLinecap="round"
              fill="none"
            />
            <Path
              d="M20 3.5V8h-4.5"
              stroke={colors.text}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </Pressable>
      </View>
    </GlassCard>
  );
}

const s = StyleSheet.create({
  title: { ...type.problemTitle, color: colors.text, marginTop: 12 },
  emptyHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  emptyIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.easyBg,
    borderWidth: 0.5,
    borderColor: colors.easyBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { ...type.problemTitle, color: colors.text, flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.chip,
    borderWidth: 0.5,
  },
  chipText: { fontSize: 12.5, fontWeight: '700' },
  chipPlain: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.chip,
    backgroundColor: colors.controlAlt26,
  },
  chipPlainText: { fontSize: 12.5, fontWeight: '600', color: colors.textSecondary },
  reason: { ...type.bodySecondary, color: colors.textSecondary, marginTop: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  start: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startText: { ...type.buttonLabel, color: '#FFFFFF' },
  reroll: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.controlAlt30,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default NextUpCard;
