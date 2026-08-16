import React, { useEffect } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Line,
  Polygon,
  RadialGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { EASE, duration } from '@/theme';

/* §4 — canonical geometry. Do not change these; the label offsets and the
   `radarIn` origin are derived from them. */
const VB_W = 290;
const VB_H = 250;
const CX = 145;
const CY = 122;
const MAX_R = 88;
const N = 8;
const LABEL_R = MAX_R + 21;
const GRID_RINGS = [0.25, 0.5, 0.75, 1];

export interface RadarAxis {
  label: string;
  /** 0–1, already scaled (see `axisValue` in the Summary data layer). */
  value: number;
}

/** Vertex dot color by value (§4). */
export function vertexColor(v: number) {
  return v < 0.35 ? '#FA114F' : v < 0.6 ? '#FFD426' : '#A2F73D';
}

/** i-th axis angle: -90° + i×45°. */
function pt(i: number, r: number) {
  const a = ((-90 + i * (360 / N)) * Math.PI) / 180;
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

function poly(values: number[]) {
  return values
    .map((v, i) => {
      const { x, y } = pt(i, Math.max(v, 0.02) * MAX_R);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

function octagon(scale: number) {
  return Array.from({ length: N }, (_, i) => {
    const { x, y } = pt(i, MAX_R * scale);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

function anchorFor(i: number): 'start' | 'middle' | 'end' {
  const a = ((-90 + i * (360 / N)) * Math.PI) / 180;
  const c = Math.cos(a);
  return c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle';
}

export interface RadarChartProps {
  axes: RadarAxis[];
  /** Crew median overlay — the dashed polygon, toggled by "Compare crew". */
  compare?: number[] | null;
  /** Rendered width; height follows the 290:250 viewBox. */
  width?: number;
  /** Run the 850ms `radarIn` scale-from-center on mount. Default true. */
  animate?: boolean;
  style?: StyleProp<ViewStyle>;
  /** @deprecated legacy props from the pre-redesign chart; ignored. */
  color?: string;
  /** @deprecated */
  dimColor?: string;
}

/**
 * Topic Coverage radar (§4). Eight axes at -90° + i×45°, a lime→cyan gradient
 * fill, value-colored vertices, and labels that turn `#FA114F` when their axis
 * is below .35 — "the weak axes name themselves".
 */
export function RadarChart({
  axes,
  compare = null,
  width = 290,
  animate = true,
  style,
}: RadarChartProps) {
  const values = axes.map((a) => a.value);
  const height = (width * VB_H) / VB_W;

  const scale = useSharedValue(animate ? 0.05 : 1);
  useEffect(() => {
    scale.value = withTiming(1, {
      duration: animate ? duration.radarIn : 0,
      easing: Easing.bezier(...EASE.standard),
    });
  }, [animate]);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      style={[
        { width, height, transformOrigin: `${(CX / VB_W) * 100}% ${(CY / VB_H) * 100}%` },
        animStyle,
        style,
      ]}>
      <Svg width={width} height={height} viewBox={`0 0 ${VB_W} ${VB_H}`}>
        <Defs>
          <RadialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#A2F73D" stopOpacity={0.16} />
            <Stop offset="1" stopColor="#A2F73D" stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="radarFill" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#A2F73D" stopOpacity={0.5} />
            <Stop offset="1" stopColor="#00D3F2" stopOpacity={0.35} />
          </LinearGradient>
        </Defs>

        {/* glow */}
        <Circle cx={CX} cy={CY} r={94} fill="url(#radarGlow)" />

        {/* grid octagons at 25/50/75/100% */}
        {GRID_RINGS.map((g) => (
          <Polygon
            key={g}
            points={octagon(g)}
            fill="none"
            stroke="rgba(255,255,255,0.09)"
            strokeWidth={1}
          />
        ))}

        {/* spokes */}
        {Array.from({ length: N }, (_, i) => {
          const o = pt(i, MAX_R);
          return (
            <Line
              key={i}
              x1={CX}
              y1={CY}
              x2={o.x}
              y2={o.y}
              stroke="rgba(255,255,255,0.07)"
              strokeWidth={1}
            />
          );
        })}

        {/* crew median */}
        {compare ? (
          <Polygon
            points={poly(compare)}
            fill="rgba(255,255,255,0.05)"
            stroke="rgba(255,255,255,0.32)"
            strokeWidth={1.5}
            strokeDasharray="3 4"
            strokeLinejoin="round"
          />
        ) : null}

        {/* my coverage */}
        <Polygon
          points={poly(values)}
          fill="url(#radarFill)"
          stroke="#A2F73D"
          strokeWidth={2.4}
          strokeLinejoin="round"
        />

        {/* vertices */}
        {values.map((v, i) => {
          const { x, y } = pt(i, Math.max(v, 0.02) * MAX_R);
          return <Circle key={i} cx={x} cy={y} r={3.4} fill={vertexColor(v)} />;
        })}

        {/* labels */}
        {axes.map((a, i) => {
          const { x, y } = pt(i, LABEL_R);
          const weak = a.value < 0.35;
          return (
            <SvgText
              key={a.label}
              x={x}
              y={y + 3.5}
              fontSize={10.5}
              fontWeight="600"
              letterSpacing={0.2}
              textAnchor={anchorFor(i)}
              fill={weak ? '#FA114F' : 'rgba(235,235,245,0.72)'}>
              {a.label}
            </SvgText>
          );
        })}
      </Svg>
    </Animated.View>
  );
}

export default RadarChart;
