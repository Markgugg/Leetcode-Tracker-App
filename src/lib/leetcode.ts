// Shared LeetCode GraphQL client + react-query hooks.
// Query keys match the originals in log.tsx/profile.tsx so caches are shared
// across every screen that renders LC data.

import { useQuery } from '@tanstack/react-query';

export const LC_GRAPHQL = 'https://leetcode.com/graphql';

// Public totals shown on leetcode.com/problemset (used for ring denominators)
export const LC_TOTALS = { easy: 947, medium: 2063, hard: 939, all: 3949 };

export type LcStats = { total: number; easy: number; medium: number; hard: number };
export type LcTagStat = { tagName: string; problemsSolved: number };

export const RADAR_TAGS = [
  { key: 'Array / String',    label: 'Arrays'    },
  { key: 'Hash Map / Set',    label: 'Hash Map'  },
  { key: 'Binary Tree - DFS', label: 'Trees'     },
  { key: 'Graphs - DFS',      label: 'Graphs'    },
  { key: 'DP - 1D',           label: 'Dyn Prog'  },
  { key: 'Binary Search',     label: 'Bin Search'},
  { key: 'Stack',             label: 'Stack'     },
  { key: 'Two Pointers',      label: '2 Ptr'     },
] as const;

export type RadarLabel = typeof RADAR_TAGS[number]['label'];

// Map LC native tag names → our 8 radar labels
export const LC_TO_RADAR: Record<string, RadarLabel> = {
  'Array': 'Arrays', 'String': 'Arrays', 'Matrix': 'Arrays',
  'Hash Table': 'Hash Map',
  'Tree': 'Trees', 'Binary Tree': 'Trees', 'Depth-First Search': 'Trees', 'Breadth-First Search': 'Trees',
  'Graph': 'Graphs', 'Union Find': 'Graphs', 'Topological Sort': 'Graphs',
  'Dynamic Programming': 'Dyn Prog', 'Memoization': 'Dyn Prog',
  'Binary Search': 'Bin Search',
  'Stack': 'Stack', 'Monotonic Stack': 'Stack',
  'Two Pointers': '2 Ptr', 'Sliding Window': '2 Ptr',
};

// "full mastery" target per label for 0→1 normalization
export const RADAR_TARGET: Record<RadarLabel, number> = {
  'Arrays': 50, 'Hash Map': 30, 'Trees': 35, 'Graphs': 25,
  'Dyn Prog': 30, 'Bin Search': 25, 'Stack': 25, '2 Ptr': 25,
};

// Radar label → problems.tags value in our catalog (see pathways/practice)
export const RADAR_TO_CATALOG_TAG: Record<RadarLabel, string> = {
  'Arrays': 'Arrays', 'Hash Map': 'Hashing', 'Trees': 'Trees', 'Graphs': 'Graphs',
  'Dyn Prog': 'Dynamic Programming', 'Bin Search': 'Binary Search',
  'Stack': 'Stack', '2 Ptr': 'Two Pointers',
};

export function safeLcUsername(username: string | null | undefined): string | null {
  return /^[a-zA-Z0-9_-]{1,40}$/.test(username ?? '') ? username! : null;
}

export function problemUrl(slug: string) {
  return `https://leetcode.com/problems/${slug}/`;
}

function lcHeaders(username: string) {
  return {
    'Content-Type': 'application/json',
    'Referer': `https://leetcode.com/${username}/`,
    'User-Agent': 'Mozilla/5.0 Grind/0.1',
  };
}

