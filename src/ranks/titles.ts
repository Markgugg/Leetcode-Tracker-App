// Meme titles — cosmetic flavor shown under the handle, based on total solves.
// Hidden when profiles.serious_mode is on (Settings → Appearance).

export const TITLES = [
  { min: 0,   max: 10,  label: 'Homeless' },
  { min: 11,  max: 30,  label: 'Cooked' },
  { min: 31,  max: 70,  label: 'Underwater Technician' },
  { min: 71,  max: 130, label: 'Fries in Bag' },
  { min: 131, max: 220, label: 'Chud' },
  { min: 221, max: 350, label: 'Mtn Coder' },
  { min: 351, max: 500, label: 'Cracked' },
  { min: 501, max: 700, label: 'True CS Major' },
  { min: 701, max: 950, label: 'FAANG Slayer' },
  { min: 951, max: Infinity, label: 'One Piece' },
] as const;

export function getTitle(solved: number) {
  return TITLES.find(t => solved >= t.min && solved <= t.max) ?? TITLES[0];
}
