import React, { useCallback, useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { EASE, blur, colors, radius, type } from '@/theme';

/* ------------------------------------------------------------------ */
/* Icons — the prototype's hand-authored paths (§3.10)                  */
/* ------------------------------------------------------------------ */

export type TabIconName = 'summary' | 'practice' | 'crew' | 'you';

export function TabIcon({ name, color, size = 24 }: { name: TabIconName; color: string; size?: number }) {
  if (name === 'summary') {
    // a single ring arc — stroke-dasharray 130 145 on r 23 in a 60 viewBox
    return (
      <Svg width={size} height={size} viewBox="0 0 60 60">
        <Circle
          cx={30}
          cy={30}
          r={23}
          stroke={color}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray="130 145"
          fill="none"
          transform="rotate(-90 30 30)"
        />
      </Svg>
    );
  }

  if (name === 'practice') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M9 6.5 4 12l5 5.5"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <Path
          d="M15 6.5 20 12l-5 5.5"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    );
  }

  if (name === 'crew') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx={16.8} cy={8.2} r={2.7} fill={color} />
        <Path
          d="M14.2 14.7c.8-.2 1.7-.3 2.6-.3 3.3 0 5.7 1.9 5.7 4.6v.7h-4.9c-.2-2-1.4-3.8-3.4-5z"
          fill={color}
        />
        <Circle cx={9.4} cy={8.8} r={3.4} fill={color} />
        <Path d="M2.2 20c0-3.5 3.2-5.8 7.2-5.8s7.2 2.3 7.2 5.8z" fill={color} />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={8} r={3.7} fill={color} />
      <Path d="M4.3 20c0-3.9 3.5-6.3 7.7-6.3s7.7 2.4 7.7 6.3z" fill={color} />
    </Svg>
  );
}

/* ------------------------------------------------------------------ */
/* Tab list                                                            */
/* ------------------------------------------------------------------ */

/** Route name → label + icon. Anything not listed here is not shown. */
export const TABS: { name: string; label: string; icon: TabIconName }[] = [
  { name: 'index', label: 'Summary', icon: 'summary' },
  { name: 'practice', label: 'Practice', icon: 'practice' },
  { name: 'crew', label: 'Crew', icon: 'crew' },
  { name: 'you', label: 'You', icon: 'you' },
];

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

const BAR_H = 64;
const BAR_PAD = 5;
const ITEM_H = BAR_H - BAR_PAD * 2; // 54
/** The lens is wider and taller than the item, and rides above the bar. */
const LENS_GROW_X = 10;
const LENS_H = 62;
const LENS_RISE = 8; // how far the lens lifts above the bar's top edge
const LENS_R = 26;

/** Spring with a touch of overshoot — the pill "settles" like liquid. */
const PILL_SPRING = {
  damping: 17,
  stiffness: 210,
  mass: 0.9,
  overshootClamping: false,
} as const;

const XFADE = { duration: 300, easing: Easing.bezier(...EASE.standard) };

/* ------------------------------------------------------------------ */
/* The moving lens                                                     */
/* ------------------------------------------------------------------ */

