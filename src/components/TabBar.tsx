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
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { EASE, blur, colors, radius, type } from '@/theme';

/**
 * Native iOS 26 Liquid Glass, when the OS gives it to us. The check is a
 * native-module read, so it's stable for the process lifetime — resolve it
 * once at module scope rather than on every render.
 *
 * When true we let the material do its own refraction, rim light, shadow and
 * adaptivity: hand-built sheen/rim/bloom layers on top of real glass read as
 * a smear, which is exactly what the blur-built pill got wrong. When false
 * (Android, iOS < 26) we fall back to the previous BlurView construction,
 * which is where those layers still earn their keep.
 */
const LIQUID = isLiquidGlassAvailable();

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
/**
 * The pill is INSET: it lives inside the bar's padding box, exactly the item
 * area's height, horizontally centred on the measured item. It never rises
 * above the bar's top edge — iOS Liquid Glass sits *in* its container.
 */
const PILL_H = ITEM_H;
const PILL_R = radius.tabItem;
/** Horizontal breathing room so the pill doesn't touch its neighbours. */
const PILL_INSET_X = 3;
/**
 * A whisper of the accent inside the native glass, so the selected tab is
 * identifiable at a glance without competing with the #A594FF icon + label.
 * Any heavier and the material stops reading as glass and starts reading as
 * a coloured chip.
 */
const PILL_TINT = 'rgba(165,148,255,0.12)';

/** Spring with a touch of overshoot — the pill "settles" like liquid. */
const PILL_SPRING = {
  damping: 17,
  stiffness: 210,
  mass: 0.9,
  overshootClamping: false,
} as const;

const XFADE = { duration: 300, easing: Easing.bezier(...EASE.standard) };

/* ------------------------------------------------------------------ */
/* The moving pill                                                     */
/* ------------------------------------------------------------------ */

/**
 * Native path: one GlassView. The material supplies the refraction, the rim
 * light, the specular travel as it moves and the adaptivity to whatever is
 * behind it — so this is deliberately a single element with nothing painted
 * on top. `isInteractive` is what makes it *feel* liquid: the glass flexes
 * and its highlight chases the touch.
 */
function PillGlass() {
  return (
    <GlassView
      glassEffectStyle="regular"
      isInteractive
      colorScheme="dark"
      tintColor={PILL_TINT}
      style={s.pillGlass}
    />
  );
}

/**
 * Fallback path (Android / iOS < 26): a dark BlurView core, a hairline
 * refractive edge, a 1px brighter rim along the very top, a faint sheen
 * falling from that rim — the hand-built approximation of the above.
 */
function PillFallback() {
  return (
    <BlurView intensity={60} tint="dark" style={s.pillCore}>
      {/* body tint — a touch of light trapped in the glass */}
      <View style={s.pillFill} />

      {/* inner sheen: light entering the top edge and falling off fast */}
      <LinearGradient
        colors={['rgba(255,255,255,0.13)', 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0)']}
        locations={[0, 0.45, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* a soft elliptical bloom in the upper half — the refractive core */}
      <View style={s.pillBloom} pointerEvents="none" />

      {/* 1px top rim: brightest at the crown, fading to nothing at the ends */}
      <LinearGradient
        colors={[
          'rgba(255,255,255,0)',
          'rgba(255,255,255,0.45)',
          'rgba(255,255,255,0.55)',
          'rgba(255,255,255,0.45)',
          'rgba(255,255,255,0)',
        ]}
        locations={[0, 0.22, 0.5, 0.78, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={s.pillRim}
        pointerEvents="none"
      />
    </BlurView>
  );
}

/**
 * The moving pill. The spring lives on this wrapper, never on the glass
 * element itself: the native view is driven by its own layout, and animating
 * a plain Animated.View around it keeps the material on the UI thread and
 * out of reach of prop-diffing.
 */
function Pill({
  x,
  w,
  ready,
}: {
  x: SharedValue<number>;
  w: SharedValue<number>;
  /** 0 until the first real measurement has been applied — see TabBar. */
  ready: SharedValue<number>;
}) {
  // Width travels with position on the same spring: items are equal width
  // today, but if one ever isn't, a snapping width under a springing x reads
  // as a glitch rather than as liquid.
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
    width: w.value,
    opacity: ready.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        s.pill,
        // the drop shadow is part of the fallback's fakery; real glass casts
        // its own and would double up.
        LIQUID ? null : s.pillShadow,
        { height: PILL_H, top: BAR_PAD },
        style,
      ]}>
      {LIQUID ? <PillGlass /> : <PillFallback />}
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
  onLayout,
}: {
  label: string;
  icon: TabIconName;
  focused: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  const t = useSharedValue(focused ? 1 : 0);
  const press = useSharedValue(0);

  useEffect(() => {
    t.value = withTiming(focused ? 1 : 0, XFADE);
  }, [focused, t]);

  // icon: a whisper of scale on activate, nothing else — it never moves off
  // the label, because icon + label stay together on every tab.
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: (1 + t.value * 0.08) * (1 - press.value * 0.06) }],
  }));
  const activeIcon = useAnimatedStyle(() => ({ opacity: t.value }));
  const idleIcon = useAnimatedStyle(() => ({ opacity: 1 - t.value }));
  // both labels are always rendered; only the tint crossfades.
  const activeLabel = useAnimatedStyle(() => ({ opacity: t.value }));
  const idleLabel = useAnimatedStyle(() => ({ opacity: 1 - t.value }));
  /**
   * The crossfade pairs must sum to exactly 1 at every point in `t`, or the
   * tint appears to fade *out* mid-transition. Press feedback therefore can't
   * live on one half of a pair — it dims the whole item, active and idle alike,
   * on top of the icon's press scale.
   */
  const contentStyle = useAnimatedStyle(() => ({ opacity: 1 - press.value * 0.24 }));

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
      onLayout={onLayout}
      style={s.itemPress}>
      <Animated.View style={[s.item, contentStyle]}>
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
        <View style={s.labelBox}>
          <Animated.Text numberOfLines={1} style={[s.label, idleLabel]}>
            {label}
          </Animated.Text>
          <Animated.Text
            numberOfLines={1}
            style={[s.label, s.labelActive, s.labelAbs, activeLabel]}>
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

