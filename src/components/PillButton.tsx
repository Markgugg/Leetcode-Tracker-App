import React from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, pressed } from '@/theme';

export type PillButtonVariant = 'grey' | 'accent' | 'tint';
export type PillButtonSize = 'lg' | 'md';

export interface PillButtonProps {
  label: string;
  onPress: () => void;
  /**
   * grey   — the calm Fitness pill: rgba(120,120,128,0.22) fill, white label.
   * accent — grey pill, #A594FF label (B5 style). One primary action per context.
   * tint   — translucent `tintColor` fill with a `tintColor` label.
   */
  variant?: PillButtonVariant;
  /** Required by `tint`; ignored by the other variants. */
  tintColor?: string;
  /** lg = 50px tall / radius 25 (default). md = 44px tall / radius 22. */
  size?: PillButtonSize;
  /** Ionicons glyph name, rendered left of the label at 18px with a 6px gap. */
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  testID?: string;
}

/** The calm grey pill fill — Fitness's button colour, one notch quieter than
 *  `colors.control` so a row of pills reads as background, not chrome. */
const GREY_FILL = 'rgba(120,120,128,0.22)';

const SIZES = {
  lg: { height: 50, radius: 25, paddingH: 20 },
  md: { height: 44, radius: 22, paddingH: 16 },
} as const;

/**
 * The app's one button. Full-round, no borders, no boxy cards — content sits
 * directly on the surface. Pairs go in a row with a 12px gap, each `flex: 1`.
 */
export function PillButton({
  label,
  onPress,
  variant = 'grey',
  tintColor,
  size = 'lg',
  icon,
  disabled = false,
  style,
  labelStyle,
  testID,
}: PillButtonProps) {
  const dims = SIZES[size];
  const tint = tintColor ?? colors.accent;

  /* accent = grey pill, accent label ("B5") — the primary action reads
     through its label colour, not a solid fill. */
  const fill = variant === 'tint' ? withAlpha(tint, 0.18) : GREY_FILL;
  const fg =
    variant === 'accent' ? colors.accentText : variant === 'tint' ? tint : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed: p }) => [
        s.base,
        {
          height: dims.height,
          borderRadius: dims.radius,
          paddingHorizontal: dims.paddingH,
          backgroundColor: fill,
        },
        disabled && s.disabled,
        p && !disabled && pressed,
        style,
      ]}>
      {icon ? (
        <View style={s.icon}>
          <Ionicons name={icon} size={18} color={disabled ? colors.textDisabled : fg} />
        </View>
      ) : null}
      <Text
        numberOfLines={1}
        style={[s.label, { color: disabled ? colors.textDisabled : fg }, labelStyle]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** `#RRGGBB` / `rgb()` / `rgba()` → the same hue at `a` alpha. */
function withAlpha(color: string, a: number): string {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const full =
      hex.length === 3
        ? hex
            .split('')
            .map((c) => c + c)
            .join('')
        : hex.slice(0, 6);
    const n = parseInt(full, 16);
    if (Number.isNaN(n)) return color;
    // eslint-disable-next-line no-bitwise
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(',').map((v) => v.trim());
    return `rgba(${r},${g},${b},${a})`;
  }
  return color;
}

const s = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { marginRight: 6 },
  label: { fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
  disabled: { opacity: 0.5 },
});

export default PillButton;
