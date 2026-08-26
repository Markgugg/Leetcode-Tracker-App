import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  type NativeGesture,
} from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
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

/* ------------------------------------------------------------------ */
/* Drag-to-dismiss                                                     */
/* ------------------------------------------------------------------ */

/** Release past this many px of downward drag and the sheet dismisses. */
const DISMISS_PX = 120;
/** …or below it, if the flick was this fast (px/s) and moved at all. */
const DISMISS_VELOCITY = 900;
/** How far the panel has to travel for the overlay to reach full transparency. */
const FADE_TRAVEL = 320;
/** Upward drag is resisted rather than blocked — the rubber-band factor. */
const RUBBER = 0.16;

/**
 * Lets a consumer that renders its *own* scroller (`scroll={false}`, e.g.
 * RingDetailSheet) hand it to the sheet's pan so the two cooperate instead of
 * cancelling each other. Provided by `Sheet`, consumed by `SheetScrollView`.
 */
interface SheetScrollApi {
  /** The native scroll gesture the panel pan runs simultaneously with. */
  nativeScroll: NativeGesture;
  /** Feeds `scrollY` so the pan knows whether the content is at the top. */
  onScroll: ReturnType<typeof useAnimatedScrollHandler>;
}

const SheetScrollContext = createContext<SheetScrollApi | null>(null);

/**
 * A `ScrollView` that cooperates with the sheet's drag-to-dismiss pan: the pan
 * only takes over while this scroller sits at offset 0 and the finger is going
 * down. Drop-in replacement for `ScrollView` inside a `scroll={false}` sheet.
 */
export function SheetScrollView({ children, ...props }: ScrollViewProps) {
  const api = useContext(SheetScrollContext);
  if (!api) {
    return <ScrollView {...props}>{children}</ScrollView>;
  }
  return (
    <GestureDetector gesture={api.nativeScroll}>
      <Animated.ScrollView
        bounces={false}
        {...props}
        onScroll={api.onScroll}
        scrollEventThrottle={16}>
        {children}
      </Animated.ScrollView>
    </GestureDetector>
  );
}

/**
 * Shared bottom-sheet chrome per §3.11: overlay rgba(0,0,0,.55) + blur 4
 * (fade 280ms), panel rgba(30,30,34,.90) blur 50, top radius 34,
 * 12/22/38 padding, a 38x5 grab handle, `sheetUp` entry, maxHeight 90%.
 *
 * The panel is also drag-dismissable. `drag` is a second, gesture-owned offset
 * stacked on the enter/exit `translate` so the two never fight; a release past
 * the threshold folds `drag` into `translate` and calls `onClose`, which lets
 * the existing exit timing carry the panel the rest of the way off-screen from
 * wherever the finger left it.
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
  /** Finger-owned offset, always ≥ the rubber-banded upward minimum. */
  const drag = useSharedValue(0);
  /** Inner scroller offset — the pan only owns the gesture while this is 0. */
  const scrollY = useSharedValue(0);
  /** Latched in `onBegin`: was the content at the top when the finger landed? */
  const armed = useSharedValue(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translate.value = height;
      drag.value = 0;
      scrollY.value = 0;
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

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const nativeScroll = useMemo(() => Gesture.Native(), []);

  /* Consumers pass `onClose` inline, so it is a new function every render.
     Rebuilding the gesture that often would drop a drag mid-flight; the ref
     keeps the gesture object stable and the callback current. */
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const requestClose = useRef(() => closeRef.current()).current;

  const pan = useMemo(
    () =>
      Gesture.Pan()
        /* Both directions activate — the upward one only ever rubber-bands —
           but 14px of slop keeps a tap on a row inside the sheet a tap. */
        .activeOffsetY([-14, 14])
        .simultaneousWithExternalGesture(nativeScroll)
        .onBegin(() => {
          armed.value = scrollY.value <= 0.5;
        })
        .onUpdate((e) => {
          if (!armed.value) return;
          /* The scroller took the gesture (finger went up from the top): stand
             down for the rest of it rather than sliding the panel as well. */
          if (scrollY.value > 0.5) {
            drag.value = 0;
            return;
          }
          drag.value = e.translationY >= 0 ? e.translationY : e.translationY * RUBBER;
        })
        .onEnd((e) => {
          if (!armed.value) return;
          const far = drag.value > DISMISS_PX;
          const flicked = e.velocityY > DISMISS_VELOCITY && drag.value > 16;
          if (far || flicked) {
            /* Hand the finger's offset to the exit animation and let the
               `visible` effect finish the trip — one animation, no jump. */
            translate.value = drag.value;
            drag.value = 0;
            runOnJS(requestClose)();
          } else {
            drag.value = withSpring(0, { damping: 22, stiffness: 240, mass: 0.7 });
          }
        })
        .onFinalize(() => {
          armed.value = false;
        }),
    [nativeScroll, requestClose],
  );

  const overlayStyle = useAnimatedStyle(() => ({
    opacity:
      fade.value *
      interpolate(drag.value, [0, FADE_TRAVEL], [1, 0], 'clamp'),
  }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translate.value + drag.value }],
  }));

  if (!mounted) return null;

  const body = (
    <View style={[{ paddingBottom: 38 + insets.bottom }, contentStyle]}>{children}</View>
  );

  const scrollApi: SheetScrollApi = { nativeScroll, onScroll };

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* A Modal is its own native view tree, so gestures inside it need their
          own root — the app-level one does not reach in here. */}
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        <View style={StyleSheet.absoluteFill} testID={testID}>
          <Animated.View style={[StyleSheet.absoluteFill, overlayStyle]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
              <BlurView intensity={blur.overlay} tint="dark" style={StyleSheet.absoluteFill}>
                <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} />
              </BlurView>
            </Pressable>
          </Animated.View>

          <GestureDetector gesture={pan}>
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
                  <SheetScrollContext.Provider value={scrollApi}>
                    {scroll ? (
                      <SheetScrollView
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled">
                        {body}
                      </SheetScrollView>
                    ) : (
                      body
                    )}
                  </SheetScrollContext.Provider>
                </View>
              </BlurView>
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
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
