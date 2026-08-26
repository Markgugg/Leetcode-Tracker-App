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
  cancelAnimation,
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
/** The one snap-back spring. Shared so position and overlay can never diverge. */
const SNAP = { damping: 22, stiffness: 240, mass: 0.7 } as const;
/** Floor on the flick-out duration, so a dismiss is never a teleport. */
const FLICK_MIN_MS = 150;
/** Slowest speed a flick-out is timed against (px/s). */
const FLICK_MIN_SPEED = 700;

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
 * The panel is also drag-dismissable, and **one** shared value (`y`) owns its
 * position for every phase — enter, drag, spring-back and exit. The first cut
 * stacked a gesture-owned `drag` on top of an animation-owned `translate` and
 * composed the two in the style; that is what caused the black flash the owner
 * saw. Two things went wrong at the moment the finger lifted:
 *
 *  1. The dismiss branch did `translate = drag; drag = 0` — two writes to two
 *     values that a single style worklet sums. Reanimated flushes mappers per
 *     write, so the frame in between rendered `translate + drag = 2 × drag` and
 *     threw the panel to twice the drag depth before it snapped back.
 *  2. The overlay dimmed off `drag`, so zeroing `drag` slammed its opacity from
 *     (say) 0.35 back to a full-screen rgba(0,0,0,.55) wash for a frame before
 *     the 280ms fade even started. That re-darkening *is* the flash.
 *
 * On top of that, the exit was handed to React — `runOnJS(onClose)` → parent
 * `setState` → the `visible` effect → a fresh 380ms timing — which froze the
 * panel for the round trip (the lag) and re-timed a flick that had 40px left as
 * if it had the whole screen to cross (the jitter).
 *
 * So: the gesture animates its own exit, on the UI thread, in the frame the
 * finger lifts, over a duration derived from the distance left and the release
 * velocity; `onClose` still fires, and the `visible` effect stands down for that
 * one transition rather than starting a second animation on the same value.
 * `dimPx` carries the overlay and is only ever *animated* to a new value, never
 * reset under it.
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

  /**
   * The panel's offset from its open position, in px. The *only* thing that
   * moves the panel — entry, finger, spring-back and exit all write here, so
   * there is never a frame where two contributions disagree.
   */
  const y = useSharedValue(height);
  /** Overlay fade, 0…1. Owned by the enter/exit effect. */
  const fade = useSharedValue(0);
  /**
   * How far the drag has dimmed the overlay, in px of travel. Kept separate
   * from `y` because the *entry* must not dim (the panel crosses the whole
   * screen on its way up), and it is only ever animated — never snapped — so
   * the overlay cannot flash back to full black on release.
   */
  const dimPx = useSharedValue(0);
  /** Screen height on the UI thread, so worklets never close over a stale one. */
  const H = useSharedValue(height);
  /** Inner scroller offset — the pan only owns the gesture while this is 0. */
  const scrollY = useSharedValue(0);
  /** Latched in `onBegin`: was the content at the top when the finger landed? */
  const armed = useSharedValue(false);
  /** The pan actually activated (passed the slop), so it owns `y`. */
  const dragging = useSharedValue(false);
  /** `onEnd` already decided what happens next — don't let `onFinalize` re-decide. */
  const settled = useSharedValue(true);
  /** `y` when the finger took over, so a grab mid-animation doesn't jump. */
  const startY = useSharedValue(0);

  useEffect(() => {
    H.value = height;
  }, [height]);

  /* Set for the one `visible` transition the gesture is animating itself, so
     the effect below does not start a second animation on `y`. */
  const gestureExit = useRef(false);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  /**
   * End of a gesture-driven exit. The parent is free to ignore `onClose` (a
   * confirm-before-close sheet does), so unmount only if it actually took the
   * sheet down — otherwise put the panel back rather than leave it parked
   * off-screen with `visible` still true.
   */
  const finishExit = useRef(() => {
    if (visibleRef.current) {
      y.value = withTiming(0, {
        duration: duration.sheetUp,
        easing: Easing.bezier(...EASE.standard),
      });
      dimPx.value = withTiming(0, { duration: duration.overlayFade });
    } else {
      setMounted(false);
    }
  }).current;

  useEffect(() => {
    if (visible) {
      gestureExit.current = false;
      setMounted(true);
      y.value = height;
      dimPx.value = 0;
      scrollY.value = 0;
      fade.value = withTiming(1, { duration: duration.overlayFade });
      y.value = withTiming(0, {
        duration: duration.sheetUp,
        easing: Easing.bezier(...EASE.standard),
      });
    } else if (mounted) {
      /* The flick already put an exit in the air, aimed at where the finger
         left off. Re-animating `y` here is what made a fast swipe blink. */
      if (gestureExit.current) {
        gestureExit.current = false;
        return;
      }
      fade.value = withTiming(0, { duration: duration.overlayFade });
      y.value = withTiming(
        H.value,
        { duration: duration.sheetUp, easing: Easing.bezier(...EASE.standard) },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        },
      );
    }
  }, [visible]);

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
  /* Marks the transition as already-animated *before* `onClose` runs, so the
     `visible` effect the parent's setState triggers sees the flag. Both hops
     go through the same `runOnJS` call, so the order is guaranteed. */
  const requestClose = useRef(() => {
    gestureExit.current = true;
    closeRef.current();
  }).current;

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
        /* Not `onBegin`: that fires on touch-down, before the slop is crossed,
           and cancelling there would freeze the entry animation under a tap. */
        .onStart(() => {
          if (!armed.value) return;
          dragging.value = true;
          settled.value = false;
          /* Take `y` over from whatever was animating it and carry on from
             where it is — grabbing the panel mid-entry or mid-spring is a
             hand-off, not a jump. */
          cancelAnimation(y);
          cancelAnimation(dimPx);
          startY.value = y.value;
        })
        .onUpdate((e) => {
          if (!dragging.value) return;
          /* The scroller took the gesture (finger went up from the top): stand
             down for the rest of it rather than sliding the panel as well. */
          if (scrollY.value > 0.5) {
            y.value = startY.value;
            dimPx.value = Math.max(0, startY.value);
            return;
          }
          const raw = startY.value + e.translationY;
          y.value = raw >= 0 ? raw : raw * RUBBER;
          dimPx.value = Math.max(0, y.value);
        })
        .onEnd((e) => {
          if (!dragging.value) return;
          settled.value = true;
          const travel = y.value;
          const far = travel > DISMISS_PX;
          const flicked = e.velocityY > DISMISS_VELOCITY && travel > 16;
          if (far || flicked) {
            /* One continuous motion: the panel keeps going at roughly the speed
               it was released at, and the overlay finishes dimming on exactly
               the same clock. Nothing is handed back to React first. */
            const remaining = Math.max(1, H.value - travel);
            const speed = Math.max(FLICK_MIN_SPEED, e.velocityY);
            const ms = Math.min(
              duration.sheetUp,
              Math.max(FLICK_MIN_MS, (remaining / speed) * 1000),
            );
            const easing = Easing.bezier(...EASE.standard);
            dimPx.value = withTiming(FADE_TRAVEL, { duration: ms, easing });
            y.value = withTiming(H.value, { duration: ms, easing }, (finished) => {
              if (finished) runOnJS(finishExit)();
            });
            runOnJS(requestClose)();
          } else {
            y.value = withSpring(0, SNAP);
            dimPx.value = withSpring(0, SNAP);
          }
        })
        .onFinalize(() => {
          armed.value = false;
          /* Cancelled rather than ended (the scroller or a parent nav gesture
             took over): put the panel back, or it stays parked mid-drag. */
          if (dragging.value && !settled.value) {
            settled.value = true;
            y.value = withSpring(0, SNAP);
            dimPx.value = withSpring(0, SNAP);
          }
          dragging.value = false;
        }),
    [nativeScroll, requestClose, finishExit],
  );

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: fade.value * interpolate(dimPx.value, [0, FADE_TRAVEL], [1, 0], 'clamp'),
  }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
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
