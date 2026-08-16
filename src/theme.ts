/**
 * LeetAI design tokens — rewritten from design_handoff/README.md §1.
 * Every value here is the exact value used in the prototype.
 *
 * This file is pure data (no react-native imports) so it can be used from
 * any module, including worklets and plain helpers.
 */

/* ------------------------------------------------------------------ */
/* Color                                                               */
/* ------------------------------------------------------------------ */

export const colors = {
  /* BACKGROUND */
  bg: '#000000',

  /* SURFACES — all of these are the *overlay* fill that sits on a BlurView.
     The web alpha is reduced ~0.15 because BlurView already darkens. */
  card: 'rgba(28,28,30,0.47)',
  cardWeb: 'rgba(28,28,30,0.62)',
  cardSmall: 'rgba(28,28,30,0.45)',
  sheet: 'rgba(30,30,34,0.75)',
  tabBar: 'rgba(28,28,30,0.59)',
  toast: 'rgba(44,44,48,0.77)',

  border: 'rgba(255,255,255,0.10)',
  borderSmall: 'rgba(255,255,255,0.09)',
  borderSheet: 'rgba(255,255,255,0.14)',
  borderTabBar: 'rgba(255,255,255,0.12)',
  borderToast: 'rgba(255,255,255,0.16)',
  borderOutline: 'rgba(255,255,255,0.16)',

  /* CONTROLS */
  control: 'rgba(120,120,128,0.24)',
  controlSelected: 'rgba(120,120,128,0.34)',
  controlAlt: 'rgba(120,120,128,0.28)',
  controlAlt30: 'rgba(120,120,128,0.30)',
  controlAlt32: 'rgba(120,120,128,0.32)',
  controlAlt26: 'rgba(120,120,128,0.26)',
  controlAlt16: 'rgba(120,120,128,0.16)',

  codeBlock: 'rgba(0,0,0,0.42)',
  hairline: 'rgba(255,255,255,0.08)',
  gridLine: 'rgba(255,255,255,0.07)',
  grabHandle: 'rgba(255,255,255,0.22)',
  overlay: 'rgba(0,0,0,0.55)',

  /* TEXT */
  text: '#FFFFFF',
  textSecondary: 'rgba(235,235,245,0.60)',
  textTertiary: 'rgba(235,235,245,0.45)',
  textQuaternary: 'rgba(235,235,245,0.35)',
  textDisabled: 'rgba(235,235,245,0.30)',
  textChartLabel: 'rgba(235,235,245,0.55)',
  textRingLegend: 'rgba(235,235,245,0.85)',
  textPlaceholder: 'rgba(235,235,245,0.32)',

  /* ACCENT — ours, not Apple's */
  accent: '#7B61FF',
  accentText: '#A594FF',
  accentSelectedFill: 'rgba(123,97,255,0.26)',
  accentSelectedBorder: 'rgba(123,97,255,0.60)',

  /* RINGS */
  volume: '#FA114F',
  volumeTrack: 'rgba(250,17,79,0.22)',
  difficulty: '#A2F73D',
  difficultyTrack: 'rgba(162,247,61,0.22)',
  streak: '#00D3F2',
  streakTrack: 'rgba(0,211,242,0.22)',

  /* DIFFICULTY */
  easy: '#A2F73D',
  easyBg: 'rgba(162,247,61,0.12)',
  easyBorder: 'rgba(162,247,61,0.40)',
  medium: '#FFD426',
  mediumBg: 'rgba(255,212,38,0.12)',
  mediumBorder: 'rgba(255,212,38,0.40)',
  hard: '#FA114F',
  hardBg: 'rgba(250,17,79,0.12)',
  hardBorder: 'rgba(250,17,79,0.40)',

  /* MISC */
  streakOrange: '#FF9F0A',
  gem: '#3B82F6',
  trendUp: '#A2F73D',
  trendDown: '#FF9F0A',

  /* LEGACY ALIASES — the old GitHub-dark names, remapped onto the new palette
     so not-yet-migrated screens keep compiling. Do not use in new code.
     Remaining consumers: app/interview/index.tsx + report.tsx, the only screens
     §3 never assigned a redesign owner. `cardAlt` is gone — its last consumer
     was src/components/QuotaRing.tsx, deleted (superseded by Ring.tsx). */
  textDim: 'rgba(235,235,245,0.60)',
  textLight: 'rgba(235,235,245,0.45)',
  accentLight: 'rgba(123,97,255,0.12)',
  accentDark: '#6A4EF0',
  success: '#A2F73D',
} as const;

