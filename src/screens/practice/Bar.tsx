/**
 * Bar — the thin inline progress bar the Practice screen uses everywhere a
 * completion percentage is subordinate to a label.
 *
 * The screen deliberately carries exactly one ring (the active track's) and
 * bars for everything else, so the eye has one focal point instead of two dozen
 * competing 40px circles. Same 800ms `progressBar` timing as §3.11's coverage
 * sheet, same `EASE.standard` curve.
 */
import React, { useEffect } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { EASE, clamp, colors, duration } from '@/theme';

export interface BarProps {
  /** 0..1 (clamped). */
  progress: number;
  color?: string;
  /** Unfilled track. Defaults to a 7% white hairline fill. */
  trackColor?: string;
  /** Bar thickness. Default 3 — thin on purpose. */
  height?: number;
  animate?: boolean;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}

export function Bar({
  progress,
  color = colors.accent,
  trackColor = 'rgba(255,255,255,0.07)',
  height = 3,
  animate = true,
  delay = 0,
  style,
}: BarProps) {
  const target = clamp(progress);
  const p = useSharedValue(animate ? 0 : target);

  useEffect(() => {
    p.value = withDelay(
      animate ? delay : 0,
      withTiming(target, {
        duration: animate ? duration.progressBar : 0,
        easing: Easing.bezier(...EASE.standard),
      }),
    );
  }, [target, animate, delay]);

  const fill = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));

  return (
    <View
      style={[
        s.track,
        { height, borderRadius: height / 2, backgroundColor: trackColor },
        style,
      ]}>
      <Animated.View
        style={[{ height, borderRadius: height / 2, backgroundColor: color }, fill]}
      />
    </View>
  );
}

const s = StyleSheet.create({
  track: { width: '100%', overflow: 'hidden' },
});

export default Bar;
