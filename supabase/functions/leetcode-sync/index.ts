import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const LC_GRAPHQL = 'https://leetcode.com/graphql';
const POINTS = { easy: 1, medium: 3, hard: 5 } as const;
const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;

const RECENT_AC_QUERY = `
  query recentAcSubmissions($username: String!, $limit: Int!) {
    recentAcSubmissionList(username: $username, limit: $limit) {
      id title titleSlug timestamp lang
    }
  }`;

const PROBLEM_DETAIL_QUERY = `
  query problemDetail($titleSlug: String!) {
    question(titleSlug: $titleSlug) {
      difficulty
      topicTags { name }
    }
  }`;

// Map LC native tags → our NeetCode-style categories
const LC_TAG_MAP: Record<string, string> = {
  'Array': 'Array / String', 'String': 'Array / String',
  'Two Pointers': 'Two Pointers', 'Sliding Window': 'Sliding Window',
  'Prefix Sum': 'Prefix Sum', 'Hash Table': 'Hash Map / Set',
  'Stack': 'Stack', 'Queue': 'Queue', 'Linked List': 'Linked List',
  'Binary Search': 'Binary Search', 'Backtracking': 'Backtracking',
  'Dynamic Programming': 'DP - 1D', 'Bit Manipulation': 'Bit Manipulation',
  'Trie': 'Trie', 'Monotonic Stack': 'Monotonic Stack',
  'Heap (Priority Queue)': 'Heap / Priority Queue',
  'Binary Search Tree': 'Binary Search Tree',
  'Math': 'Math & Geometry', 'Geometry': 'Math & Geometry',
  'Intervals': 'Intervals',
};

function mapLcTags(names: string[]): string {
  const hasDFS = names.includes('Depth-First Search');
  const hasBFS = names.includes('Breadth-First Search');
  const hasTree = names.some(n => n === 'Tree' || n === 'Binary Tree');
  const hasGraph = names.includes('Graph');
  if (hasTree && hasDFS) return 'Binary Tree - DFS';
  if (hasTree && hasBFS) return 'Binary Tree - BFS';
  if (hasGraph && hasDFS) return 'Graphs - DFS';
  if (hasGraph && hasBFS) return 'Graphs - BFS';
  if (hasGraph) return 'Advanced Graphs';
  for (const n of names) { const m = LC_TAG_MAP[n]; if (m) return m; }
  return 'Array / String';
}

async function fetchRecentAC(username: string) {
  const res = await fetch(LC_GRAPHQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Referer': `https://leetcode.com/${username}/`,
      'User-Agent': 'Mozilla/5.0 (compatible; Grind/1.0)',
    },
    body: JSON.stringify({ query: RECENT_AC_QUERY, variables: { username, limit: 1000 } }),
  });
  if (!res.ok) throw new Error(`LC API ${res.status}`);
  const json = await res.json();
  return (json?.data?.recentAcSubmissionList ?? []) as Array<{
    id: string; title: string; titleSlug: string; timestamp: string; lang: string;
  }>;
}

async function fetchProblemDetail(slug: string): Promise<{ difficulty: string; tags: string[] }> {
  try {
    const res = await fetch(LC_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; Grind/1.0)' },
      body: JSON.stringify({ query: PROBLEM_DETAIL_QUERY, variables: { titleSlug: slug } }),
    });
    const json = await res.json();
    const q = json?.data?.question;
    if (!q) return { difficulty: 'medium', tags: [] };
    const names: string[] = (q.topicTags ?? []).map((t: any) => t.name);
    const mapped = names.length ? mapLcTags(names) : 'Array / String';
    const diff = (q.difficulty ?? 'Medium').toLowerCase() as 'easy' | 'medium' | 'hard';
    return { difficulty: diff, tags: [mapped] };
  } catch {
    return { difficulty: 'medium', tags: [] };
  }
}

