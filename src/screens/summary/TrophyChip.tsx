/**
 * TrophyChip — the compact header chip from trophy-explorer variant 3
 * ("Arena card"), the variant the owner picked.
 *
 * Prototype source (design_handoff/trophy-explorer.html, V3().chip):
 *   <span class="chip" style="padding:4px 11px 4px 6px; gap:6px;
 *        background:linear-gradient(150deg, rgba(245,200,66,.24), rgba(245,200,66,.06));
 *        border-color:rgba(245,200,66,.34)">
 *     <svg width="16" …>{trophy('gold')}</svg>
 *     <span class="tnum" style="color:#FFEEB0; font-weight:700; font-size:12.5px">7,240</span>
 *   </span>
 *
 * It sits left of the 38px avatar chip in the Summary header and is tappable
 * straight through to the You tab. Height is pinned to 38 so the two chips
 * share a baseline and the large title keeps its air.
 */
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';

import { EASE, duration, tabular } from '@/theme';

/* ------------------------------------------------------------------ */
/* Gold trophy glyph — trophy('gold') from the explorer, one-to-one     */
/* ------------------------------------------------------------------ */

const CUP = 'M30,20 h40 v17 a20,20 0 0 1 -40,0 Z';
const HANDLE_L = 'M30,24 q-12,0 -12,9 q0,8 11,8';
const HANDLE_R = 'M70,24 q12,0 12,9 q0,8 -11,8';
const STEM = 'M46,57 h8 v11 h-8 Z';
const BASE = 'M36,68 h28 v7 h-28 Z';
const SHEEN = 'M35,24 q-1,17 6,26 q-12,-8 -11,-26 Z';

export function GoldTrophy({ size = 16 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <SvgGradient id="tcBody" x1="0.15" y1="0" x2="0.8" y2="1">
          <Stop offset="0" stopColor="#FFF6D0" />
          <Stop offset="0.42" stopColor="#F5C842" />
          <Stop offset="0.72" stopColor="#E0A824" />
          <Stop offset="1" stopColor="#A9741A" />
        </SvgGradient>
        <SvgGradient id="tcTrim" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFBE8" />
          <Stop offset="1" stopColor="#D9A32C" />
        </SvgGradient>
      </Defs>
      <Path d={HANDLE_L} fill="none" stroke="url(#tcTrim)" strokeWidth={7} strokeLinecap="round" />
      <Path d={HANDLE_R} fill="none" stroke="url(#tcTrim)" strokeWidth={7} strokeLinecap="round" />
      <Path d={CUP} fill="url(#tcBody)" />
      <Path d={SHEEN} fill="#FFFFFF" opacity={0.38} />
      <Rect x={26} y={16} width={48} height={8} rx={4} fill="url(#tcTrim)" />
      <Path d={STEM} fill="url(#tcBody)" />
      <Path d={BASE} fill="url(#tcTrim)" />
      <Rect x={29} y={74} width={42} height={10} rx={4} fill="url(#tcBody)" />
      <Rect x={29} y={74} width={42} height={3.5} rx={1.8} fill="#FFFFFF" opacity={0.35} />
    </Svg>
  );
}

/* ------------------------------------------------------------------ */
/* Chip                                                                */
/* ------------------------------------------------------------------ */

/** 7240 → "7,240". Hand-rolled so it does not depend on Intl in Hermes. */
export function formatTrophies(n: number) {
  const v = Math.max(0, Math.round(n));
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export interface TrophyChipProps {
  /** Derived lifetime trophy total. `null` while it is still being computed. */
  trophies: number | null;
  onPress: () => void;
  /** Accessibility label suffix, e.g. the league name. Optional. */
  leagueName?: string | null;
}

const GOLD_FILL: readonly [string, string] = [
  'rgba(245,200,66,0.24)',
  'rgba(245,200,66,0.06)',
];

export function TrophyChip({ trophies, onPress, leagueName }: TrophyChipProps) {
  const ready = trophies != null;

  /* Fades in once the total resolves so the header never shows a 0 that then
     jumps to the real number. */
  const appear = useSharedValue(0);
  useEffect(() => {
    appear.value = withTiming(ready ? 1 : 0, {
      duration: duration.tipIn,
      easing: Easing.bezier(...EASE.standard),
    });
  }, [ready]);
  const appearStyle = useAnimatedStyle(() => ({
    opacity: appear.value,
    transform: [{ scale: 0.94 + appear.value * 0.06 }],
  }));

  if (!ready) return <View style={s.placeholder} />;

  return (
    <Animated.View style={appearStyle}>
      <Pressable
        onPress={onPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={
          leagueName
            ? `${formatTrophies(trophies)} trophies · ${leagueName}`
            : `${formatTrophies(trophies)} trophies`
        }
        style={({ pressed: p }) => [s.chip, p && { opacity: 0.55, transform: [{ scale: 0.97 }] }]}>
        <LinearGradient
          colors={GOLD_FILL}
          /* 150deg in CSS ≈ top-left → bottom-right, weighted down. */
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={s.fill}
        />
        <GoldTrophy size={16} />
        <Text style={s.count} numberOfLines={1}>
          {formatTrophies(trophies)}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/* Chip height matches the 38px avatar chip exactly (§ header). */
export const TROPHY_CHIP_HEIGHT = 38;

const s = StyleSheet.create({
  placeholder: { width: 0, height: TROPHY_CHIP_HEIGHT },
  chip: {
    height: TROPHY_CHIP_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 10,
    paddingRight: 13,
    borderRadius: 999,
    borderWidth: 0.5,
    borderColor: 'rgba(245,200,66,0.34)',
    overflow: 'hidden',
  },
  fill: { ...StyleSheet.absoluteFillObject },
  count: {
    ...tabular,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: '#FFEEB0',
  },
});

export default TrophyChip;
