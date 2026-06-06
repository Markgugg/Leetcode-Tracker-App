export type RankKey =
  | 'bronze' | 'silver' | 'gold' | 'jade' | 'sapphire'
  | 'amethyst' | 'ruby' | 'diamond' | 'grandmaster';

export interface RankOrn {
  wings?: 'sm' | 'md' | 'lg';
  crown?: 1;
  horns?: 'soft' | 'hard';
  ribbon?: 1;
  bolt?: 1;
}

export interface Rank {
  key: RankKey;
  name: string;
  thr: number;
  g: [string, string, string];
  frame: [string, string, string];
  wing: [string, string];
  table: string;
  glow: string;
  dark?: 1;
  orn: RankOrn;
}

export const RANKS: Rank[] = [
  { key: 'bronze',      name: 'Bronze',      thr: 0,    g: ['#F0C79A','#C8854A','#8A5026'], frame: ['#F0D2AE','#A36F40','#5E3A1E'], wing: ['#E6C49E','#A06F42'], table: '#F6DDBE', glow: '#C8854A', orn: { ribbon: 1 } },
  { key: 'silver',      name: 'Silver',      thr: 25,   g: ['#FBFDFF','#C7D2DE','#8A97A6'], frame: ['#FFFFFF','#B4BFCB','#79838F'], wing: ['#EDF2F7','#9AA6B2'], table: '#FFFFFF', glow: '#C7D2DE', orn: { wings: 'sm', ribbon: 1 } },
  { key: 'gold',        name: 'Gold',        thr: 75,   g: ['#FFEEB0','#F5C842','#BD8E22'], frame: ['#FFF4C8','#E0AE34','#9C7620'], wing: ['#FFE9A0','#C79A2C'], table: '#FFF8D6', glow: '#F5C842', orn: { wings: 'sm', crown: 1, ribbon: 1 } },
  { key: 'jade',        name: 'Jade',        thr: 150,  g: ['#C6FFEC','#2BD4A0','#13916B'], frame: ['#DEFFF4','#39DEAE','#1A8060'], wing: ['#CFFFF0','#27B88C'], table: '#E2FFF6', glow: '#2BD4A0', orn: { wings: 'md' } },
  { key: 'sapphire',    name: 'Sapphire',    thr: 275,  g: ['#CDE6FF','#3B82F6','#1B4FB0'], frame: ['#E2EFFF','#5A95F8','#284F9E'], wing: ['#D4E7FF','#4E83E0'], table: '#E8F2FF', glow: '#3B82F6', orn: { wings: 'md', crown: 1 } },
  { key: 'amethyst',    name: 'Amethyst',    thr: 450,  g: ['#F0CFFF','#A855F7','#6921B8'], frame: ['#F6E0FF','#B96EF9','#7A30CC'], wing: ['#EED0FF','#9A4BE0'], table: '#F7E6FF', glow: '#A855F7', orn: { wings: 'md', horns: 'soft' } },
  { key: 'ruby',        name: 'Ruby',        thr: 650,  g: ['#FFC8CE','#F0436A','#9E1B37'], frame: ['#511620','#7E1E2C','#360F16'], wing: ['#7E1E2C','#420F18'], table: '#FFD8D2', glow: '#F0436A', dark: 1, orn: { horns: 'hard' } },
  { key: 'diamond',     name: 'Diamond',     thr: 900,  g: ['#EAFAFF','#9FDCFF','#54AEE6'], frame: ['#F2FCFF','#B6E4FF','#69B6EC'], wing: ['#E6F7FF','#86C9F2'], table: '#FFFFFF', glow: '#9FDCFF', orn: { wings: 'lg', crown: 1 } },
  { key: 'grandmaster', name: 'Grandmaster', thr: 1200, g: ['#D2D6FF','#6366F1','#3A2FC0'], frame: ['#FFF1B8','#E0AE34','#9C7620'], wing: ['#FFE9A0','#C79A2C'], table: '#E7E9FF', glow: '#6366F1', orn: { wings: 'lg', crown: 1, bolt: 1 } },
];

export const rankByKey = (k: RankKey): Rank => RANKS.find(r => r.key === k) ?? RANKS[0];

export const rankForSolves = (totalSolves: number): Rank => {
  let r = RANKS[0];
  for (const x of RANKS) if (totalSolves >= x.thr) r = x;
  return r;
};

export const nextRank = (k: RankKey): Rank | null => {
  const i = RANKS.findIndex(r => r.key === k);
  return i >= 0 && i < RANKS.length - 1 ? RANKS[i + 1] : null;
};

export const progressToNext = (totalSolves: number, k: RankKey): number => {
  const cur = rankByKey(k);
  const nx = nextRank(k);
  if (!nx) return 1;
  return Math.max(0, Math.min(1, (totalSolves - cur.thr) / (nx.thr - cur.thr)));
};
