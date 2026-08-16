import { useCallback, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgGradient,
  Path,
  RadialGradient as SvgRadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

/* ------------------------------------------------------------------ */
/* FINAL handoff spec: Clear-variant Liquid Glass bar + Glide lens.    */
/* Screen transitions are intentionally out of scope.                  */
/* ------------------------------------------------------------------ */

export const TABS = [
  { name: 'index', label: 'Summary', icon: 'summary' },
  { name: 'practice', label: 'Practice', icon: 'practice' },
  { name: 'crew', label: 'Crew', icon: 'crew' },
  { name: 'you', label: 'You', icon: 'you' },
] as const;

export type TabIconName = (typeof TABS)[number]['icon'];

/* Geometry — pill radius = container radius − inset (concentric rule). */
const BAR_H = 68;
const BAR_R = 34;
const INSET = 5;
const PILL_R = BAR_R - INSET;

/* Motion — Glide: one property, hard clean deceleration, zero overshoot. */
export const TRAVEL_MS = 460;
const TRAVEL_EASE = Easing.bezier(0.32, 0.72, 0, 1);
const SCALE_MS = 400;
const SCALE_EASE = Easing.bezier(0.34, 1.4, 0.64, 1);
const TINT_MS = 300;

const ACTIVE = '#FFFFFF';
const INACTIVE = 'rgba(255,255,255,0.62)';

/* ------------------------------------------------------------------ */
/* Icons — 24×24, stroke 2.1, round caps/joins, white.                 */
/* ------------------------------------------------------------------ */

export function TabIcon({
  name,
  color,
  size = 24,
}: {
  name: TabIconName;
  color: string;
  size?: number;
}) {
  const p = {
    stroke: color,
    strokeWidth: 2.1,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  switch (name) {
    case 'summary':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={8.5} {...p} strokeDasharray="42 12" />
        </Svg>
      );
    case 'practice':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M9 6.5 4 12l5 5.5" {...p} />
          <Path d="M15 6.5 20 12l-5 5.5" {...p} />
        </Svg>
      );
    case 'crew':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={9} cy={8.5} r={3.4} {...p} />
          <Path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" {...p} />
          <Circle cx={16.5} cy={9.5} r={2.7} {...p} />
          <Path d="M15.6 14.2c2.4.2 4.3 1.8 4.9 4.6" {...p} />
        </Svg>
      );
    case 'you':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={12} cy={8} r={3.8} {...p} />
          <Path d="M5 19.5c.8-3.8 3.6-6 7-6s6.2 2.2 7 6" {...p} />
        </Svg>
      );
  }
}

/* ------------------------------------------------------------------ */
/* One item                                                            */
/* ------------------------------------------------------------------ */

function TabItem({
  label,
  icon,
  focused,
  reduceMotion,
  increaseContrast,
  onPress,
  onLongPress,
}: {
  label: string;
  icon: TabIconName;
  focused: boolean;
  reduceMotion: boolean;
  increaseContrast: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const t = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    t.value = withTiming(focused ? 1 : 0, {
      duration: reduceMotion ? 150 : TINT_MS,
      easing: Easing.linear,
    });
  }, [focused, reduceMotion, t]);

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: reduceMotion
          ? 1
          : withTiming(focused ? 1.04 : 1, { duration: SCALE_MS, easing: SCALE_EASE }),
      },
    ],
  }));
  const activeStyle = useAnimatedStyle(() => ({ opacity: t.value }));
  const idleStyle = useAnimatedStyle(() => ({ opacity: 1 - t.value }));

  const inactive = increaseContrast ? '#FFFFFF' : INACTIVE;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      style={s.item}>
      <Animated.View style={[s.itemInner, scaleStyle]}>
        <View style={s.iconBox}>
          <Animated.View style={[s.abs, idleStyle]}>
            <TabIcon name={icon} color={inactive} />
          </Animated.View>
          <Animated.View style={[s.abs, activeStyle]}>
            <TabIcon name={icon} color={ACTIVE} />
          </Animated.View>
        </View>
        <View>
          <Animated.Text numberOfLines={1} style={[s.label, { color: inactive }, idleStyle]}>
            {label}
          </Animated.Text>
          <Animated.Text
            numberOfLines={1}
            style={[s.label, s.labelActive, s.labelAbs, activeStyle]}>
            {label}
          </Animated.Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Landing pulse — the Liquid Glass "interactive" illumination.        */
