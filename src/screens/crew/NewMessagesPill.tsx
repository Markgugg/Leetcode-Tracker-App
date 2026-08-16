/**
 * "↓ New messages" pill.
 *
 * Only ever shown when the reader has scrolled away from the newest message —
 * if they are already at the bottom the list sticks there instead and the pill
 * never appears.
 */

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { EASE, blur, colors, duration, pressed, radius, shadow } from '@/theme';

export function NewMessagesPill({
  visible,
  count,
  onPress,
  bottom,
}: {
  visible: boolean;
  count: number;
  onPress: () => void;
  bottom: number;
}) {
  const p = useSharedValue(0);
  // Kept mounted through the exit animation; never read `p.value` in render.
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    const out = 200;
    if (visible) setMounted(true);
    p.value = withTiming(visible ? 1 : 0, {
      duration: visible ? duration.tipIn : out,
      easing: Easing.bezier(...EASE.standard),
    });
    if (visible) return;
    const t = setTimeout(() => setMounted(false), out + 30);
    return () => clearTimeout(t);
  }, [visible]);

  const style = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * 14 }, { scale: 0.94 + p.value * 0.06 }],
  }));

  if (!mounted) return null;

  const label = count > 0 ? `${count} new message${count === 1 ? '' : 's'}` : 'New messages';

  return (
    <Animated.View
      style={[s.wrap, { bottom }, style]}
      pointerEvents={visible ? 'box-none' : 'none'}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Jump to ${label}`}
        style={({ pressed: pr }) => [pr && pressed]}>
        <BlurView intensity={blur.toast} tint="dark" style={s.blur}>
          <View style={s.fill}>
            <Ionicons name="arrow-down" size={13} color={colors.accentText} />
            <Text style={s.label}>{label}</Text>
          </View>
        </BlurView>
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 30 },
  blur: { borderRadius: radius.pill, overflow: 'hidden', ...shadow.sm },
  fill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.toast,
    borderWidth: 0.5,
    borderColor: colors.borderToast,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.text },
});
