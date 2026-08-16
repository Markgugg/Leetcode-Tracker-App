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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
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
import { colors } from '@/theme';

/* ------------------------------------------------------------------ */
/* Spec: "Tab bar — implementation spec (specimen F)".                 */
/* The bar is the boring part; the screen cross-fade lives in          */
/* app/(tabs)/_layout.tsx and shares TRAVEL_MS with the pill.          */
/* ------------------------------------------------------------------ */

export const TABS = [
  { name: 'index', label: 'Summary', icon: 'summary' },
  { name: 'practice', label: 'Practice', icon: 'practice' },
  { name: 'crew', label: 'Crew', icon: 'crew' },
  { name: 'you', label: 'You', icon: 'you' },
] as const;

export type TabIconName = (typeof TABS)[number]['icon'];

/* Geometry — pill radius = container radius − padding. Keep that
   relationship if either number changes; concentric corners are why it
   reads as one object. */
const BAR_H = 64;
const BAR_R = 32;
const BAR_PAD = 5;
const PILL_R = BAR_R - BAR_PAD;

/* Motion — pill travel and the scene transition share this duration. */
export const TRAVEL_MS = 460;
const TRAVEL_EASE = Easing.bezier(0.32, 1.2, 0.4, 1); // very slight overshoot
const SCALE_MS = 400;
const SCALE_EASE = Easing.bezier(0.34, 1.4, 0.64, 1);
const TINT_MS = 300; // label/icon colour, linear

const ACTIVE = '#A594FF';
const INACTIVE = 'rgba(235,235,245,0.45)';

/* ------------------------------------------------------------------ */
/* Icons — 24×24, 2.1px stroke, round caps. No bespoke active glyphs.  */
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
  const p = { stroke: color, strokeWidth: 2.1, strokeLinecap: 'round' as const, fill: 'none' };
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
          <Path d="M9 6.5 4 12l5 5.5" {...p} strokeLinejoin="round" />
          <Path d="M15 6.5 20 12l-5 5.5" {...p} strokeLinejoin="round" />
        </Svg>
      );
    case 'crew':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={9} cy={8.5} r={3.4} {...p} />
          <Path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" {...p} strokeLinejoin="round" />
          <Circle cx={16.5} cy={9.5} r={2.7} {...p} />
          <Path d="M15.6 14.2c2.4.2 4.3 1.8 4.9 4.6" {...p} strokeLinejoin="round" />
        </Svg>
      );
    case 'you':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={12} cy={8} r={3.8} {...p} />
          <Path d="M5 19.5c.8-3.8 3.6-6 7-6s6.2 2.2 7 6" {...p} strokeLinejoin="round" />
        </Svg>
      );
  }
}

/* ------------------------------------------------------------------ */
/* One item — colour + 1.04 scale on the whole item, nothing else.     */
/* ------------------------------------------------------------------ */

function TabItem({
  label,
  icon,
  focused,
  reduceMotion,
  onPress,
  onLongPress,
}: {
  label: string;
  icon: TabIconName;
  focused: boolean;
  reduceMotion: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const t = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    t.value = withTiming(focused ? 1 : 0, { duration: TINT_MS, easing: Easing.linear });
  }, [focused, t]);

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
            <TabIcon name={icon} color={INACTIVE} />
          </Animated.View>
          <Animated.View style={[s.abs, activeStyle]}>
            <TabIcon name={icon} color={ACTIVE} />
          </Animated.View>
        </View>
        <View>
          <Animated.Text numberOfLines={1} style={[s.label, idleStyle]}>
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
/* Liquid lens — ported from the Figma community "Liquid Glass Button" */
/* ------------------------------------------------------------------ */

/**
 * Source construction (642×269 button, extracted via the Figma MCP):
 *   Lenses: 5 nested pills, backdrop-blur 50/25/12.5/5/0 at insets
 *           0 / 3 / 9 / 19 / 39 — strong blur at the rim, clear centre.
 *   Rim:    inset highlight ~30px white .5 from top-left, a ~10px inner
 *           ring #999, and a large soft inner glow (#F2F2F2 at .5).
 *   Sheen:  a small top-left radial, white at 10%, plus-lighter.
 * Scaled ×0.2 to pill size. RN has no inset box-shadow, so the ring and
 * highlight become an SVG stroke pair; the glow becomes a low-alpha fill.
 */
