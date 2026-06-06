import { useMemo } from 'react';
import Svg, { Defs, RadialGradient, LinearGradient, Stop, Ellipse, Polygon } from 'react-native-svg';
import { Rank, RankKey, rankByKey } from './ranks-data';

function hex(cx: number, cy: number, r: number): [number, number][] {
  return [90, 150, 210, 270, 330, 30].map(d => {
    const a = (d * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy - r * Math.sin(a)] as [number, number];
  });
}
const str = (pts: [number, number][]) =>
  pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');

function wing(ax: number, ay: number, cx: number, scale: number, flip: boolean) {
  const S = scale;
  const raw: [number, number][][] = [
    [[-2, 0], [34 * S, -19 * S], [9, -3]],
    [[-2, 6], [29 * S, -6 * S], [7, 4]],
    [[-2, 12], [22 * S, 7 * S], [5, 11]],
  ];
  return raw.map(tri =>
    tri.map(([x, y]) => {
      const px = flip ? cx - (ax + x - cx) : ax + x;
      return [px, ay + y] as [number, number];
    }),
  );
}

let UID = 0;

export function GemBadge({ tier, size = 130 }: { tier: RankKey | Rank; size?: number }) {
  const t: Rank = typeof tier === 'string' ? rankByKey(tier) : tier;
  const uid = useMemo(() => 'gm' + UID++, []);
  const VBW = 130, VBH = 138, cx = 65, cy = 66, rg = 30, rf = 37, ri = 14;
  const outer = hex(cx, cy, rg);
  const inner = hex(cx, cy, ri);
  const frame = hex(cx, cy, rf);
  const edge  = hex(cx, cy, rf - 3.5);

  const facets: { pts: [number, number][]; col: string }[] = [];
  for (let i = 0; i < 6; i++) {
    const a = outer[i], b = outer[(i + 1) % 6], c = inner[(i + 1) % 6], d = inner[i];
    const my = (a[1] + b[1] + c[1] + d[1]) / 4;
    const col = my < cy - 8 ? t.g[0] : my < cy + 6 ? t.g[1] : t.g[2];
    facets.push({ pts: [a, b, c, d], col });
  }

  const o = t.orn || {};
  const wingScale = o.wings === 'lg' ? 1.25 : o.wings === 'md' ? 1.05 : o.wings === 'sm' ? 0.8 : 1;
  const ax = cx + rf - 9, ay = cy - 2;
  const wingsR = o.wings ? wing(ax, ay, cx, wingScale, false) : [];
  const wingsL = o.wings ? wing(ax, ay, cx, wingScale, true) : [];

  return (
    <Svg width={size} height={(size * VBH) / VBW} viewBox={`0 0 ${VBW} ${VBH}`}>
      <Defs>
        <RadialGradient id={uid + 'glow'} cx="50%" cy="46%" r="55%">
          <Stop offset="0%" stopColor={t.glow} stopOpacity={0.55} />
          <Stop offset="100%" stopColor={t.glow} stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id={uid + 'frame'} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%"   stopColor={t.frame[0]} />
          <Stop offset="55%"  stopColor={t.frame[1]} />
          <Stop offset="100%" stopColor={t.frame[2]} />
        </LinearGradient>
        <LinearGradient id={uid + 'wing'} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%"   stopColor={t.wing[0]} />
          <Stop offset="100%" stopColor={t.wing[1]} />
        </LinearGradient>
      </Defs>

      <Ellipse cx={cx} cy={cy} rx={62} ry={60} fill={`url(#${uid}glow)`} />

      {[...wingsL, ...wingsR].map((tri, i) => (
        <Polygon key={'w' + i} points={str(tri)} fill={`url(#${uid}wing)`} stroke={t.wing[1]} strokeWidth={0.6} strokeLinejoin="round" opacity={0.96} />
      ))}

      {o.horns && ([-1, 1] as const).map((s, i) => (
        <Polygon key={'h' + i}
          points={str([
            [cx + s * (rf * 0.62), cy - rf * 0.34],
            [cx + s * (rf + (o.horns === 'hard' ? 14 : 8)), cy - rf - (o.horns === 'hard' ? 16 : 8)],
            [cx + s * (rf * 0.3), cy - rf * 0.16],
          ])}
          fill={t.dark ? t.frame[1] : `url(#${uid}wing)`}
          stroke={t.frame[2]} strokeWidth={0.6} strokeLinejoin="round"
        />
      ))}

      {o.crown && ([[0, 13, 6], [-11, 8, 4.5], [11, 8, 4.5]] as const).map(([dx, h, w], i) => (
        <Polygon key={'c' + i}
          points={str([[cx + dx, cy - rf - h], [cx + dx - w, cy - rf + 2], [cx + dx + w, cy - rf + 2]])}
          fill={`url(#${uid}frame)`} stroke={t.frame[2]} strokeWidth={0.5} strokeLinejoin="round"
        />
      ))}

      {o.ribbon && (
        <Polygon
          points={str([[cx - 16, cy + rf - 6], [cx + 16, cy + rf - 6], [cx + 11, cy + rf + 14], [cx, cy + rf + 8], [cx - 11, cy + rf + 14]])}
          fill={`url(#${uid}frame)`} stroke={t.frame[2]} strokeWidth={0.6} strokeLinejoin="round"
        />
      )}

      <Polygon points={str(frame)} fill={`url(#${uid}frame)`} stroke={t.frame[2]} strokeWidth={1.4} strokeLinejoin="round" />
      <Polygon points={str(edge)}  fill="none" stroke={t.frame[0]} strokeOpacity={0.55} strokeWidth={1} strokeLinejoin="round" />

      {facets.map((f, i) => (
        <Polygon key={'f' + i} points={str(f.pts)} fill={f.col} stroke="rgba(0,0,0,0.14)" strokeWidth={0.5} strokeLinejoin="round" />
      ))}

      <Polygon points={str(inner)} fill={t.table} stroke="rgba(255,255,255,0.6)" strokeWidth={0.6} strokeLinejoin="round" />
      <Polygon points={str([outer[0], outer[1], inner[1], inner[0]])} fill="#fff" opacity={0.22} />

      {o.bolt && (
        <Polygon
          points={str([[cx + 30, cy - 40], [cx + 22, cy - 24], [cx + 29, cy - 24], [cx + 20, cy - 6], [cx + 38, cy - 28], [cx + 30, cy - 28]])}
          fill="#FFD33D" stroke="#C79A2C" strokeWidth={0.7} strokeLinejoin="round"
        />
      )}
    </Svg>
  );
}

export default GemBadge;