Deno.serve(async (_req) => {
  // Top-level safety net — always return 200 so cron doesn't alert
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: profiles, error: profileErr } = await supabase
      .from('profiles')
      .select('id, leetcode_username')
      .not('leetcode_username', 'is', null);

    if (profileErr) {
      return Response.json({ ok: false, error: profileErr.message }, { status: 200 });
    }

    const cutoff = Date.now() - TWO_YEARS_MS;
    const results: Array<{ user: string; inserted: number; skipped: number; error?: string }> = [];

    for (const profile of profiles ?? []) {
      try {
        const recent = await fetchRecentAC(profile.leetcode_username!);

        // Only past 2 years
        const inWindow = recent.filter(s => parseInt(s.timestamp) * 1000 >= cutoff);
        if (inWindow.length === 0) {
          results.push({ user: profile.leetcode_username!, inserted: 0, skipped: 0 });
          continue;
        }

        const slugs = [...new Set(inWindow.map(s => s.titleSlug))];

        // Look up which slugs are already in our problems catalog (incl. tags)
        const { data: known } = await supabase
          .from('problems')
          .select('slug, difficulty, tags')
          .in('slug', slugs);

        const probMap = new Map((known ?? []).map((p: any) => [p.slug, p.difficulty as string]));

        // Refetch any slug that is unknown OR has empty tags from a prior sync
        const knownMap = new Map((known ?? []).map((p: any) => [p.slug, p]));
        const needsFetch = slugs.filter(s => {
          const k: any = knownMap.get(s);
          return !k || !Array.isArray(k.tags) || k.tags.length === 0;
        });
        if (needsFetch.length > 0) {
          const slugToTitle = new Map(inWindow.map(s => [s.titleSlug, s.title]));
          const newProblems: Array<{ slug: string; title: string; difficulty: string; tags: string[]; is_premium: boolean }> = [];
          for (const slug of needsFetch) {
            const detail = await fetchProblemDetail(slug);
            if (detail.tags.length === 0) continue; // skip if LC fetch failed - don't overwrite with empty
            newProblems.push({ slug, title: slugToTitle.get(slug) ?? slug, difficulty: detail.difficulty, tags: detail.tags, is_premium: false });
            await new Promise(r => setTimeout(r, 200)); // gentle rate limit
          }
          if (newProblems.length > 0) {
            // upsert without ignoreDuplicates so existing rows with empty tags get updated
            await supabase.from('problems').upsert(newProblems, { onConflict: 'slug' });
            newProblems.forEach(p => probMap.set(p.slug, p.difficulty));
          }
        }

        // Insert solves — DB unique constraint (user_id, problem_slug, solved_date) prevents duplicates
        let inserted = 0;
        let skipped = 0;
        for (const sub of inWindow) {
          const difficulty = probMap.get(sub.titleSlug);
          if (!difficulty) { skipped++; continue; }

          const solvedAt = new Date(parseInt(sub.timestamp) * 1000).toISOString();
          const { error: insErr } = await supabase.from('solves').insert({
            user_id: profile.id,
            problem_slug: sub.titleSlug,
            solved_at: solvedAt,
            solved_date: solvedAt.slice(0, 10),
            source: 'leetcode_sync',
            language: sub.lang ?? null,
            points: POINTS[difficulty as keyof typeof POINTS] ?? 3,
          });
          // error code 23505 = unique violation (already synced) — not a real error
          if (!insErr || insErr.code === '23505') {
            if (!insErr) inserted++;
          } else {
            skipped++;
          }
        }

        await supabase
          .from('profiles')
          .update({ leetcode_last_synced_at: new Date().toISOString() })
          .eq('id', profile.id);

        results.push({ user: profile.leetcode_username!, inserted, skipped });
      } catch (e) {
        results.push({ user: profile.leetcode_username!, inserted: 0, skipped: 0, error: String(e) });
      }

      // Gentle rate-limit between users
      await new Promise(r => setTimeout(r, 1000));
    }

    return Response.json({ ok: true, results });
  } catch (e) {
    // Never return non-2xx — log the error in the response body instead
    return Response.json({ ok: false, error: String(e) }, { status: 200 });
  }
});
