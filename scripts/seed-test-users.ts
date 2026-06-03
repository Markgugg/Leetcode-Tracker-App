// Creates 10 test users, adds them to a group, and seeds random solves.
// Run with: npx tsx scripts/seed-test-users.ts

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Load .env manually (no extra deps needed)
try {
  for (const line of readFileSync('.env', 'utf-8').split('\n')) {
    const idx = line.indexOf('=');
    if (idx > 0) {
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim();
      if (k && !process.env[k]) process.env[k] = v;
    }
  }
} catch {}

// ─── Config ───────────────────────────────────────────────────────────────────

const GROUP_CODE = 'U3RWBJ';

const TEST_USERS = [
  { username: 'dp_enjoyer',     display_name: 'dp enjoyer',     lc: 'dp_enjoyer'     },
  { username: 'segfault_sam',   display_name: 'segfault sam',   lc: 'segfault_sam'   },
  { username: 'neetcode_clone', display_name: 'neetcode clone', lc: 'neetcode_clone' },
  { username: 'o1_pilled',      display_name: 'o(1) pilled',    lc: 'o1_pilled'      },
  { username: 'grind_or_die',   display_name: 'grind or die',   lc: 'grind_or_die'   },
  { username: 'faang_or_bust',  display_name: 'faang or bust',  lc: 'faang_or_bust'  },
  { username: 'recursion_bro',  display_name: 'recursion bro',  lc: 'recursion_bro'  },
  { username: 'hashmap_haver',  display_name: 'hashmap haver',  lc: 'hashmap_haver'  },
  { username: 'leetgrinder99',  display_name: 'leetgrinder99',  lc: 'leetgrinder99'  },
  { username: 'two_sum_guy',    display_name: 'two sum guy',    lc: 'two_sum_guy'    },
];

const PROBLEMS = [
  { slug: 'two-sum',                                        title: 'Two Sum',                                        difficulty: 'easy',   points: 1 },
  { slug: 'valid-parentheses',                              title: 'Valid Parentheses',                              difficulty: 'easy',   points: 1 },
  { slug: 'best-time-to-buy-and-sell-stock',                title: 'Best Time to Buy and Sell Stock',                difficulty: 'easy',   points: 1 },
  { slug: 'climbing-stairs',                                title: 'Climbing Stairs',                                difficulty: 'easy',   points: 1 },
  { slug: 'merge-two-sorted-lists',                         title: 'Merge Two Sorted Lists',                         difficulty: 'easy',   points: 1 },
  { slug: 'contains-duplicate',                             title: 'Contains Duplicate',                             difficulty: 'easy',   points: 1 },
  { slug: 'maximum-subarray',                               title: 'Maximum Subarray',                               difficulty: 'medium', points: 3 },
  { slug: 'add-two-numbers',                                title: 'Add Two Numbers',                                difficulty: 'medium', points: 3 },
  { slug: 'longest-substring-without-repeating-characters', title: 'Longest Substring Without Repeating Characters', difficulty: 'medium', points: 3 },
  { slug: 'container-with-most-water',                      title: 'Container With Most Water',                      difficulty: 'medium', points: 3 },
  { slug: 'three-sum',                                      title: '3Sum',                                           difficulty: 'medium', points: 3 },
  { slug: 'product-of-array-except-self',                   title: 'Product of Array Except Self',                   difficulty: 'medium', points: 3 },
  { slug: 'coin-change',                                    title: 'Coin Change',                                    difficulty: 'medium', points: 3 },
  { slug: 'number-of-islands',                              title: 'Number of Islands',                              difficulty: 'medium', points: 3 },
  { slug: 'median-of-two-sorted-arrays',                    title: 'Median of Two Sorted Arrays',                    difficulty: 'hard',   points: 5 },
  { slug: 'trapping-rain-water',                            title: 'Trapping Rain Water',                            difficulty: 'hard',   points: 5 },
  { slug: 'word-ladder',                                    title: 'Word Ladder',                                    difficulty: 'hard',   points: 5 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDateISO(maxDaysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(Math.random() * maxDaysAgo));
  return d.toISOString();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key || key === 'YOUR_SERVICE_ROLE_KEY_HERE') {
    console.error('Add SUPABASE_SERVICE_ROLE_KEY to your .env file first.');
    console.error('Find it in Supabase dashboard → Project Settings → API → service_role');
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Find group
  const { data: group } = await supabase
    .from('groups').select('id').eq('invite_code', GROUP_CODE).maybeSingle();

  if (!group) {
    console.error(`No group found with invite code "${GROUP_CODE}". Make sure it exists.`);
    process.exit(1);
  }
  console.log(`✓ Found group ${group.id}\n`);

  // Ensure problems exist (upsert, ignore ones already seeded)
  await supabase.from('problems').upsert(
    PROBLEMS.map(({ slug, title, difficulty }) => ({ slug, title, difficulty, tags: [], is_premium: false })),
    { onConflict: 'slug' },
  );

  for (const u of TEST_USERS) {
    const email = `${u.username}@grind.test`;

    // Create auth user
    const { data: auth, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password: 'Grind1234!',
      email_confirm: true,
    });
    if (authErr) {
      console.error(`✗ ${u.display_name}: ${authErr.message}`);
      continue;
    }
    const uid = auth.user.id;

    // Profile
    const { error: profErr } = await supabase.from('profiles').insert({
      id: uid,
      username: u.username,
      display_name: u.display_name,
      leetcode_username: u.lc,
      timezone: 'America/New_York',
    });
    if (profErr) {
      console.error(`✗ profile ${u.username}: ${profErr.message}`);
      continue;
    }

    // Add to group
    await supabase.from('group_members').insert({ group_id: group.id, user_id: uid, role: 'member' });

    // Random solves spread over last 30 days — 6 to 20 solves per user
    const solveCount = 6 + Math.floor(Math.random() * 15);
    const usedKeys = new Set<string>();
    const solves = [];

    for (let i = 0; i < solveCount * 3 && solves.length < solveCount; i++) {
      const p = pick(PROBLEMS);
      const solvedAt = randomDateISO(30);
      const dateStr = solvedAt.slice(0, 10);
      const key = `${p.slug}|${dateStr}`;
      if (usedKeys.has(key)) continue; // skip duplicate (same problem same day)
      usedKeys.add(key);
      solves.push({
        user_id: uid,
        problem_slug: p.slug,
        solved_at: solvedAt,
        solved_date: dateStr,
        points: p.points,
        source: 'manual',
        language: pick(['python3', 'typescript', 'java', 'cpp', 'go']),
      });
    }

    await supabase.from('solves').insert(solves);

    const pts = solves.reduce((s, r) => s + r.points, 0);
    console.log(`✓ ${u.display_name.padEnd(16)} ${solves.length} solves  ${pts} pts  lc:${u.lc}`);
  }

  console.log('\nAll done! Refresh your app to see the new members.');
}

main().catch(e => { console.error(e); process.exit(1); });