async function gql(username: string, query: string, variables: Record<string, unknown>) {
  const res = await fetch(LC_GRAPHQL, {
    method: 'POST',
    headers: lcHeaders(username),
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) return null;
  return res.json();
}

const STATS_QUERY = `query userStats($username: String!) {
  matchedUser(username: $username) {
    submitStatsGlobal { acSubmissionNum { difficulty count } }
  }
}`;

const TAGS_QUERY = `query userTagStats($username: String!) {
  matchedUser(username: $username) {
    tagProblemCounts {
      advanced { tagName problemsSolved }
      intermediate { tagName problemsSolved }
      fundamental { tagName problemsSolved }
    }
  }
}`;

const CALENDAR_QUERY = `query userCalendar($username: String!, $year: Int) {
  matchedUser(username: $username) {
    userCalendar(year: $year) { submissionCalendar }
  }
}`;

const VERIFY_QUERY = `query verifyUser($username: String!) {
  matchedUser(username: $username) { username }
}`;

export async function verifyLcUsername(username: string): Promise<boolean> {
  const json = await gql(username, VERIFY_QUERY, { username });
  if (json === null) throw new Error('LC unreachable');
  return json?.data?.matchedUser != null;
}

export async function fetchLcStats(username: string): Promise<LcStats | null> {
  const json = await gql(username, STATS_QUERY, { username });
  const nums: { difficulty: string; count: number }[] =
    json?.data?.matchedUser?.submitStatsGlobal?.acSubmissionNum ?? [];
  if (!nums.length) return null;
  const get = (d: string) => nums.find(n => n.difficulty === d)?.count ?? 0;
  return { total: get('All'), easy: get('Easy'), medium: get('Medium'), hard: get('Hard') };
}

export async function fetchLcTagStats(username: string): Promise<LcTagStat[] | null> {
  const json = await gql(username, TAGS_QUERY, { username });
  const counts = json?.data?.matchedUser?.tagProblemCounts;
  if (!counts) return null;
  return [
    ...(counts.fundamental ?? []),
    ...(counts.intermediate ?? []),
    ...(counts.advanced ?? []),
  ] as LcTagStat[];
}

export async function fetchLcCalendar(username: string): Promise<Map<string, number>> {
  const thisYear = new Date().getFullYear();
  const fetchYear = async (year: number) => {
    const json = await gql(username, CALENDAR_QUERY, { username, year });
    const raw = json?.data?.matchedUser?.userCalendar?.submissionCalendar;
    return raw ? JSON.parse(raw) as Record<string, number> : {};
  };
  const [curr, prev] = await Promise.all([fetchYear(thisYear), fetchYear(thisYear - 1)]);
  const map = new Map<string, number>();
  for (const [ts, count] of Object.entries({ ...prev, ...curr })) {
    const date = new Date(parseInt(ts) * 1000).toISOString().slice(0, 10);
    map.set(date, (map.get(date) ?? 0) + count);
  }
  return map;
}

// ── Hooks (query keys preserved from the pre-refactor screens) ───────────────

const STALE_30M = 1000 * 60 * 30;

export function useLcStats(username: string | null) {
  return useQuery({
    queryKey: ['lc-stats', username],
    enabled: !!username,
    staleTime: STALE_30M,
    queryFn: () => fetchLcStats(username!),
  });
}

export function useLcTagStats(username: string | null) {
  return useQuery({
    queryKey: ['lc-tag-stats', username],
    enabled: !!username,
    staleTime: STALE_30M,
    queryFn: () => fetchLcTagStats(username!),
  });
}

export function useLcCalendar(username: string | null) {
  return useQuery({
    queryKey: ['lc-calendar', username],
    enabled: !!username,
    staleTime: STALE_30M,
    queryFn: () => fetchLcCalendar(username!),
  });
}

// ── Derived data ─────────────────────────────────────────────────────────────

export type RadarAxis = { label: RadarLabel; value: number };

/** Aggregate LC tag stats into the 8 radar axes, normalized 0→1 against targets. */
export function buildRadarAxes(tagStats: LcTagStat[] | null | undefined): RadarAxis[] {
  if (!tagStats) return RADAR_TAGS.map(rt => ({ label: rt.label, value: 0 }));
  const acc = new Map<string, number>();
  for (const { tagName, problemsSolved } of tagStats) {
    const label = LC_TO_RADAR[tagName];
    if (label) acc.set(label, (acc.get(label) ?? 0) + problemsSolved);
  }
  return RADAR_TAGS.map(rt => ({
    label: rt.label,
    value: Math.min((acc.get(rt.label) ?? 0) / (RADAR_TARGET[rt.label] ?? 30), 1),
  }));
}

/** Radar axes sorted weakest-first — drives Up Next and AI coach weak topics. */
export function weakestAxes(axes: RadarAxis[]): RadarAxis[] {
  return [...axes].sort((a, b) => a.value - b.value);
}
