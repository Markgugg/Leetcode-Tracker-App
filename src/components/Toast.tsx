import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { EASE, blur, colors, duration, radius } from '@/theme';

export interface ToastProps {
  /** `null` renders nothing. Any non-empty string shows the toast. */
  message: string | null;
  /** Called ~2.7s after the message appears so the owner can clear state. */
  onHide?: () => void;
  /** Distance from the bottom. Default 98 (clears the floating tab bar). */
  bottom?: number;
}

/**
 * §3.12 — left/right 20, bottom 98, radius 22, 14/18 padding, a 26px
 * `#A2F73D` circle with a dark check + the message at 14.5/500.
 * Auto-dismisses on the `toastIn` curve (~2.7s).
 *
 * Render it as the LAST child of a screen's root <View>, outside any
 * ScrollView, so it floats above the content.
 */
export function Toast({ message, onHide, bottom = 98 }: ToastProps) {
  const progress = useSharedValue(0);
  const y = useSharedValue(20);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!message) return;
    const IN = Math.round(duration.toast * 0.12); // 12% of 2700ms
    const OUT = 260;
    const HOLD = duration.toast - IN - OUT;
    const ease = Easing.bezier(...EASE.standard);

    progress.value = 0;
    y.value = 20;
    progress.value = withSequence(
      withTiming(1, { duration: IN, easing: ease }),
      withDelay(HOLD, withTiming(0, { duration: OUT, easing: ease })),
    );
    y.value = withSequence(
      withTiming(0, { duration: IN, easing: ease }),
      withDelay(HOLD, withTiming(-10, { duration: OUT, easing: ease })),
    );

    timer.current = setTimeout(() => onHide?.(), duration.toast);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [message]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: y.value }],
  }));

  if (!message) return null;

  return (
    <Animated.View style={[s.wrap, { bottom }, animatedStyle]} pointerEvents="none">
      <BlurView intensity={blur.toast} tint="dark" style={s.blur}>
        <View style={s.fill}>
          <View style={s.check}>
            <Svg width={14} height={14} viewBox="0 0 24 24">
              <Path
                d="M5 12.5l4.5 4.5L19 7.5"
                stroke="#0B1400"
                strokeWidth={3.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </Svg>
          </View>
          <Text style={s.text} numberOfLines={2}>
            {message}
          </Text>
        </View>
      </BlurView>
    </Animated.View>
  );
}

/**
 * Convenience hook so a screen doesn't have to wire state by hand:
 *
 * ```tsx
 * const { show, toastNode } = useToast();
 * ...
 * <View style={{flex:1}}>
 *   <ScrollView>…</ScrollView>
 *   {toastNode}
 * </View>
 * ```
 */
export function useToast(bottom?: number) {
  const [message, setMessage] = useState<string | null>(null);
  const show = useCallback((m: string) => {
    setMessage(null);
    // next tick, so re-firing the same message restarts the animation
    setTimeout(() => setMessage(m), 0);
  }, []);
  const hide = useCallback(() => setMessage(null), []);
  const toastNode = <Toast message={message} onHide={hide} bottom={bottom} />;
  return { message, show, hide, toastNode };
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 20, right: 20, zIndex: 100 },
  blur: { borderRadius: radius.input, overflow: 'hidden' },
  fill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.toast,
    borderWidth: 0.5,
    borderColor: colors.borderToast,
    borderRadius: radius.input,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.difficulty,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, fontSize: 14.5, fontWeight: '500', color: colors.text },
});

export default Toast;
