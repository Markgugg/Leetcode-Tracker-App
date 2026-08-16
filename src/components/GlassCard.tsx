import React from 'react';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { blur, colors, pressed, radius as R } from '@/theme';

export type GlassVariant = 'card' | 'small' | 'sheet' | 'tabBar' | 'toast';

const VARIANTS: Record<GlassVariant, { fill: string; border: string; intensity: number; radius: number }> = {
  card: { fill: colors.card, border: colors.border, intensity: blur.card, radius: R.cardLarge },
  small: { fill: colors.cardSmall, border: colors.borderSmall, intensity: blur.cardSmall, radius: R.smallCard },
  sheet: { fill: colors.sheet, border: colors.borderSheet, intensity: blur.sheet, radius: R.sheet },
  tabBar: { fill: colors.tabBar, border: colors.borderTabBar, intensity: blur.tabBar, radius: R.tabBar },
  toast: { fill: colors.toast, border: colors.borderToast, intensity: blur.toast, radius: R.input },
};

export interface GlassCardProps {
  children?: React.ReactNode;
  /** Token set to use. Default `card` (the standard Summary card). */
  variant?: GlassVariant;
  /** Corner radius override. */
  radius?: number;
  /** Inner padding. Default 20 (`card`) / 22 (`sheet`) / 0 otherwise. */
  padding?: number;
  /** Overlay fill override — pass a tinted color for milestone/gem cards. */
  fill?: string;
  /** Border color override (e.g. the `#FFD426` Continue card). */
  borderColor?: string;
  /** Blur intensity override. */
  intensity?: number;
  /** Outer style (margins, width, …). */
  style?: StyleProp<ViewStyle>;
  /** Inner (content) style. */
  contentStyle?: StyleProp<ViewStyle>;
  /** Makes the whole card tappable with the standard 140ms feedback. */
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
}

/**
 * The glass recipe from §1: a BlurView with a translucent overlay + .5px
 * hairline border. `backdrop-filter` has no RN equivalent, so every surface in
 * the prototype becomes one of these.
 */
export function GlassCard({
  children,
  variant = 'card',
  radius,
  padding,
  fill,
  borderColor,
  intensity,
  style,
  contentStyle,
  onPress,
  disabled,
  testID,
}: GlassCardProps) {
  const v = VARIANTS[variant];
  const r = radius ?? v.radius;
  const pad = padding ?? (variant === 'sheet' ? 22 : variant === 'card' ? 20 : 0);

  const body = (
    <BlurView
      intensity={intensity ?? v.intensity}
      tint="dark"
      style={{ borderRadius: r, overflow: 'hidden' }}>
      <View
        style={[
          {
            backgroundColor: fill ?? v.fill,
            borderWidth: 0.5,
            borderColor: borderColor ?? v.border,
            borderRadius: r,
            padding: pad,
          },
          contentStyle,
        ]}>
        {children}
      </View>
    </BlurView>
  );

  if (!onPress) return <View style={style} testID={testID}>{body}</View>;

  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed: p }) => [style, p && pressed]}>
      {body}
    </Pressable>
  );
}

export default GlassCard;
