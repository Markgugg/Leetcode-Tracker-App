import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { ambientGlows, colors } from '@/theme';

/**
 * The three ambient radial glows from §1 — fixed behind all content,
 * pointer-events none. They are what makes the BlurView cards read as glass
 * against true black.
 *
 * `expo-linear-gradient` cannot do radial gradients, so these are SVG
 * <RadialGradient> ellipses sized in screen points exactly as specified:
 *   420x300 at 78% 4%   rgba(250,17,79,.13)
 *   400x340 at  8% 34%  rgba(0,211,242,.09)
 *   460x320 at 60% 92%  rgba(162,247,61,.07)
 *
 * Render it as the first child of a screen's root <View>; the scroll content
 * sits on top.
 */
/** `rgba(r,g,b,a)` → `{ rgb: 'rgb(r,g,b)', a }`, because react-native-svg's
 *  <Stop> wants the alpha in `stopOpacity`, not baked into `stopColor`. */
function splitRgba(css: string): { rgb: string; a: number } {
  const m = /rgba?\(([^)]+)\)/.exec(css);
  if (!m) return { rgb: css, a: 1 };
  const parts = m[1].split(',').map((p) => p.trim());
  return { rgb: `rgb(${parts[0]},${parts[1]},${parts[2]})`, a: Number(parts[3] ?? 1) };
}

export function AmbientBackground() {
  const { width, height } = useWindowDimensions();

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          {ambientGlows.map((g, i) => {
            const { rgb, a } = splitRgba(g.color);
            return (
              <RadialGradient key={i} id={`glow${i}`} cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={rgb} stopOpacity={a} />
                {/* `transparent 70%` in the CSS spec */}
                <Stop offset="0.7" stopColor={rgb} stopOpacity={0} />
                <Stop offset="1" stopColor={rgb} stopOpacity={0} />
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
            fill={`url(#glow${i})`}
          />
        ))}
      </Svg>
    </View>
  );
}

export default AmbientBackground;