/* ------------------------------------------------------------------ */

function LandingPulse({
  slotW,
  x,
  pulse,
}: {
  slotW: number;
  x: SharedValue<number>;
  pulse: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ translateX: x.value }],
  }));
  const h = BAR_H - INSET * 2;
  return (
    <Animated.View pointerEvents="none" style={[s.pulse, { width: slotW }, style]}>
      <Svg width={slotW} height={h}>
        <Defs>
          <SvgRadialGradient id="pulse-g" cx="0.5" cy="0.6" rx="0.46" ry="0.4">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.5} />
            <Stop offset="0.72" stopColor="#FFFFFF" stopOpacity={0} />
          </SvgRadialGradient>
        </Defs>
        <Rect x={0} y={0} width={slotW} height={h} rx={PILL_R} fill="url(#pulse-g)" />
      </Svg>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Bar                                                                 */
/* ------------------------------------------------------------------ */

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const [increaseContrast, setIncreaseContrast] = useState(false);

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceTransparencyEnabled?.().then((v) => {
      if (live) setReduceTransparency(!!v);
    });
    AccessibilityInfo.isDarkerSystemColorsEnabled?.().then((v) => {
      if (live) setIncreaseContrast(!!v);
    });
    const subT = AccessibilityInfo.addEventListener?.('reduceTransparencyChanged', (v) =>
      setReduceTransparency(!!v),
    );
    const subC = AccessibilityInfo.addEventListener?.('darkerSystemColorsChanged', (v) =>
      setIncreaseContrast(!!v),
    );
    return () => {
      live = false;
      subT?.remove?.();
      subC?.remove?.();
    };
  }, []);

  const activeName = state.routes[state.index]?.name;
  const items = TABS.map((t) => ({
    ...t,
    route: state.routes.find((r) => r.name === t.name),
  })).filter(
    (t): t is (typeof TABS)[number] & { route: NonNullable<(typeof state.routes)[number]> } =>
      !!t.route,
  );
  const activeIndex = Math.max(0, items.findIndex((t) => t.name === activeName));

  const [barW, setBarW] = useState(0);
  const onBarLayout = useCallback((e: LayoutChangeEvent) => {
    setBarW(e.nativeEvent.layout.width);
  }, []);
  const slotW = barW > 0 ? (barW - INSET * 2) / items.length : 0;

  const x = useSharedValue(0);
  const pulse = useSharedValue(0);
  const settled = useSharedValue(false);

  useEffect(() => {
    if (slotW <= 0) return;
    const target = activeIndex * slotW;
    if (!settled.value || reduceMotion) {
      x.value = target; // first layout or Reduce Motion: jump, no pulse
      settled.value = true;
      return;
    }
    x.value = withTiming(target, { duration: TRAVEL_MS, easing: TRAVEL_EASE });
    // landing pulse fires when travel ends
    pulse.value = 0;
    pulse.value = withDelay(
      TRAVEL_MS,
      withSequence(
        withTiming(0.9, { duration: 60 }),
        withTiming(0, { duration: 450, easing: Easing.bezier(0.22, 1, 0.36, 1) }),
      ),
    );
  }, [activeIndex, slotW, reduceMotion, x, pulse, settled]);

  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  const contrastBorder = increaseContrast
    ? { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)' }
    : null;

  const inner = (
    <>
      {/* pill — flat, 2px-blur-equivalent solid per the RN perf note */}
      {slotW > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[s.pill, { width: slotW }, reduceTransparency && s.pillSolid, contrastBorder, pillStyle]}>
          <View style={s.pillHighlight} />
        </Animated.View>
      )}
      {slotW > 0 && !reduceMotion && <LandingPulse slotW={slotW} x={x} pulse={pulse} />}
      <View style={s.row}>
        {items.map((t) => {
          const focused = activeName === t.name;
          return (
            <TabItem
              key={t.name}
              label={t.label}
              icon={t.icon}
              focused={focused}
              reduceMotion={reduceMotion}
              increaseContrast={increaseContrast}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: t.route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(t.route.name as never);
                }
              }}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: t.route.key })}
            />
          );
        })}
      </View>
    </>
  );

  const bottom = insets.bottom > 0 ? insets.bottom + 6 : 22;

  return (
    <View style={[s.wrap, { bottom }]} pointerEvents="box-none">
      {/* mandatory dimming layer — part of the component, not page decor */}
      {reduceTransparency ? (
        <View pointerEvents="none" style={[s.dim, { bottom: -bottom }, s.dimSolid]} />
      ) : (
        <LinearGradient
          pointerEvents="none"
          colors={['transparent', 'rgba(0,0,0,0.28)', 'rgba(0,0,0,0.62)']}
          locations={[0, 0.45, 1]}
          style={[s.dim, { bottom: -bottom }]}
        />
      )}

      <View style={s.barBox} onLayout={onBarLayout}>
        {reduceTransparency ? (
          <View style={[s.bar, s.barSolid, contrastBorder]}>{inner}</View>
        ) : (
          <BlurView intensity={35} tint="light" style={[s.bar, contrastBorder]}>
            <View style={[StyleSheet.absoluteFill, s.barFill]} />
            {inner}
          </BlurView>
        )}
        {/* gradient rim — a masked ring, not a border: SVG stroke with a
            vertical bright-top → faint → soft-bottom gradient */}
        {!reduceTransparency && !increaseContrast && barW > 0 && (
          <Svg
            pointerEvents="none"
            width={barW}
            height={BAR_H}
            style={StyleSheet.absoluteFill}>
            <Defs>
              <SvgGradient id="bar-rim" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.6} />
                <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity={0.08} />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.28} />
              </SvgGradient>
            </Defs>
            <Rect
              x={0.6}
              y={0.6}
              width={barW - 1.2}
              height={BAR_H - 1.2}
              rx={BAR_R - 0.6}
              fill="none"
              stroke="url(#bar-rim)"
              strokeWidth={1.2}
            />
          </Svg>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16 },
  dim: {
    position: 'absolute',
    left: -16,
    right: -16,
    height: 210,
  },
  dimSolid: { backgroundColor: 'rgba(0,0,0,0.5)' },
  barBox: { borderRadius: BAR_R },
  bar: {
    height: BAR_H,
    borderRadius: BAR_R,
    overflow: 'hidden',
    padding: INSET,
  },
  barFill: { backgroundColor: 'rgba(255,255,255,0.10)' },
  barSolid: { backgroundColor: '#2A2A2E' },
  pill: {
    position: 'absolute',
    top: INSET,
    bottom: INSET,
    left: INSET,
    borderRadius: PILL_R,
    backgroundColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
  },
  pillSolid: { backgroundColor: '#3D3D42' },
  pillHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.3,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  pulse: {
    position: 'absolute',
    top: INSET,
    bottom: INSET,
    left: INSET,
    borderRadius: PILL_R,
    overflow: 'hidden',
  },
  row: { flex: 1, flexDirection: 'row' },
  item: { flex: 1 },
  itemInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  iconBox: { width: 24, height: 24 },
  abs: { ...StyleSheet.absoluteFillObject },
  label: {
    fontSize: 10,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  labelActive: { color: ACTIVE },
  labelAbs: { position: 'absolute', left: 0, right: 0, textAlign: 'center' },
});

export default TabBar;
