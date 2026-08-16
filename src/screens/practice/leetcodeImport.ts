/**
 * Importing a pack from leetcode.com.
 *
 * The app already talks to LeetCode's public GraphQL endpoint unauthenticated
 * (`app/(auth)/onboarding.tsx` → `matchedUser`, `supabase/functions/leetcode-sync`),
 * so this uses the same endpoint, the same `Referer` + `User-Agent` shape, and
 * the same "no credentials, no cookies" posture.
 *
 * Two queries cover everything a user can paste:
 *
 *   `studyPlanV2Detail(planSlug:)`   — /studyplan/<slug>/ (Top Interview 150,
 *                                      LeetCode 75, SQL 50, …). Returns the
 *                                      plan's sub-groups, which map 1:1 onto
 *                                      our `TrackSection`s.
 *   `favoriteQuestionList(...)`      — /problem-list/<slug>/ and the legacy
 *                                      /list/<slug>/. Flat, paginated.
 *
 * Neither is a documented, supported API. They are the queries leetcode.com's
 * own web client issues, and LeetCode can change or gate them at any time —
 * private lists in particular require a session cookie we deliberately do not
 * have, and will come back empty. **Every failure path here is recoverable:**
 * the caller falls back to the manual paste flow (`parseManualInput`), which
 * needs no network at all. Nothing in the import is load-bearing.
 */
import type { Difficulty } from '@/types/database';
import type { TrackSection } from './tracks';

const LC_GRAPHQL = 'https://leetcode.com/graphql';

/** How long we wait on LeetCode before falling back to manual paste. */
const TIMEOUT_MS = 12_000;

/** Hard cap on an imported list. Guards a pathological paste, not a real list. */
export const MAX_PACK_SIZE = 600;

export interface ImportedProblem {
  slug: string;
  /** LeetCode's title, when we know it. Catalog title wins at render time. */
  title?: string;
  difficulty?: Difficulty;
}

export interface ImportedPack {
  /** Suggested name — the user can rename it before or after saving. */
  name: string;
  sections: TrackSection[];
  /** Flat, de-duplicated, in list order. */
  problems: ImportedProblem[];
  source: PackSourceKind;
  sourceRef?: string;
}

export type PackSourceKind = 'leetcode-studyplan' | 'leetcode-list' | 'neetcode' | 'manual';

export interface ParsedRef {
  kind: 'studyplan' | 'list' | 'unknown';
  slug: string;
}

/* ------------------------------------------------------------------ */
/* Input parsing                                                       */
/* ------------------------------------------------------------------ */

const SLUG_RE = /^[a-zA-Z0-9_-]+$/;

/**
 * Accepts any of:
 *   https://leetcode.com/studyplan/top-interview-150/
 *   https://leetcode.com/problem-list/xk0n9k1r/
 *   leetcode.com/list/xk0n9k1r
 *   top-interview-150            (bare slug → try study plan, then list)
 */
export function parseLeetCodeRef(raw: string): ParsedRef | null {
  const input = raw.trim();
  if (!input) return null;

  const studyplan = input.match(/\/studyplan\/([a-zA-Z0-9_-]+)/);
  if (studyplan) return { kind: 'studyplan', slug: studyplan[1] };

  const list = input.match(/\/(?:problem-list|list)\/([a-zA-Z0-9_-]+)/);
  if (list) return { kind: 'list', slug: list[1] };

  // A pasted single problem URL is a manual-paste case, not a list.
  if (/\/problems\//.test(input)) return null;

  if (SLUG_RE.test(input)) return { kind: 'unknown', slug: input };
  return null;
}

/**
 * The manual fallback: any blob of problem URLs and/or slugs, one per line or
 * comma/space separated. Everything that is not a plausible slug is dropped.
 */
export function parseManualInput(raw: string): ImportedProblem[] {
  const out: ImportedProblem[] = [];
  const seen = new Set<string>();

  for (const token of raw.split(/[\s,;]+/)) {
    const t = token.trim();
    if (!t) continue;

    let slug: string | null = null;
    const url = t.match(/leetcode\.com\/problems\/([a-zA-Z0-9-]+)/);
    if (url) slug = url[1];
    else if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t) && t.length >= 3) slug = t;

    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug });
    if (out.length >= MAX_PACK_SIZE) break;
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

async function gql<T>(query: string, variables: Record<string, unknown>, ref: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(LC_GRAPHQL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Referer: `https://leetcode.com/${ref}/`,
        'User-Agent': 'Mozilla/5.0 Grind/0.1',
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`LeetCode returned ${res.status}`);
    const json = (await res.json()) as { data?: T; errors?: { message?: string }[] };
    if (json.errors?.length) throw new Error(json.errors[0]?.message ?? 'LeetCode rejected the query');
    if (!json.data) throw new Error('LeetCode returned no data');
    return json.data;
  } finally {
    clearTimeout(timer);
  }
}

const normDifficulty = (d?: string | null): Difficulty | undefined => {
  const k = (d ?? '').toLowerCase();
  return k === 'easy' || k === 'medium' || k === 'hard' ? (k as Difficulty) : undefined;
};

interface LcQuestion {
  titleSlug?: string | null;
  title?: string | null;
  difficulty?: string | null;
}