function Lens({ x, w }: { x: SharedValue<number>; w: number }) {
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[s.lens, { width: w, height: LENS_H, top: -LENS_RISE }, style]}>
      {/* faint iridescent 1px stroke — a gradient shell with a blurred core */}
      <LinearGradient
        colors={[
          'rgba(165,148,255,0.55)',
          'rgba(255,255,255,0.30)',
          'rgba(0,211,242,0.28)',
          'rgba(123,97,255,0.40)',
        ]}
        locations={[0, 0.35, 0.7, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={s.lensShell}>
        <BlurView intensity={90} tint="dark" style={s.lensCore}>
          <View style={s.lensSheen} />
          {/* top-edge highlight, as if light catches the raised glass */}
          <LinearGradient
            colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']}
            style={s.lensGloss}
            pointerEvents="none"
          />
        </BlurView>
      </LinearGradient>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* One item                                                            */
/* ------------------------------------------------------------------ */

function TabItem({
  label,
  icon,
  focused,
  onPress,
  onLongPress,
}: {
  label: string;
  icon: TabIconName;
  focused: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const t = useSharedValue(focused ? 1 : 0);
  const press = useSharedValue(0);

  useEffect(() => {
    t.value = withTiming(focused ? 1 : 0, XFADE);
  }, [focused, t]);

  // icon: scales to 1.15 and drops to the lens's optical centre as it activates
  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: (1 + t.value * 0.15) * (1 - press.value * 0.06) },
      { translateY: t.value * 6 },
    ],
  }));
  const activeIcon = useAnimatedStyle(() => ({ opacity: t.value }));
  const idleIcon = useAnimatedStyle(() => ({ opacity: (1 - t.value) * (1 - press.value * 0.4) }));
  // the label belongs to the resting state — it fades out under the lens
  const labelStyle = useAnimatedStyle(() => ({
    opacity: (1 - t.value) * (1 - press.value * 0.4),
    transform: [{ translateY: t.value * 4 }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => {
        press.value = withTiming(1, { duration: 90 });
      }}
      onPressOut={() => {
        press.value = withTiming(0, { duration: 180 });
      }}
      style={s.itemPress}>
      <View style={s.item}>
        <View style={s.iconBox}>
          <Animated.View style={[s.iconLayer, iconStyle]}>
            {/* two stacked icons crossfade so the tint animates, not snaps */}
            <Animated.View style={[s.iconAbs, idleIcon]}>
              <TabIcon name={icon} color={colors.textTertiary} size={24} />
            </Animated.View>
            <Animated.View style={[s.iconAbs, activeIcon]}>
              <TabIcon name={icon} color={colors.accentText} size={24} />
            </Animated.View>
          </Animated.View>
        </View>
        <Animated.Text numberOfLines={1} style={[s.label, labelStyle]}>
          {label}
        </Animated.Text>
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Bar                                                                 */
/* ------------------------------------------------------------------ */

/**
 * The floating glass tab bar (§3.10). Pass to expo-router's <Tabs> as
 * `tabBar={(props) => <TabBar {...props} />}`.
 *
 * It renders only the routes listed in TABS, in that order, so leftover
 * route files never leak into the bar and no `href: null` is needed.
 *
 * A single raised BlurView lens sits behind the active icon and springs
 * horizontally to whichever tab you pick, iOS-26 style.
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const activeName = state.routes[state.index]?.name;

  const items = TABS.map((t) => ({ ...t, route: state.routes.find((r) => r.name === t.name) })).filter(
    (t): t is (typeof TABS)[number] & { route: NonNullable<(typeof state.routes)[number]> } => !!t.route,
  );

  const activeIndex = Math.max(
    0,
    items.findIndex((t) => t.name === activeName),
  );

  const [barW, setBarW] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => setBarW(e.nativeEvent.layout.width), []);

  const count = items.length || 1;
  const itemW = barW > 0 ? (barW - BAR_PAD * 2) / count : 0;
  const lensW = itemW > 0 ? itemW + LENS_GROW_X : 0;

  const x = useSharedValue(0);
  const settled = useSharedValue(false);

  useEffect(() => {
    if (itemW <= 0) return;
    const target = BAR_PAD + activeIndex * itemW - LENS_GROW_X / 2;
    if (!settled.value) {
      // first measurement: place it, don't fly it in from the left edge
      x.value = target;
      settled.value = true;
    } else {
      x.value = withSpring(target, PILL_SPRING);
    }
  }, [activeIndex, itemW, x, settled]);

  return (
    <View
      style={[s.wrap, { bottom: insets.bottom > 0 ? insets.bottom + 6 : 22 }]}
      pointerEvents="box-none">
      <View style={s.stack} onLayout={onLayout} pointerEvents="box-none">
        {/* 1 — the bar's own glass, clipped to its radius */}
        <BlurView intensity={blur.tabBar} tint="dark" style={s.blur}>
          <View style={s.barFill} />
        </BlurView>

        {/* 2 — the lens, unclipped so it can ride above the bar */}
        {lensW > 0 ? <Lens x={x} w={lensW} /> : null}

        {/* 3 — icons and labels, above the lens */}
        <View style={s.row} pointerEvents="box-none">
          {items.map((t) => {
            const focused = activeName === t.name;
            return (
              <TabItem
                key={t.name}
                label={t.label}
                icon={t.icon}
                focused={focused}
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
                onLongPress={() =>
                  navigation.emit({ type: 'tabLongPress', target: t.route.key })
                }
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, paddingTop: LENS_RISE + 6 },
  stack: { height: BAR_H },

  blur: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.tabBar,
    overflow: 'hidden',
  },
  barFill: {
    flex: 1,
    backgroundColor: colors.tabBar,
    borderWidth: 0.5,
    borderColor: colors.borderTabBar,
    borderRadius: radius.tabBar,
  },

  /* lens ------------------------------------------------------------ */
  lens: {
    position: 'absolute',
    left: 0,
    borderRadius: LENS_R,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10,
  },
  lensShell: {
    flex: 1,
    borderRadius: LENS_R,
    padding: 1, // the 1px iridescent stroke
  },
  lensCore: {
    flex: 1,
    borderRadius: LENS_R - 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(120,120,128,0.30)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.30)',
  },
  lensSheen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  lensGloss: { position: 'absolute', left: 0, right: 0, top: 0, height: LENS_H * 0.45 },

  /* items ------------------------------------------------------------ */
  row: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    padding: BAR_PAD,
  },
  itemPress: { flex: 1 },
  item: {
    flex: 1,
    height: ITEM_H,
    borderRadius: radius.tabItem,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  iconBox: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  iconLayer: { width: 24, height: 24 },
  iconAbs: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  label: { ...type.tabLabel, color: colors.textTertiary },
});

export default TabBar;
