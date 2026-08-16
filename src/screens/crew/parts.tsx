/** Small shared chrome for the Crew screen. */

import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { blur, colors, pressed, type } from '@/theme';

export const H = 20; // screen h-padding

/** .5px divider between rows inside a glass card. */
export function Hairline({ inset = 0 }: { inset?: number }) {
  return <View style={[s.hairline, inset ? { marginLeft: inset } : null]} />;
}

/** Circular glass control — the header overflow button, the pill dismiss, … */
export function GlassCircleButton({
  icon,
  onPress,
  size = 34,
  iconSize = 16,
  tint = colors.text,
  accessibilityLabel,
  style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  size?: number;
  iconSize?: number;
  tint?: string;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed: p }) => [style, p && pressed]}>
      <BlurView
        intensity={blur.cardSmall}
        tint="dark"
        style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
        <View style={[s.circleFill, { borderRadius: size / 2 }]}>
          <Ionicons name={icon} size={iconSize} color={tint} />
        </View>
      </BlurView>
    </Pressable>
  );
}

/** "ACTIVITY" micro-label with a hairline running to the edge. */
export function SectionRule({ label }: { label: string }) {
  return (
    <View style={s.ruleRow}>
      <Text style={s.ruleLabel}>{label}</Text>
      <View style={s.ruleLine} />
    </View>
  );
}

const s = StyleSheet.create({
  hairline: { height: 0.5, backgroundColor: colors.hairline },
  circleFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.controlAlt,
    borderWidth: 0.5,
    borderColor: colors.borderSmall,
  },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ruleLabel: { ...type.microLabel, color: colors.textTertiary },
  ruleLine: { flex: 1, height: 0.5, backgroundColor: colors.hairline },
});
