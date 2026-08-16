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
import Svg, { Circle, Path } from 'react-native-svg';
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
      {/* lens pill — flat grey, no rim, no bloom, no blur of its own */}
      {pillW > 0 && (
        <Animated.View pointerEvents="none" style={[s.pill, { width: pillW }, pillStyle]} />
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
    backgroundColor: 'rgba(120,120,128,0.34)',
  },
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
