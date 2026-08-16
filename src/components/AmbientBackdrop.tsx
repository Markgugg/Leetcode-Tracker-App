import React, { useId } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle, useWindowDimensions } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { ambientGlows, colors } from '@/theme';

/**
 * The three ambient radial glows from §1 — pointer-events none, fixed behind
 * all content. They are what makes the blur read as glass, so every full-screen
 * surface in the redesign sits on top of one of these.
 *
 * `expo-linear-gradient` cannot do radial gradients, so this is SVG.
 *
 * ⚠️ This is the *only* ambient implementation in the app. There used to be
 * five (a second shared component plus private copies in you/practice/crew) and
 * three of them emitted the identical literal gradient ids `glow0..2`. Because
 * expo-router's <Tabs> keeps visited tabs mounted, several definitions of the
 * same id coexisted in the tree and react-native-svg's per-view brush registry
 * resolved `url(#glow0)` to whichever mounted last — so the wrong screen's glow
 * got painted. Every instance below therefore namespaces its gradient ids with
 * React's `useId()`, which is unique per mounted component instance.
 */

function splitRgba(c: string): { color: string; opacity: number } {
  const m = c.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/);
  if (!m) return { color: c, opacity: 1 };
  return {
    color: `rgb(${m[1]},${m[2]},${m[3]})`,
    opacity: m[4] === undefined ? 1 : Number(m[4]),
  };
}

export interface AmbientBackdropProps {
  /** Extra style for the absolutely-filled root (rarely needed). */
  style?: StyleProp<ViewStyle>;
}

export function AmbientBackdrop({ style }: AmbientBackdropProps) {
  const { width, height } = useWindowDimensions();
  // `useId()` yields e.g. ":r3:" — strip the punctuation so it is a legal
  // SVG id / `url(#…)` fragment on both platforms.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, s.root, style]}>
      <Svg width={width} height={height}>
        <Defs>
          {ambientGlows.map((g, i) => {
            const { color, opacity } = splitRgba(g.color);
            return (
              <RadialGradient key={i} id={`ambient${uid}_${i}`} cx="50%" cy="50%" rx="50%" ry="50%">
                {/* the alpha lives in stopOpacity — react-native-svg's <Stop>
                    ignores it when baked into stopColor on some platforms */}
                <Stop offset="0" stopColor={color} stopOpacity={opacity} />
                {/* `transparent 70%` in the CSS spec */}
                <Stop offset="0.7" stopColor={color} stopOpacity={0} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </RadialGradient>
            );
          })}
        </Defs>
        {ambientGlows.map((g, i) => (
          <Ellipse
            key={i}
            cx={width * g.x}
            cy={height * g.y}
            rx={g.w / 2}
            ry={g.h / 2}
            fill={`url(#ambient${uid}_${i})`}
          />
        ))}
      </Svg>
    </View>
  );
}

const s = StyleSheet.create({
  root: { backgroundColor: colors.bg },
});

export default AmbientBackdrop;
