import { useMemo } from 'react';
import Svg, { Defs, LinearGradient, Stop, Polygon } from 'react-native-svg';
import { Rank, RankKey, rankByKey } from './ranks-data';

function hex(cx: number, cy: number, r: number): [number, number][] {
  return [90, 150, 210, 270, 330, 30].map(d => {
    const a = (d * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy - r * Math.sin(a)] as [number, number];
  });
}
const str = (pts: [number, number][]) =>
  pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');

let UID = 0;

export function GemChip({ tier, size = 30 }: { tier: RankKey | Rank; size?: number }) {
  const t: Rank = typeof tier === 'string' ? rankByKey(tier) : tier;
  const uid = useMemo(() => 'gc' + UID++, []);
  const cx = 18, cy = 18, rg = 13, ri = 6;
  const outer = hex(cx, cy, rg);
  const inner = hex(cx, cy, ri);
  const frame = hex(cx, cy, 16.5);

  const facets: { pts: [number, number][]; col: string }[] = [];
  for (let i = 0; i < 6; i++) {
    const a = outer[i], b = outer[(i + 1) % 6], c = inner[(i + 1) % 6], d = inner[i];
    const my = (a[1] + b[1] + c[1] + d[1]) / 4;
    facets.push({ pts: [a, b, c, d], col: my < cy - 3 ? t.g[0] : my < cy + 3 ? t.g[1] : t.g[2] });
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 36 36">
      <Defs>
        <LinearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%"   stopColor={t.frame[0]} />
          <Stop offset="100%" stopColor={t.frame[2]} />
        </LinearGradient>
      </Defs>
      <Polygon points={str(frame)} fill={`url(#${uid})`} stroke={t.frame[2]} strokeWidth={1} strokeLinejoin="round" />
      {facets.map((f, i) => (
        <Polygon key={i} points={str(f.pts)} fill={f.col} stroke="rgba(0,0,0,0.12)" strokeWidth={0.4} />
      ))}
      <Polygon points={str(inner)} fill={t.table} />
    </Svg>
  );
}

export default GemChip;
