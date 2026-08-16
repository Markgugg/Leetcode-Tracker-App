/**
 * Topic Coverage radar with a morphing polygon (§4 + §1 "radar morph").
 *
 * `src/components/RadarChart.tsx` renders the same geometry but re-mounts its
 * polygon on every value change, so switching the range or toggling the crew
 * overlay snapped instead of animating. This version keeps the canonical §4
 * geometry and animates:
 *
 *   • the coverage polygon + its vertices — 700ms cubic-bezier(.22,1,.36,1)
 *     between whatever is on screen right now and the new range's values
 *     (interrupting mid-flight is fine: the current interpolated shape becomes
 *     the new `from`, so a fast double-tap never jumps);
 *   • the crew-median polygon — the same morph on range change, plus a
 *     grow-from-centre + fade for the "Compare crew" toggle, so the dashed
 *     shape animates in and out rather than blinking.
 *
 * Everything that is not a shape (labels, vertex colours) is plain React: they
 * are discrete, not interpolatable, and re-render with the range.
 *
 * Both shapes are drawn as closed Catmull-Rom splines rather than polygons, so
 * one tall axis beside two empty ones reads as a soft lobe instead of a needle
 * (see `pathOf`). The morph still animates the eight underlying values; the
 * curve is rebuilt from them on the UI thread every frame.
 */
import React, { useEffect, useRef } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Line,
  Path,
  Polygon,
  RadialGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { EASE, duration } from '@/theme';

/* §4 — canonical geometry. */
const VB_W = 290;
const VB_H = 250;
const CX = 145;
const CY = 122;
const MAX_R = 88;
const N = 8;
const LABEL_R = MAX_R + 21;
const GRID_RINGS = [0.25, 0.5, 0.75, 1];
/**
 * Visual floor for a plotted axis. Purely cosmetic: an axis with nothing on it
 * still sits a little off the centre point, so a lone high axis reads as a lobe
 * on a small body rather than a needle stabbing out of a single pixel. The data
 * itself (`axisValue`, the "thinnest axis" callout, the % in the sheet) is
 * untouched — only the radius we draw is floored.
 */
const MIN_V = 0.1;
/** Catmull-Rom tension. 0.5 is the classic uniform Catmull-Rom tangent scale. */
const TENSION = 0.5;

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Vertex dot / label colour by value (§4). */
export function vertexColor(v: number) {
  return v < 0.35 ? '#FA114F' : v < 0.6 ? '#FFD426' : '#A2F73D';
}

function angleOf(i: number) {
  'worklet';
  return ((-90 + i * (360 / N)) * Math.PI) / 180;
}

/** Floored plot radius, in viewBox units, for a 0–1 axis value. */
function radiusOf(v: number) {
  'worklet';
  return Math.max(v, MIN_V) * MAX_R;
}

