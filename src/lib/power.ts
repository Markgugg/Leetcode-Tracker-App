// Power Level — extracted verbatim from log.tsx so You/Squad can show the same
// number Stats computes. Formula: difficulty score + breadth bonus + consistency bonus.

import type { LcStats, RadarAxis } from './leetcode';

export const POWER_RANKS = [
  { min: 0,     label: 'Unranked',  color: '#6E7681' },
  { min: 100,   label: 'Bronze',    color: '#CD7F32' },
  { min: 500,   label: 'Silver',    color: '#C0C0C0' },
  { min: 1500,  label: 'Gold',      color: '#D29922' },
  { min: 4000,  label: 'Platinum',  color: '#4FC3F7' },
  { min: 9000,  label: 'Diamond',   color: '#9C6ADE' },
  { min: 18000, label: 'Master',    color: '#F85149' },
  { min: 35000, label: 'Legendary', color: '#FF9800' },
];

export function getPowerRank(level: number) {
  for (let i = POWER_RANKS.length - 1; i >= 0; i--) {
    if (level >= POWER_RANKS[i].min) return { ...POWER_RANKS[i], index: i };
  }
  return { ...POWER_RANKS[0], index: 0 };
}

export type PowerBreakdown = {
  total: number;
  diffScore: number;
  breadthBonus: number;
  consistencyBonus: number;
};

export function computePowerBreakdown(
  lcStats: LcStats | null | undefined,
  radarAxes: RadarAxis[],
  heatmapData: Map<string, number> | null | undefined,
): PowerBreakdown | null {
  if (!lcStats) return null;
  const diffScore = lcStats.easy * 10 + lcStats.medium * 25 + lcStats.hard * 60;
  const avgRadar = radarAxes.reduce((sum, a) => sum + a.value, 0) / (radarAxes.length || 1);
  const breadthBonus = Math.round(avgRadar * 500);
  let consistencyBonus = 0;
  if (heatmapData) {
    let activeDays = 0;
    for (let i = 0; i < 90; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      if ((heatmapData.get(d.toISOString().slice(0, 10)) ?? 0) > 0) activeDays++;
    }
    consistencyBonus = Math.round((activeDays / 90) * 300);
  }
  return { total: diffScore + breadthBonus + consistencyBonus, diffScore, breadthBonus, consistencyBonus };
}