function LiquidLens({ width }: { width: number }) {
  const h = BAR_H - BAR_PAD * 2; // 54
  const r = PILL_R;
  return (
    <View style={[StyleSheet.absoluteFill, { borderRadius: r, overflow: 'hidden' }]}>
      {/* lens stack — blur graduating off toward the centre */}
      <BlurView intensity={50} tint="dark" style={[StyleSheet.absoluteFill, s.lensLayer]} />
      <BlurView
        intensity={25}
        tint="dark"
        style={[s.lensLayer, { position: 'absolute', top: 1, bottom: 1, left: 1, right: 1, borderRadius: r - 1 }]}
      />
      <BlurView
        intensity={12}
        tint="dark"
        style={[s.lensLayer, { position: 'absolute', top: 2.5, bottom: 2.5, left: 3, right: 3, borderRadius: r - 3 }]}
      />
      <BlurView
        intensity={5}
        tint="dark"
        style={[s.lensLayer, { position: 'absolute', top: 4.5, bottom: 4.5, left: 6, right: 6, borderRadius: r - 5 }]}
      />
      {/* soft inner glow (the 218px inset glow, scaled + tamed for dark UI) */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(242,242,242,0.055)' }]} />
      {/* rim: bright top-left highlight over a neutral inner ring */}
      <Svg width={width} height={h} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgGradient id="lens-rim" x1="0" y1="0" x2="0.9" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.5} />
            <Stop offset="0.45" stopColor="#B3B3B3" stopOpacity={0.16} />
            <Stop offset="1" stopColor="#B3B3B3" stopOpacity={0.28} />
          </SvgGradient>
        </Defs>
        <Rect
          x={1}
          y={1}
          width={width - 2}
          height={h - 2}
          rx={r - 1}
          fill="none"
          stroke="rgba(153,153,153,0.30)"
          strokeWidth={2}
        />
        <Rect
          x={0.75}
          y={0.75}
          width={width - 1.5}
          height={h - 1.5}
          rx={r - 0.75}
          fill="none"
          stroke="url(#lens-rim)"
          strokeWidth={1.2}
        />
        {/* top-left sheen — the 10% plus-lighter radial */}
        <Defs>
          <SvgRadialGradient id="lens-sheen" cx="0.22" cy="0.1" rx="0.5" ry="0.9">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.12} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </SvgRadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={h} rx={r} fill="url(#lens-sheen)" />
      </Svg>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Bar                                                                 */
/* ------------------------------------------------------------------ */

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [reduceTransparency, setReduceTransparency] = useState(false);

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceTransparencyEnabled?.().then((v) => {
      if (live) setReduceTransparency(!!v);
    });
    const sub = AccessibilityInfo.addEventListener?.('reduceTransparencyChanged', (v) =>
      setReduceTransparency(!!v),
    );
    return () => {
      live = false;
      sub?.remove?.();
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

  /* Pill: width = (barW − 2·pad) / count, travel = translateX only. */
  const [barW, setBarW] = useState(0);
  const onBarLayout = useCallback((e: LayoutChangeEvent) => {
    setBarW(e.nativeEvent.layout.width);
  }, []);
  const pillW = barW > 0 ? (barW - BAR_PAD * 2) / items.length : 0;

  const x = useSharedValue(0);
  const settled = useSharedValue(false);
  useEffect(() => {
    if (pillW <= 0) return;
    const target = activeIndex * pillW;
    if (!settled.value || reduceMotion) {
      x.value = target; // first layout, or Reduce Motion: jump, don't travel
      settled.value = true;
    } else {
      x.value = withTiming(target, { duration: TRAVEL_MS, easing: TRAVEL_EASE });
    }
  }, [activeIndex, pillW, reduceMotion, x, settled]);

  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  const inner = (
    <>
      {/* lens pill — the Figma "Liquid Glass Button" construction (node 1:295),
          scaled from its 269px button to our 54px pill. The illusion is a
          stack of concentric layers whose backdrop-blur weakens from the rim
          inward, so the edge smears the background while the centre stays
          almost clear — that gradient of blur is what reads as refraction. */}
      {pillW > 0 && (
        <Animated.View pointerEvents="none" style={[s.pill, { width: pillW }, pillStyle]}>
          <LiquidLens width={pillW} />
        </Animated.View>
      )}
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

  return (
    <View
      style={[s.wrap, { bottom: insets.bottom > 0 ? insets.bottom + 4 : 20 }]}
      pointerEvents="box-none">
      <View style={s.shadow} onLayout={onBarLayout}>
        {reduceTransparency ? (
          <View style={[s.bar, s.barSolid]}>{inner}</View>
        ) : (
          <BlurView intensity={60} tint="dark" style={s.bar}>
            <View style={[StyleSheet.absoluteFill, s.barFill]} />
            {inner}
          </BlurView>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16 },
  shadow: {
    borderRadius: BAR_R,
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  bar: {
    height: BAR_H,
    borderRadius: BAR_R,
    overflow: 'hidden',
    padding: BAR_PAD,
  },
  barFill: { backgroundColor: 'rgba(28,28,30,0.62)' },
  barSolid: { backgroundColor: '#1C1C1E' },
  pill: {
    position: 'absolute',
    top: BAR_PAD,
    bottom: BAR_PAD,
    left: BAR_PAD,
    borderRadius: PILL_R,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  lensLayer: { borderRadius: PILL_R, backgroundColor: 'rgba(255,255,255,0.01)', overflow: 'hidden' },
  row: { flex: 1, flexDirection: 'row' },
  item: { flex: 1 },
  itemInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  iconBox: { width: 24, height: 24 },
  abs: { ...StyleSheet.absoluteFillObject },
  label: { fontSize: 10, fontWeight: '600', color: INACTIVE },
  labelActive: { color: ACTIVE },
  labelAbs: { position: 'absolute', left: 0, right: 0, textAlign: 'center' },
});

export default TabBar;
