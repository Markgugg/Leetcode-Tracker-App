import Svg, { Polygon, Line, Circle, Text as SvgText } from 'react-native-svg';

const SIZE = 300;
const CX = SIZE / 2;
const CY = SIZE / 2;
const MAX_R = 85;
const RINGS = 4;
const LABEL_R = MAX_R + 28;

export interface RadarAxis {
  label: string;
  value: number; // 0–1
}

function pt(angleIndex: number, n: number, r: number) {
  const a = (angleIndex / n) * Math.PI * 2 - Math.PI / 2;
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

function ringPoints(n: number, r: number) {
  return Array.from({ length: n }, (_, i) => {
    const { x, y } = pt(i, n, r);
    return `${x},${y}`;
  }).join(' ');
}

function textAnchor(i: number, n: number): 'start' | 'middle' | 'end' {
  const deg = (i / n) * 360;
  if (deg < 20 || deg > 340) return 'middle';
  if (deg > 160 && deg < 200) return 'middle';
  return deg < 180 ? 'start' : 'end';
}

function labelDy(i: number, n: number): number {
  const deg = (i / n) * 360;
  if (deg < 30 || deg > 330) return -6;
  if (deg > 150 && deg < 210) return 14;
  return 4;
}

interface Props {
  axes: RadarAxis[];
  color?: string;
  dimColor?: string;
}

export function RadarChart({ axes, color = '#6366F1', dimColor = 'rgba(255,255,255,0.07)' }: Props) {
  const n = axes.length;
  const dataPoints = axes.map((a, i) => {
    const { x, y } = pt(i, n, Math.max(a.value * MAX_R, 2));
    return `${x},${y}`;
  }).join(' ');

  return (
    <Svg width={SIZE} height={SIZE}>
      {/* Grid rings */}
      {Array.from({ length: RINGS }, (_, ring) => (
        <Polygon
          key={ring}
          points={ringPoints(n, (MAX_R * (ring + 1)) / RINGS)}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={1}
        />
      ))}

      {/* Axis spokes */}
      {axes.map((_, i) => {
        const outer = pt(i, n, MAX_R);
        return (
          <Line
            key={i}
            x1={CX} y1={CY}
            x2={outer.x} y2={outer.y}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={1}
          />
        );
      })}

      {/* Filled data polygon */}
      <Polygon
        points={dataPoints}
        fill={color + '28'}
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />

      {/* Dots at data points */}
      {axes.map((axis, i) => {
        const { x, y } = pt(i, n, Math.max(axis.value * MAX_R, 2));
        return (
          <Circle key={i} cx={x} cy={y} r={3.5} fill={color} />
        );
      })}

      {/* Labels */}
      {axes.map((axis, i) => {
        const { x, y } = pt(i, n, LABEL_R);
        return (
          <SvgText
            key={i}
            x={x}
            y={y + labelDy(i, n)}
            textAnchor={textAnchor(i, n)}
            fontSize={9.5}
            fontWeight="600"
            fill="rgba(139,148,158,0.9)"
          >
            {axis.label}
          </SvgText>
        );
      })}
    </Svg>
  );
}
