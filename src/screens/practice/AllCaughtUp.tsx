/**
 * "All caught up" — the terminal state of every problem source.
 *
 * The old behaviour was an absence: `track.upNext.length ? <card/> : null`, so
 * finishing a track made the UP NEXT card silently vanish and Practice looked
 * broken rather than finished. A completed list is an achievement and the one
 * moment the app should ask for the next commitment, so it gets a designed
 * state instead of a hole: the `pop` checkmark from §1 (420ms, scale
 * .6 → 1.12 → 1), a congratulations line, and a single pill that opens the
 * pack picker.
 *
 * It is deliberately source-agnostic — built-in track, imported LeetCode pack,
 * bundled NeetCode pack, or a topic — because all four can run out.
 */
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { GlassCard } from '@/components/GlassCard';
import { PillButton } from '@/components/PillButton';
import { EASE, colors, duration, radius, type } from '@/theme';

export interface AllCaughtUpProps {
  /** Micro-label above the headline. Default "ALL CAUGHT UP". */
  label?: string;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Checkmark tint. Defaults to the lime difficulty ring color. */
  tint?: string;
  style?: object;
}

export function AllCaughtUp({
  label = 'All caught up',
  title,
  message,
  actionLabel,
  onAction,
  tint = colors.difficulty,
  style,
}: AllCaughtUpProps) {
  const p = useSharedValue(0);

  useEffect(() => {
    // §1 `pop`: 420ms, scale .6 → 1.12 → 1 + opacity.
    p.value = 0;
    p.value = withSequence(
      withTiming(1.12, {
        duration: Math.round(duration.pop * 0.62),
        easing: Easing.bezier(...EASE.standard),
      }),
      withTiming(1, {
        duration: Math.round(duration.pop * 0.38),
        easing: Easing.bezier(...EASE.standard),
      }),
    );
  }, []);

  const markStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value / 0.6),
    transform: [{ scale: 0.6 + p.value * 0.4 }],
  }));

  return (
    <GlassCard radius={radius.cardLarge} style={style}>
      <View style={s.head}>
        <View style={[s.dot, { backgroundColor: tint }]} />
        <Text style={s.label}>{label.toUpperCase()}</Text>
      </View>

      <Animated.View
        style={[
          s.mark,
          { backgroundColor: withAlpha(tint, 0.14), borderColor: withAlpha(tint, 0.42) },
          markStyle,
        ]}>
        <Ionicons name="checkmark" size={30} color={tint} />
      </Animated.View>

      <Text style={s.title}>{title}</Text>
      <Text style={s.message}>{message}</Text>

      {onAction && actionLabel ? (
        <PillButton label={actionLabel} onPress={onAction} variant="accent" style={s.button} />
      ) : null}
    </GlassCard>
  );
}

/** `#A2F73D` + .14 → `rgba(162,247,61,0.14)`. Hex in, rgba out. */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { ...type.microLabel, color: colors.textQuaternary },

  mark: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 0.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },

  title: { ...type.problemTitle, color: colors.text, marginTop: 16 },
  message: { ...type.bodySecondary, color: colors.textSecondary, marginTop: 8 },

  button: { marginTop: 18 },
});

export default AllCaughtUp;
