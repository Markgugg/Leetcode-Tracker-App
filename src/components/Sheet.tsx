import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { EASE, blur, colors, duration, radius, shadow, type } from '@/theme';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  /** Sheet title, 27/700/-0.9. */
  title?: string;
  /** Right-aligned trailing text on the title row, e.g. "Week 12". */
  subtitle?: string;
  /** Anything to render on the title row's right (overrides `subtitle`). */
  headerRight?: React.ReactNode;
  children?: React.ReactNode;
  /** Wrap children in a ScrollView. Default true. */
  scroll?: boolean;
  /** Fraction of screen height the panel may occupy. Default 0.9. */
  maxHeightRatio?: number;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Shared bottom-sheet chrome per §3.11: overlay rgba(0,0,0,.55) + blur 4
 * (fade 280ms), panel rgba(30,30,34,.90) blur 50, top radius 34,
 * 12/22/38 padding, a 38x5 grab handle, `sheetUp` entry, maxHeight 90%.
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  headerRight,
  children,
  scroll = true,
  maxHeightRatio = 0.9,
  contentStyle,
  testID,
}: SheetProps) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);

  const translate = useSharedValue(height);
  const fade = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translate.value = height;
      fade.value = withTiming(1, { duration: duration.overlayFade });
      translate.value = withTiming(0, {
        duration: duration.sheetUp,
        easing: Easing.bezier(...EASE.standard),
      });
    } else if (mounted) {
      fade.value = withTiming(0, { duration: duration.overlayFade });
      translate.value = withTiming(
        height,
        { duration: duration.sheetUp, easing: Easing.bezier(...EASE.standard) },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        },
      );
    }
  }, [visible, height]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translate.value }] }));

  if (!mounted) return null;

  const body = (
    <View style={[{ paddingBottom: 38 + insets.bottom }, contentStyle]}>{children}</View>
  );

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={StyleSheet.absoluteFill} testID={testID}>
        <Animated.View style={[StyleSheet.absoluteFill, overlayStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
            <BlurView intensity={blur.overlay} tint="dark" style={StyleSheet.absoluteFill}>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} />
            </BlurView>
          </Pressable>
        </Animated.View>

        <Animated.View
          style={[
            s.panelWrap,
            { maxHeight: height * maxHeightRatio },
            shadow.sheet,
            panelStyle,
          ]}>
          <BlurView intensity={blur.sheet} tint="dark" style={s.panelBlur}>
            <View style={s.panelFill}>
              <View style={s.handle} />
              {title ? (
                <View style={s.titleRow}>
                  <Text style={s.title}>{title}</Text>
                  {headerRight ?? (subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null)}
                </View>
              ) : null}
              {scroll ? (
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled">
                  {body}
                </ScrollView>
              ) : (
                body
              )}
            </View>
          </BlurView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  panelWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  panelBlur: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    overflow: 'hidden',
  },
  panelFill: {
    backgroundColor: colors.sheet,
    borderTopWidth: 0.5,
    borderTopColor: colors.borderSheet,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: 12,
    paddingHorizontal: 22,
  },
  handle: {
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.grabHandle,
    alignSelf: 'center',
    marginBottom: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: { ...type.sheetTitle, color: colors.text },
  subtitle: { fontSize: 13.5, fontWeight: '400', color: colors.textSecondary },
});

export default Sheet;