/** GitHub-style heatmap ramp, 5 steps (§1 / §5). */
export const heatmapRamp = [
  'rgba(255,255,255,0.055)',
  'rgba(123,97,255,0.32)',
  'rgba(123,97,255,0.58)',
  'rgba(123,97,255,0.82)',
  '#A594FF',
] as const;

/** The three ambient radial glows that sit behind all content (§1). */
export const ambientGlows = [
  { color: 'rgba(250,17,79,0.13)', w: 420, h: 300, x: 0.78, y: 0.04 },
  { color: 'rgba(0,211,242,0.09)', w: 400, h: 340, x: 0.08, y: 0.34 },
  { color: 'rgba(162,247,61,0.07)', w: 460, h: 320, x: 0.6, y: 0.92 },
] as const;

/* ------------------------------------------------------------------ */
/* Blur intensities — blur(Npx) → BlurView intensity                    */
/* ------------------------------------------------------------------ */

export const blur = {
  card: 40, // web 34
  cardSmall: 34, // web 30
  sheet: 60, // web 50
  tabBar: 45, // web 40
  toast: 34, // web 30
  overlay: 8,
} as const;

/* ------------------------------------------------------------------ */
/* Radius / spacing / stroke                                           */
/* ------------------------------------------------------------------ */

export const radius = {
  chip: 9,
  segmentTrack: 11,
  segment: 9,
  iconSquare: 16,
  code: 20,
  bubble: 20,
  input: 22,
  smallCard: 22,
  card: 26,
  cardLarge: 28,
  pill: 28,
  tabBar: 32,
  tabItem: 27,
  sheet: 34,
  round: 999,
  /* legacy aliases — last consumers are app/interview/*.tsx */
  sm: 9,
  md: 16,
  lg: 22,
  xl: 28,
} as const;

export const spacing = {
  screenH: 20,
  screenHOnboarding: 22,
  cardPadding: 20,
  sheetPadding: 22,
  cardGap: 14,
  cardGapTight: 12,
  sectionGap: 24,
  rowV: 12,
  contentBottom: 120,
} as const;

export const stroke = {
  mainRing: 20,
  dayRing: 5,
  crewRing: 4,
  pathwayRing: 5,
  continueRing: 6,
  hairline: 0.5,
} as const;

export const space = (n: number) => n * 4;

/* ------------------------------------------------------------------ */
/* Typography (§1) — SF Pro / system                                    */
/* ------------------------------------------------------------------ */

type W = '200' | '400' | '500' | '600' | '700' | '800';

