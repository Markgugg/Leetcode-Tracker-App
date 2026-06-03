// One-off catalog seeder: fetches the public LeetCode problem list and upserts
// into the `problems` table. Run with: `npx tsx scripts/seed-problems.ts`
//
// Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in env.

import { createClient } from '@supabase/supabase-js';

const LIST_URL = 'https://leetcode.com/api/problems/all/';
const DIFF: Record<number, 'easy' | 'medium' | 'hard'> = { 1: 'easy', 2: 'medium', 3: 'hard' };

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const res = await fetch(LIST_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 Grind-seeder/0.1' },
  });
  if (!res.ok) throw new Error(`fetch failed ${res.status}`);
  const json = (await res.json()) as {
    stat_status_pairs: Array<{
      stat: { question__title: string; question__title_slug: string };
      difficulty: { level: 1 | 2 | 3 };
      paid_only: boolean;
    }>;
  };

  const rows = json.stat_status_pairs.map((p) => ({
    slug: p.stat.question__title_slug,
    title: p.stat.question__title,
    difficulty: DIFF[p.difficulty.level],
    tags: [],
    is_premium: p.paid_only,
  }));

  // chunked upsert to stay under Supabase row limits
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from('problems').upsert(slice, { onConflict: 'slug' });
    if (error) throw error;
    console.log(`upserted ${i + slice.length}/${rows.length}`);
  }
  console.log('done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