function pointAt(i: number, r: number) {
  'worklet';
  const a = angleOf(i);
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

function vertexAt(i: number, v: number) {
  'worklet';
  return pointAt(i, radiusOf(v));
}

/** Linear blend of two equal-length value arrays. */
function mixValues(a: number[], b: number[], t: number): number[] {
  'worklet';
  const out: number[] = [];
  for (let i = 0; i < b.length; i++) {
    const from = i < a.length ? a[i] : 0;
    out.push(from + (b[i] - from) * t);
  }
  return out;
}

/**
 * Pull a control point back inside the plot annulus.
 *
 * A cubic bezier lies inside the convex hull of its four control points, so
 * capping every control point at the outer ring guarantees the drawn curve
 * never escapes the grid. Pushing them out to the floor radius likewise stops
 * the curve from diving through the centre between two empty axes.
 */
/**
 * Radius of the outer grid octagon at an arbitrary angle. The rings are drawn
 * as polygons, not circles, so "inside the grid" means inside the octagon —
 * capping at MAX_R alone would let a full-coverage curve bulge past the edges
 * between two vertices.
 */
function ringRadiusAt(theta: number) {
  'worklet';
  const step = (2 * Math.PI) / N;
  const half = step / 2;
  const a0 = -Math.PI / 2;
  let d = (theta - a0) % step;
  if (d < 0) d += step;
  return (MAX_R * Math.cos(half)) / Math.cos(d - half);
}

function clampToAnnulus(x: number, y: number, scale: number) {
  'worklet';
  const dx = x - CX;
  const dy = y - CY;
  const d = Math.sqrt(dx * dx + dy * dy);
  const lo = MIN_V * MAX_R * scale;
  const hi = ringRadiusAt(Math.atan2(dy, dx)) * scale;
  if (d < 1e-6) return { x: CX, y: CY + lo };
  const r = d < lo ? lo : d > hi ? hi : d;
  const k = r / d;
  return { x: CX + dx * k, y: CY + dy * k };
}

/**
 * Keep one segment from sagging through the floor.
 *
 * Capping control-point radii bounds the curve from outside (convex hull), but
 * not from inside: next to a tall axis the neighbour's tangent points inward
 * and can pull the curve below the floor. Sampling the segment and easing its
 * control points back toward their anchors flattens just that segment until it
 * clears the floor ring, leaving the rest of the shape as smooth as before.
 */
function relaxToFloor(
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  c1: { x: number; y: number },
  c2: { x: number; y: number },
  scale: number,
) {
  'worklet';
  const lo = MIN_V * MAX_R * Math.cos(Math.PI / N) * scale;
  let a1 = c1;
  let a2 = c2;
  for (let pass = 0; pass < 5; pass++) {
    let ok = true;
    for (let t = 0.2; t < 0.85; t += 0.2) {
      const u = 1 - t;
      const x = u * u * u * p1x + 3 * u * u * t * a1.x + 3 * u * t * t * a2.x + t * t * t * p2x;
      const y = u * u * u * p1y + 3 * u * u * t * a1.y + 3 * u * t * t * a2.y + t * t * t * p2y;
      const dx = x - CX;
      const dy = y - CY;
      if (Math.sqrt(dx * dx + dy * dy) < lo) {
        ok = false;
        break;
      }
    }
    if (ok) break;
    a1 = { x: p1x + (a1.x - p1x) * 0.5, y: p1y + (a1.y - p1y) * 0.5 };
    a2 = { x: p2x + (a2.x - p2x) * 0.5, y: p2y + (a2.y - p2y) * 0.5 };
  }
  return { a1, a2 };
}

/**
 * Closed path for a value array, optionally collapsed toward centre.
 *
 * The eight axis points are joined with a *closed uniform Catmull-Rom spline*
 * converted segment-by-segment to cubic beziers, instead of straight lines:
 * for the segment p1→p2 the tangents are `TENSION·(p2−p0)` and
 * `TENSION·(p3−p1)`, so each control point is `p1 + TENSION·(p2−p0)/3` and
 * `p2 − TENSION·(p3−p1)/3`. Because the spline still interpolates every p_i,
 * the curve passes exactly through the plotted vertices — one tall axis next to
 * two empty ones becomes a rounded lobe rather than a sharp needle.
 *
 * A `<Path d>` rather than a `<Polygon points>`: `d` is the prop react-native-svg
 * reliably accepts from an animated (native-driven) update on both platforms.
 */
function pathOf(values: number[], scale: number): string {
  'worklet';
  const n = values.length;
  if (n === 0) return '';
  const px: number[] = [];
  const py: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = pointAt(i, radiusOf(values[i]) * scale);
    px.push(p.x);
    py.push(p.y);
  }
  if (n < 3) {
    let flat = '';
    for (let i = 0; i < n; i++) {
      flat += `${i === 0 ? 'M' : 'L'}${px[i].toFixed(2)} ${py[i].toFixed(2)}`;
    }
    return `${flat}Z`;
  }

  let out = `M${px[0].toFixed(2)} ${py[0].toFixed(2)}`;
  const k = TENSION / 3;
  for (let i = 0; i < n; i++) {
    const i0 = (i - 1 + n) % n;
    const i1 = i;
    const i2 = (i + 1) % n;
    const i3 = (i + 2) % n;
    const h1 = clampToAnnulus(px[i1] + (px[i2] - px[i0]) * k, py[i1] + (py[i2] - py[i0]) * k, scale);
    const h2 = clampToAnnulus(px[i2] - (px[i3] - px[i1]) * k, py[i2] - (py[i3] - py[i1]) * k, scale);
    const { a1: c1, a2: c2 } = relaxToFloor(px[i1], py[i1], px[i2], py[i2], h1, h2, scale);
    out +=
      `C${c1.x.toFixed(2)} ${c1.y.toFixed(2)}` +
      ` ${c2.x.toFixed(2)} ${c2.y.toFixed(2)}` +
      ` ${px[i2].toFixed(2)} ${py[i2].toFixed(2)}`;
  }
  return `${out}Z`;
}