export const type = {
  largeTitle: { fontSize: 34, fontWeight: '800' as W, letterSpacing: -1.3 },
  onboardingTitle: { fontSize: 33, fontWeight: '800' as W, letterSpacing: -1.3, lineHeight: 36 },
  onboardingTitleGoal: { fontSize: 30, fontWeight: '800' as W, letterSpacing: -1.1, lineHeight: 33 },
  heroDisplay: { fontSize: 44, fontWeight: '800' as W, letterSpacing: -2, lineHeight: 45 },
  sheetTitle: { fontSize: 27, fontWeight: '700' as W, letterSpacing: -0.9 },
  screenSubtitle: { fontSize: 30, fontWeight: '800' as W, letterSpacing: -1.1 },
  cardTitle: { fontSize: 20, fontWeight: '700' as W, letterSpacing: -0.4 },
  cardTitleSm: { fontSize: 19, fontWeight: '700' as W, letterSpacing: -0.4 },
  problemTitle: { fontSize: 22, fontWeight: '700' as W, letterSpacing: -0.7, lineHeight: 26 },
  body: { fontSize: 16, fontWeight: '400' as W, lineHeight: 23 },
  bodyRow: { fontSize: 15.5, fontWeight: '500' as W },
  bodySecondary: { fontSize: 13.5, fontWeight: '400' as W, lineHeight: 20 },
  caption: { fontSize: 12.5, fontWeight: '400' as W },
  microLabel: { fontSize: 11.5, fontWeight: '600' as W, letterSpacing: 0.6 },
  chartLabel: { fontSize: 10, fontWeight: '600' as W, letterSpacing: -0.1 },
  ringValue: { fontSize: 21, fontWeight: '600' as W, letterSpacing: -0.6 },
  ringUnit: { fontSize: 12, fontWeight: '700' as W, letterSpacing: 0.2 },
  goalNumeral: { fontSize: 74, fontWeight: '600' as W, letterSpacing: -3.5 },
  statNumeral: { fontSize: 30, fontWeight: '700' as W, letterSpacing: -1 },
  statNumeralSm: { fontSize: 26, fontWeight: '600' as W, letterSpacing: -0.8 },
  tabLabel: { fontSize: 10, fontWeight: '600' as W },
  buttonLabel: { fontSize: 17, fontWeight: '600' as W },
  buttonLabelInline: { fontSize: 16, fontWeight: '600' as W },
} as const;

/** Put on every changing numeral so digits don't jitter. */
export const tabular = { fontVariant: ['tabular-nums' as const] };

/* ------------------------------------------------------------------ */
/* Motion (§1)                                                          */
/* ------------------------------------------------------------------ */

/** cubic-bezier control points; feed to Easing.bezier(...EASE.standard). */
export const EASE = {
  standard: [0.22, 1, 0.36, 1] as [number, number, number, number],
  ring: [0.32, 0.94, 0.28, 1] as [number, number, number, number],
};

export const duration = {
  fadeUp: 380,
  sheetUp: 380,
  ringFill: 900,
  radarIn: 850,
  growUp: 700,
  tipIn: 500,
  pop: 420,
  toast: 2700,
  tap: 140,
  radarMorph: 700,
  progressBar: 800,
  tabPill: 250,
  overlayFade: 280,
} as const;

/** Pressable feedback per §1 ("tap feedback"). */
export const pressed = { opacity: 0.55, transform: [{ scale: 0.97 }] };

/* ------------------------------------------------------------------ */
/* Ring geometry (§2) — canonical                                       */
/* ------------------------------------------------------------------ */

export const ringGeom = {
  main: { viewBox: 220, center: 110, radii: [94, 70, 46] as const, stroke: 20 },
  day: { viewBox: 60, center: 30, radii: [25, 18.5, 12] as const, stroke: 5 },
} as const;

export const ringSizes = { summary: 158, sheet: 196, welcome: 210, day: 38 } as const;

/** Derived goals from the volume goal (§2). */
export const deriveGoals = (volumeGoal: number) => ({
  volume: volumeGoal,
  difficulty: Math.round(volumeGoal * 0.3),
  streak: Math.min(7, Math.max(2, Math.round(volumeGoal * 0.45))),
});

/** Coverage state color ramp (§3.7). */
export const coverageColor = (pct: number) =>
  pct >= 0.4 ? colors.difficulty : pct >= 0.25 ? colors.medium : colors.volume;

export const difficultyColor = (d?: string | null) => {
  const k = (d ?? '').toLowerCase();
  return k === 'hard' ? colors.hard : k === 'medium' ? colors.medium : colors.easy;
};

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/* ------------------------------------------------------------------ */
/* Shadow                                                              */
/* ------------------------------------------------------------------ */

export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 8,
  },
  sheet: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.6,
    shadowRadius: 50,
    elevation: 24,
  },
  tip: {
    shadowColor: '#FA114F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 8,
  },
  gem: {
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.55,
    shadowRadius: 18,
    elevation: 10,
  },
} as const;