/**
 * The floating glass tab bar (§3.10). Pass to expo-router's <Tabs> as
 * `tabBar={(props) => <TabBar {...props} />}`.
 *
 * It renders only the routes listed in TABS, in that order, so leftover
 * route files never leak into the bar and no `href: null` is needed.
 *
 * On iOS 26 the bar and the pill are both native Liquid Glass (`GlassView`,
 * 'regular'); elsewhere they fall back to the BlurView construction. Either
 * way a single pill sits inset inside the bar, behind the active item,
 * and springs horizontally to whichever tab you pick. Every
 * tab keeps its icon *and* its label; only the tint changes on selection.
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

  /**
   * Real measured frames, one per item — never assume equal widths. The row
   * is an absolute fill over the bar, so a child's layout x is already in the
   * bar's own coordinate space (Yoga positions children against the parent's
   * border box, so the row's BAR_PAD is baked into x). That makes the pill
   * math a straight centring:  pillX = item.x + (item.width - pillW) / 2.
   */
  const [frames, setFrames] = useState<Record<number, { x: number; w: number }>>({});

  const onItemLayout = useCallback(
    (i: number) => (e: LayoutChangeEvent) => {
      const { x: ix, width } = e.nativeEvent.layout;
      setFrames((prev) => {
        const cur = prev[i];
        if (cur && Math.abs(cur.x - ix) < 0.5 && Math.abs(cur.w - width) < 0.5) return prev;
        return { ...prev, [i]: { x: ix, w: width } };
      });
    },
    [],
  );

  const active = frames[activeIndex];
  const pillW = active ? Math.max(0, active.w - PILL_INSET_X * 2) : 0;

  const x = useSharedValue(0);
  const w = useSharedValue(0);
  /**
   * The pill is invisible until the first frame lands. `x` can only be assigned
   * from the post-layout effect, so a cold start deep-linked to a non-first tab
   * would otherwise paint one frame of pill at the bar's left edge before
   * jumping to the right tab.
   */
  const ready = useSharedValue(0);
  const settled = useSharedValue(false);

  useEffect(() => {
    if (!active || pillW <= 0) return;
    const target = active.x + (active.w - pillW) / 2;
    if (!settled.value) {
      // first measurement: place it, don't fly it in from the left edge
      x.value = target;
      w.value = pillW;
      settled.value = true;
      ready.value = withTiming(1, { duration: 160, easing: Easing.bezier(...EASE.standard) });
    } else {
      x.value = withSpring(target, PILL_SPRING);
      w.value = withSpring(pillW, PILL_SPRING);
    }
  }, [active, pillW, x, w, ready, settled]);

  return (
    <View
      style={[s.wrap, { bottom: insets.bottom > 0 ? insets.bottom + 6 : 22 }]}
      pointerEvents="box-none">
      <View style={s.stack} pointerEvents="box-none">
        {/* 1 — the bar's own glass */}
        {LIQUID ? (
          <GlassView
            glassEffectStyle="regular"
            colorScheme="dark"
            style={s.barGlass}
            pointerEvents="none"
          />
        ) : (
          <BlurView intensity={blur.tabBar} tint="dark" style={s.blur}>
            <View style={s.barFill} />
          </BlurView>
        )}

        {/* 2 — the pill, inset inside the bar's padding box */}
        {pillW > 0 ? <Pill x={x} w={w} ready={ready} /> : null}

        {/* 3 — icons and labels, above the pill */}
        <View style={s.row} pointerEvents="box-none">
          {items.map((t, i) => {
            const focused = activeName === t.name;
            return (
              <TabItem
                key={t.name}
                label={t.label}
                icon={t.icon}
                focused={focused}
                onLayout={onItemLayout(i)}
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
  wrap: { position: 'absolute', left: 16, right: 16 },
  stack: { height: BAR_H },

  /**
   * Native glass gets no fill and no border: a background colour would sit
   * *in front of* the refraction and flatten it, and the material draws its
   * own edge. Only the corner radius is ours.
   */
  barGlass: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.tabBar,
  },

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

  /* pill ------------------------------------------------------------- */
  pill: {
    position: 'absolute',
    left: 0,
    borderRadius: PILL_R,
  },
  pillShadow: {
    // very soft, close shadow — the pill is set *into* the bar, not floating
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  pillGlass: { flex: 1, borderRadius: PILL_R },
  pillCore: {
    flex: 1,
    borderRadius: PILL_R,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  pillFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(120,120,128,0.22)',
  },
  pillBloom: {
    position: 'absolute',
    left: '12%',
    right: '12%',
    top: -PILL_H * 0.55,
    height: PILL_H,
    borderRadius: PILL_H / 2,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  pillRim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: StyleSheet.hairlineWidth * 2,
  },

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
  labelBox: { alignItems: 'center', justifyContent: 'center' },
  label: { ...type.tabLabel, color: colors.textTertiary, textAlign: 'center' },
  labelActive: { color: colors.accentText },
  labelAbs: { ...StyleSheet.absoluteFillObject },
});

export default TabBar;
