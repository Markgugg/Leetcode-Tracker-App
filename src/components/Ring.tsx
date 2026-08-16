import React, { useEffect } from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { EASE, clamp, colors, duration, pressed, ringGeom, ringSizes, shadow } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/* ------------------------------------------------------------------ */
/* Arc — one animated ring                                             */
/* ------------------------------------------------------------------ */

interface ArcProps {
  center: number;
  r: number;
  strokeWidth: number;
  color: string;
  track: string;
  /** 0..1 (clamped). */
  progress: number;
  animate: boolean;
  delay: number;
}

function Arc({ center, r, strokeWidth, color, track, progress, animate, delay }: ArcProps) {
  const C = 2 * Math.PI * r;
  const target = C * (1 - clamp(progress));
  const offset = useSharedValue(animate ? C : target);

  useEffect(() => {
    offset.value = withDelay(
      animate ? delay : 0,
      withTiming(C * (1 - clamp(progress)), {
        duration: animate ? duration.ringFill : 0,
        easing: Easing.bezier(...EASE.ring),
      }),
    );
  }, [progress, C, animate, delay]);

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value }));

  return (
    <>
      <Circle
        cx={center}
        cy={center}
        r={r}
        stroke={track}
        strokeWidth={strokeWidth}
        fill="none"
      />
      <AnimatedCircle
        cx={center}
        cy={center}
        r={r}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={`${C} ${C}`}
        animatedProps={animatedProps}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Ring — the tri-ring                                                 */
/* ------------------------------------------------------------------ */

export interface RingMetric {
  value: number;
  goal: number;
}

export interface RingProps {
  /** Outer ring — problems solved this week. `#FA114F` */
  volume: RingMetric;
  /** Middle ring — medium-or-harder solved. `#A2F73D` */
  difficulty: RingMetric;
  /** Inner ring — distinct days solved. `#00D3F2` */
  streak: RingMetric;
  /** Rendered pixel size. Summary 158 · sheet 196 · welcome 210 · day 38. */
  size?: number;
  /** `main` = viewBox 220 / stroke 20. `day` = viewBox 60 / stroke 5. */
  variant?: 'main' | 'day';
  /** Run the 900ms fill on mount / value change. Default true. */
  animate?: boolean;
  /** Stagger between the three rings, ms. Default 0. */
  stagger?: number;
  /** Show the `#FA114F` arrow tip on the outer ring at current progress. */
  tip?: boolean;
  /** Tip diameter. Default 32 (36 in the ring sheet). */
  tipSize?: number;
  onTipPress?: () => void;
  /** Absolutely-centered overlay content (e.g. a numeral). */
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const pct = (m: RingMetric) => (m.goal > 0 ? m.value / m.goal : 0);

export function Ring({
  volume,
  difficulty,
  streak,
  size,
  variant = 'main',
  animate = true,
  stagger = 0,
  tip = false,
  tipSize = 32,
  onTipPress,
  children,
  style,
  testID,
}: RingProps) {
  const g = variant === 'day' ? ringGeom.day : ringGeom.main;
  const box = size ?? (variant === 'day' ? ringSizes.day : ringSizes.summary);
  const [rOuter, rMid, rIn] = g.radii;

  const vP = clamp(pct(volume));

  // Arrow tip position — §2. angle measured from 12 o'clock.
  const angle = ((-90 + 360 * vP) * Math.PI) / 180;
  const ratio = rOuter / g.viewBox; // e.g. 94/220
  const tipLeft = box / 2 + box * ratio * Math.cos(angle) - tipSize / 2;
  const tipTop = box / 2 + box * ratio * Math.sin(angle) - tipSize / 2;

  return (
    <View style={[{ width: box, height: box }, style]} testID={testID}>
      <Svg width={box} height={box} viewBox={`0 0 ${g.viewBox} ${g.viewBox}`}>
        <G transform={`rotate(-90 ${g.center} ${g.center})`}>
          <Arc
            center={g.center}
            r={rOuter}
            strokeWidth={g.stroke}
            color={colors.volume}
            track={colors.volumeTrack}
            progress={vP}
            animate={animate}
            delay={0}
          />
          <Arc
            center={g.center}
            r={rMid}
            strokeWidth={g.stroke}
            color={colors.difficulty}
            track={colors.difficultyTrack}
            progress={pct(difficulty)}
            animate={animate}
            delay={stagger}
          />
          <Arc
            center={g.center}
            r={rIn}
            strokeWidth={g.stroke}
            color={colors.streak}
            track={colors.streakTrack}
            progress={pct(streak)}
            animate={animate}
            delay={stagger * 2}
          />
        </G>
      </Svg>

      {children ? <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={s.center}>{children}</View>
      </View> : null}

      {tip ? (
        <RingTip
          size={tipSize}
          left={tipLeft}
          top={tipTop}
          onPress={onTipPress}
          animate={animate}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Arrow tip                                                           */
/* ------------------------------------------------------------------ */

function RingTip({
  size,
  left,
  top,
  onPress,
  animate,
}: {
  size: number;
  left: number;
  top: number;
  onPress?: () => void;
  animate: boolean;
}) {
  const scale = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    scale.value = withDelay(
      animate ? duration.ringFill - 200 : 0,
      withTiming(1, {
        duration: animate ? duration.tipIn : 0,
        easing: Easing.bezier(...EASE.standard),
      }),
    );
  }, [animate]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const glyph = size * 0.5;

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left,
          top,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.volume,
          alignItems: 'center',
          justifyContent: 'center',
        },
        shadow.tip,
        animatedStyle,
      ]}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        hitSlop={8}
        style={({ pressed: p }) => [s.tipPress, p && pressed]}>
        <Svg width={glyph} height={glyph} viewBox="0 0 24 24">
          <Path
            d="M5 12h13M12.5 6l6 6-6 6"
            stroke="#000000"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      </Pressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* ProgressRing — single arc (Practice topics, crew avatars, pathways)  */
/* ------------------------------------------------------------------ */

export interface ProgressRingProps {
  /** 0..1 */
  progress: number;
  /** Pixel size. */
  size: number;
  color?: string;
  trackColor?: string;
  /** Stroke width in *viewBox* units (viewBox is always 60). Default 5. */
  strokeWidth?: number;
  /** Radius in viewBox units. Default 25. */
  r?: number;
  animate?: boolean;
  delay?: number;
  /** Centered SVG text, e.g. "24%". */
  label?: string;
  labelSize?: number;
  labelColor?: string;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function ProgressRing({
  progress,
  size,
  color = colors.volume,
  trackColor,
  strokeWidth = 5,
  r = 25,
  animate = true,
  delay = 0,
  label,
  labelSize = 14,
  labelColor,
  children,
  style,
}: ProgressRingProps) {
  return (
    <View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 60 60">
        <G transform="rotate(-90 30 30)">
          <Arc
            center={30}
            r={r}
            strokeWidth={strokeWidth}
            color={color}
            track={trackColor ?? 'rgba(255,255,255,0.10)'}
            progress={progress}
            animate={animate}
            delay={delay}
          />
        </G>
        {label ? (
          <SvgText
            x={30}
            y={30 + labelSize * 0.36}
            fontSize={labelSize}
            fontWeight="700"
            fill={labelColor ?? color}
            textAnchor="middle">
            {label}
          </SvgText>
        ) : null}
      </Svg>
      {children ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <View style={s.center}>{children}</View>
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* DoubleRing — the "weeks closed · last 12" glyph (§3.9.8)             */
/* ------------------------------------------------------------------ */

export interface DoubleRingProps {
  volume: number;
  difficulty: number;
  size?: number;
  animate?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function DoubleRing({ volume, difficulty, size = 49, animate = true, style }: DoubleRingProps) {
  return (
    <View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 60 60">
        <G transform="rotate(-90 30 30)">
          <Arc
            center={30}
            r={25}
            strokeWidth={5}
            color={colors.volume}
            track={colors.volumeTrack}
            progress={volume}
            animate={animate}
            delay={0}
          />
          <Arc
            center={30}
            r={17}
            strokeWidth={5}
            color={colors.difficulty}
            track={colors.difficultyTrack}
            progress={difficulty}
            animate={animate}
            delay={0}
          />
        </G>
      </Svg>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tipPress: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
});

export default Ring;