function staticPoints(values: number[]) {
  return values
    .map((v, i) => {
      const a = ((-90 + i * (360 / N)) * Math.PI) / 180;
      const r = Math.max(v, MIN_V) * MAX_R;
      return `${(CX + r * Math.cos(a)).toFixed(2)},${(CY + r * Math.sin(a)).toFixed(2)}`;
    })
    .join(' ');
}

function anchorFor(i: number): 'start' | 'middle' | 'end' {
  const c = Math.cos(((-90 + i * (360 / N)) * Math.PI) / 180);
  return c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle';
}

export interface MorphRadarProps {
  /** Eight labels, in §4 axis order. */
  labels: string[];
  /** Eight plotted values, 0–1 (see `axisValue`). */
  values: number[];
  /** Crew median, same order — `null` when the user has no crew. */
  median?: number[] | null;
  /** Whether the dashed median polygon is showing. */
  showMedian?: boolean;
  /** Rendered width; height follows the 290:250 viewBox. */
  width?: number;
  /** Run the 850ms `radarIn` scale-from-centre on mount. Default true. */
  animate?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function MorphRadar({
  labels,
  values,
  median = null,
  showMedian = false,
  width = 290,
  animate = true,
  style,
}: MorphRadarProps) {
  const height = (width * VB_H) / VB_W;

  /* ---- entry: radarIn, scale .05 → 1 from the chart's centre point ---- */
  const enter = useSharedValue(animate ? 0.05 : 1);
  useEffect(() => {
    enter.value = withTiming(1, {
      duration: animate ? duration.radarIn : 0,
      easing: Easing.bezier(...EASE.standard),
    });
  }, [animate]);
  const enterStyle = useAnimatedStyle(() => ({ transform: [{ scale: enter.value }] }));

  /* ---- coverage polygon morph ---- */
  const from = useSharedValue<number[]>(values);
  const to = useSharedValue<number[]>(values);
  const t = useSharedValue(1);
  const started = useRef(false);
  const key = values.join(',');

  useEffect(() => {
    if (!started.current) {
      started.current = true;
      from.value = values;
      to.value = values;
      t.value = 1;
      return;
    }
    // Interrupt-safe: whatever is on screen right now becomes the new origin.
    const current = mixValues(from.value, to.value, t.value);
    cancelAnimation(t);
    from.value = current;
    to.value = values;
    t.value = 0;
    t.value = withTiming(1, {
      duration: duration.radarMorph,
      easing: Easing.bezier(...EASE.standard),
    });
  }, [key]);

  const polyProps = useAnimatedProps(() => ({
    d: pathOf(mixValues(from.value, to.value, t.value), 1),
  }));

  /* ---- crew median: morph on range change, grow/fade on toggle ---- */
  const medianValues = median ?? values.map(() => 0);
  const medFrom = useSharedValue<number[]>(medianValues);
  const medTo = useSharedValue<number[]>(medianValues);
  const medT = useSharedValue(1);
  const medKey = medianValues.join(',');
  const medStarted = useRef(false);

  useEffect(() => {
    if (!medStarted.current) {
      medStarted.current = true;
      medFrom.value = medianValues;
      medTo.value = medianValues;
      medT.value = 1;
      return;
    }
    const current = mixValues(medFrom.value, medTo.value, medT.value);
    cancelAnimation(medT);
    medFrom.value = current;
    medTo.value = medianValues;
    medT.value = 0;
    medT.value = withTiming(1, {
      duration: duration.radarMorph,
      easing: Easing.bezier(...EASE.standard),
    });
  }, [medKey]);

  const on = showMedian && !!median;
  const reveal = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    cancelAnimation(reveal);
    reveal.value = withTiming(on ? 1 : 0, {
      duration: duration.radarMorph,
      easing: Easing.bezier(...EASE.standard),
    });
  }, [on]);

  const medianProps = useAnimatedProps(() => {
    const r = reveal.value;
    return {
      // grows out of the centre as it fades in, collapses back on the way out
      d: pathOf(mixValues(medFrom.value, medTo.value, medT.value), r),
      opacity: r,
    };
  });

  return (
    <Animated.View
      style={[
        { width, height, transformOrigin: `${(CX / VB_W) * 100}% ${(CY / VB_H) * 100}%` },
        enterStyle,
        style,
      ]}>
      <Svg width={width} height={height} viewBox={`0 0 ${VB_W} ${VB_H}`}>
        <Defs>
          <RadialGradient id="mrGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#A2F73D" stopOpacity={0.16} />
            <Stop offset="1" stopColor="#A2F73D" stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="mrFill" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#A2F73D" stopOpacity={0.5} />
            <Stop offset="1" stopColor="#00D3F2" stopOpacity={0.35} />
          </LinearGradient>
        </Defs>

        <Circle cx={CX} cy={CY} r={94} fill="url(#mrGlow)" />

        {GRID_RINGS.map((g) => (
          <Polygon
            key={g}
            points={staticPoints(Array.from({ length: N }, () => g))}
            fill="none"
            stroke="rgba(255,255,255,0.09)"
            strokeWidth={1}
          />
        ))}

        {Array.from({ length: N }, (_, i) => {
          const a = ((-90 + i * (360 / N)) * Math.PI) / 180;
          return (
            <Line
              key={i}
              x1={CX}
              y1={CY}
              x2={CX + MAX_R * Math.cos(a)}
              y2={CY + MAX_R * Math.sin(a)}
              stroke="rgba(255,255,255,0.07)"
              strokeWidth={1}
            />
          );
        })}

        {/* crew median — always mounted so it can animate out */}
        {median ? (
          <AnimatedPath
            animatedProps={medianProps}
            fill="rgba(255,255,255,0.05)"
            stroke="rgba(255,255,255,0.32)"
            strokeWidth={1.5}
            strokeDasharray="3 4"
            strokeLinejoin="round"
          />
        ) : null}

        {/* my coverage */}
        <AnimatedPath
          animatedProps={polyProps}
          fill="url(#mrFill)"
          stroke="#A2F73D"
          strokeWidth={2.4}
          strokeLinejoin="round"
        />

        {values.map((v, i) => (
          <Vertex key={i} index={i} from={from} to={to} t={t} color={vertexColor(v)} />
        ))}

        {labels.map((label, i) => {
          const a = ((-90 + i * (360 / N)) * Math.PI) / 180;
          const weak = (values[i] ?? 0) < 0.35;
          return (
            <SvgText
              key={label}
              x={CX + LABEL_R * Math.cos(a)}
              y={CY + LABEL_R * Math.sin(a) + 3.5}
              fontSize={10.5}
              fontWeight="600"
              letterSpacing={0.2}
              textAnchor={anchorFor(i)}
              fill={weak ? '#FA114F' : 'rgba(235,235,245,0.72)'}>
              {label}
            </SvgText>
          );
        })}
      </Svg>
    </Animated.View>
  );
}

/** One vertex dot. Its own component so the hook count stays fixed at eight. */
function Vertex({
  index,
  from,
  to,
  t,
  color,
}: {
  index: number;
  from: SharedValue<number[]>;
  to: SharedValue<number[]>;
  t: SharedValue<number>;
  color: string;
}) {
  const props = useAnimatedProps(() => {
    const vals = mixValues(from.value, to.value, t.value);
    const p = vertexAt(index, vals[index] ?? 0);
    return { cx: p.x, cy: p.y };
  });
  return <AnimatedCircle animatedProps={props} r={3.4} fill={color} />;
}

export default MorphRadar;
