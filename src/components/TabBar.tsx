import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { blur, colors, duration, radius } from '@/theme';

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
  useEffect(() => {
    t.value = withTiming(focused ? 1 : 0, { duration: duration.tabPill });
  }, [focused]);

  const pillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      t.value,
      [0, 1],
      ['rgba(120,120,128,0)', colors.controlSelected],
    ),
  }));

  const tint = focused ? colors.accentText : colors.textTertiary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      style={s.itemPress}>
      <Animated.View style={[s.item, pillStyle]}>
        <TabIcon name={icon} color={tint} size={24} />
        <Text style={[s.label, { color: tint }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

/**
 * The floating glass tab bar (§3.10). Pass to expo-router's <Tabs> as
 * `tabBar={(props) => <TabBar {...props} />}`.
 *
 * It renders only the routes listed in TABS, in that order, so leftover
 * route files never leak into the bar and no `href: null` is needed.
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const activeName = state.routes[state.index]?.name;

  const items = TABS.map((t) => ({ ...t, route: state.routes.find((r) => r.name === t.name) })).filter(
    (t): t is (typeof TABS)[number] & { route: NonNullable<(typeof state.routes)[number]> } => !!t.route,
  );

  return (
    <View
      style={[s.wrap, { bottom: insets.bottom > 0 ? insets.bottom + 6 : 22 }]}
      pointerEvents="box-none">
      <BlurView intensity={blur.tabBar} tint="dark" style={s.blur}>
        <View style={s.fill}>
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
      </BlurView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16 },
  blur: { borderRadius: radius.tabBar, overflow: 'hidden' },
  fill: {
    flexDirection: 'row',
    height: 64,
    padding: 5,
    backgroundColor: colors.tabBar,
    borderWidth: 0.5,
    borderColor: colors.borderTabBar,
    borderRadius: radius.tabBar,
  },
  itemPress: { flex: 1 },
  item: {
    flex: 1,
    height: 54,
    borderRadius: radius.tabItem,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  label: { fontSize: 10, fontWeight: '600' },
});

export default TabBar;