const toProblem = (q: LcQuestion): ImportedProblem | null =>
  q?.titleSlug
    ? { slug: q.titleSlug, title: q.title ?? undefined, difficulty: normDifficulty(q.difficulty) }
    : null;

/* ------------------------------------------------------------------ */
/* Study plans                                                         */
/* ------------------------------------------------------------------ */

const STUDY_PLAN_QUERY = `
query studyPlanDetail($slug: String!) {
  studyPlanV2Detail(planSlug: $slug) {
    slug
    name
    planSubGroups {
      slug
      name
      questions { titleSlug title difficulty }
    }
  }
}`;

interface StudyPlanData {
  studyPlanV2Detail?: {
    slug?: string | null;
    name?: string | null;
    planSubGroups?: { name?: string | null; questions?: LcQuestion[] | null }[] | null;
  } | null;
}

export async function fetchStudyPlan(slug: string): Promise<ImportedPack> {
  const data = await gql<StudyPlanData>(STUDY_PLAN_QUERY, { slug }, `studyplan/${slug}`);
  const plan = data.studyPlanV2Detail;
  if (!plan) throw new Error('No study plan with that link');

  const seen = new Set<string>();
  const sections: TrackSection[] = [];
  const problems: ImportedProblem[] = [];

  for (const group of plan.planSubGroups ?? []) {
    const slugs: string[] = [];
    for (const q of group.questions ?? []) {
      const p = toProblem(q);
      if (!p || seen.has(p.slug) || problems.length >= MAX_PACK_SIZE) continue;
      seen.add(p.slug);
      slugs.push(p.slug);
      problems.push(p);
    }
    if (slugs.length) sections.push({ name: group.name?.trim() || 'Problems', slugs });
  }

  if (!problems.length) throw new Error('That study plan came back empty');

  return {
    name: plan.name?.trim() || slug,
    sections,
    problems,
    source: 'leetcode-studyplan',
    sourceRef: slug,
  };
}

/* ------------------------------------------------------------------ */
/* Problem lists (favorites)                                           */
/* ------------------------------------------------------------------ */

const FAVORITE_QUERY = `
query favoriteQuestionList($favoriteSlug: String!, $limit: Int!, $skip: Int!) {
  favoriteQuestionList(favoriteSlug: $favoriteSlug, limit: $limit, skip: $skip) {
    totalLength
    hasMore
    questions { titleSlug title difficulty }
  }
}`;

const FAVORITE_NAME_QUERY = `
query favoriteDetail($favoriteSlug: String!) {
  favoriteDetailV2(favoriteSlug: $favoriteSlug) { name }
}`;

const PAGE = 100;

interface FavoriteData {
  favoriteQuestionList?: {
    totalLength?: number | null;
    hasMore?: boolean | null;
    questions?: LcQuestion[] | null;
  } | null;
}

export async function fetchProblemList(slug: string): Promise<ImportedPack> {
  const seen = new Set<string>();
  const problems: ImportedProblem[] = [];
  let skip = 0;

  // Paginated, and bounded twice over: `hasMore` normally ends it, MAX_PACK_SIZE
  // ends a list that lies about it.
  for (let page = 0; page < Math.ceil(MAX_PACK_SIZE / PAGE); page++) {
    const data = await gql<FavoriteData>(
      FAVORITE_QUERY,
      { favoriteSlug: slug, limit: PAGE, skip },
      `problem-list/${slug}`,
    );
    const node = data.favoriteQuestionList;
    const questions = node?.questions ?? [];
    if (!questions.length) break;

    for (const q of questions) {
      const p = toProblem(q);
      if (!p || seen.has(p.slug) || problems.length >= MAX_PACK_SIZE) continue;
      seen.add(p.slug);
      problems.push(p);
    }

    skip += questions.length;
    if (!node?.hasMore || problems.length >= MAX_PACK_SIZE) break;
  }

  if (!problems.length) {
    throw new Error('That list came back empty — private lists need a LeetCode login we do not have');
  }

  // Best-effort: a nameless pack is still a usable pack.
  let name = slug;
  try {
    const meta = await gql<{ favoriteDetailV2?: { name?: string | null } | null }>(
      FAVORITE_NAME_QUERY,
      { favoriteSlug: slug },
      `problem-list/${slug}`,
    );
    name = meta.favoriteDetailV2?.name?.trim() || slug;
  } catch {
    /* keep the slug as the name */
  }

  return {
    name,
    sections: [{ name: 'Problems', slugs: problems.map((p) => p.slug) }],
    problems,
    source: 'leetcode-list',
    sourceRef: slug,
  };
}

/**
 * The one call the UI makes. A bare slug is ambiguous, so it tries the study
 * plan first (the common paste) and falls back to the list query.
 */
export async function importFromLeetCode(raw: string): Promise<ImportedPack> {
  const ref = parseLeetCodeRef(raw);
  if (!ref) {
    throw new Error('That does not look like a LeetCode list or study-plan link');
  }
  if (ref.kind === 'studyplan') return fetchStudyPlan(ref.slug);
  if (ref.kind === 'list') return fetchProblemList(ref.slug);

  try {
    return await fetchStudyPlan(ref.slug);
  } catch {
    return fetchProblemList(ref.slug);
  }
}
