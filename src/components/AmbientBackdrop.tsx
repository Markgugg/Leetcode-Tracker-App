import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { ambientGlows } from '@/theme';

/**
 * The three ambient radial glows from §1 — pointer-events none, fixed behind
 * all content. They are what makes the blur read as glass, so every full-screen
 * surface in the redesign sits on top of one of these.
 *
 * `expo-linear-gradient` cannot do radial gradients, so this is SVG.
 */

function splitRgba(c: string): { color: string; opacity: number } {
  const m = c.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/);
  if (!m) return { color: c, opacity: 1 };
  return {
    color: `rgb(${m[1]},${m[2]},${m[3]})`,
    opacity: m[4] === undefined ? 1 : Number(m[4]),
  };
}

export function AmbientBackdrop() {
  const { width, height } = useWindowDimensions();

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, s.root]}>
      <Svg width={width} height={height}>
        <Defs>
          {ambientGlows.map((g, i) => {
            const { color, opacity } = splitRgba(g.color);
            return (
              <RadialGradient key={i} id={`ambient${i}`} cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0" stopColor={color} stopOpacity={opacity} />
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
            fill={`url(#ambient${i})`}
          />
        ))}
      </Svg>
    </View>
  );
}

const s = StyleSheet.create({
  root: { backgroundColor: '#000000' },
});

export default AmbientBackdrop;
