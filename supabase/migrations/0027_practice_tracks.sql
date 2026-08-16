-- ============================================================================
-- 0027_practice_tracks.sql — Practice tracks (Blind 75 / NeetCode 150 /
-- LeetCode Top Interview 150).
--
-- A "track" is a published course the user chooses to follow. The Practice
-- screen pins the active one to the top and shows REAL completion: the track's
-- slugs intersected with the user's rows in `solves`. Nothing about progress is
-- stored — it is always derived, so it moves the moment a solve lands.
--
-- This file does three things:
--   1. Backfills the 91 catalog rows the three lists reference but 0011 never
--      seeded. `solves.problem_slug` has an FK onto `problems.slug`, so an
--      unseeded slug is literally unsolvable; without this backfill the client
--      filters those entries out and Blind 75 reads "of 69" instead of "of 75".
--   2. Creates `tracks` / `track_problems` and seeds the three lists, so the
--      definitions in src/screens/practice/tracks.ts have a server-side mirror
--      (and a place for future tracks to be added without an app release).
--   3. Creates `user_tracks` for the active-track choice, which the client
--      currently keeps in AsyncStorage under `active-track:<uid>`.
--
-- Safe to re-run: every insert is ON CONFLICT-guarded.
--
-- NOTE ON ONE SLUG: the catalog calls Pow(x, n) `power-x-n`; LeetCode's own
-- slug is `powx-n`. The catalog wins here because the FK does. Fixing that is a
-- separate migration (it would need to rewrite existing solves).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Catalog backfill — problems referenced by the tracks but missing from 0011
-- ---------------------------------------------------------------------------

insert into problems (slug, title, difficulty, tags, is_premium) values

  -- ── Array / String ───────────────────────────────────────────────────────
  ('merge-sorted-array', 'Merge Sorted Array', 'easy', array['Array / String'], false),
  ('remove-element', 'Remove Element', 'easy', array['Array / String'], false),
  ('remove-duplicates-from-sorted-array-ii', 'Remove Duplicates from Sorted Array II', 'medium', array['Array / String'], false),
  ('majority-element', 'Majority Element', 'easy', array['Array / String'], false),
  ('rotate-array', 'Rotate Array', 'medium', array['Array / String'], false),
  ('best-time-to-buy-and-sell-stock-ii', 'Best Time to Buy and Sell Stock II', 'medium', array['Array / String'], false),
  ('h-index', 'H-Index', 'medium', array['Array / String'], false),
  ('insert-delete-getrandom-o1', 'Insert Delete GetRandom O(1)', 'medium', array['Array / String'], false),
  ('candy', 'Candy', 'hard', array['Array / String'], false),
  ('roman-to-integer', 'Roman to Integer', 'easy', array['Array / String'], false),
  ('integer-to-roman', 'Integer to Roman', 'medium', array['Array / String'], false),
  ('length-of-last-word', 'Length of Last Word', 'easy', array['Array / String'], false),
  ('longest-common-prefix', 'Longest Common Prefix', 'easy', array['Array / String'], false),
  ('zigzag-conversion', 'Zigzag Conversion', 'medium', array['Array / String'], false),
  ('find-the-index-of-the-first-occurrence-in-a-string', 'Find the Index of the First Occurrence in a String', 'easy', array['Array / String'], false),
  ('text-justification', 'Text Justification', 'hard', array['Array / String'], false),
  ('game-of-life', 'Game of Life', 'medium', array['Array / String'], false),
  ('valid-sudoku', 'Valid Sudoku', 'medium', array['Array / String'], false),

  -- ── Greedy (filed under Array / String — 0011 has no Greedy tag) ─────────
  ('gas-station', 'Gas Station', 'medium', array['Array / String'], false),
  ('jump-game-ii', 'Jump Game II', 'medium', array['Array / String'], false),
  ('hand-of-straights', 'Hand of Straights', 'medium', array['Array / String'], false),
  ('merge-triplets-to-form-target-triplet', 'Merge Triplets to Form Target Triplet', 'medium', array['Array / String'], false),
  ('partition-labels', 'Partition Labels', 'medium', array['Array / String'], false),
  ('valid-parenthesis-string', 'Valid Parenthesis String', 'medium', array['Array / String'], false),
  ('maximum-sum-circular-subarray', 'Maximum Sum Circular Subarray', 'medium', array['Array / String'], false),

  -- ── Hash Map / Set ───────────────────────────────────────────────────────
  ('ransom-note', 'Ransom Note', 'easy', array['Hash Map / Set'], false),
  ('isomorphic-strings', 'Isomorphic Strings', 'easy', array['Hash Map / Set'], false),
  ('word-pattern', 'Word Pattern', 'easy', array['Hash Map / Set'], false),
  ('contains-duplicate-ii', 'Contains Duplicate II', 'easy', array['Hash Map / Set'], false),
  ('encode-and-decode-strings', 'Encode and Decode Strings', 'medium', array['Hash Map / Set'], true),
  ('detect-squares', 'Detect Squares', 'medium', array['Hash Map / Set'], false),

  -- ── Two Pointers ─────────────────────────────────────────────────────────
  ('find-the-duplicate-number', 'Find the Duplicate Number', 'medium', array['Two Pointers'], false),

  -- ── Sliding Window ───────────────────────────────────────────────────────
  ('minimum-size-subarray-sum', 'Minimum Size Subarray Sum', 'medium', array['Sliding Window'], false),
  ('substring-with-concatenation-of-all-words', 'Substring with Concatenation of All Words', 'hard', array['Sliding Window'], false),

  -- ── Stack ────────────────────────────────────────────────────────────────
  ('simplify-path', 'Simplify Path', 'medium', array['Stack'], false),
  ('basic-calculator', 'Basic Calculator', 'hard', array['Stack'], false),

  -- ── Intervals ────────────────────────────────────────────────────────────
  ('summary-ranges', 'Summary Ranges', 'easy', array['Intervals'], false),
  ('meeting-rooms', 'Meeting Rooms', 'easy', array['Intervals'], true),
  ('minimum-interval-to-include-each-query', 'Minimum Interval to Include Each Query', 'hard', array['Intervals'], false),

  -- ── Linked List ──────────────────────────────────────────────────────────
  ('reverse-linked-list-ii', 'Reverse Linked List II', 'medium', array['Linked List'], false),
  ('remove-duplicates-from-sorted-list-ii', 'Remove Duplicates from Sorted List II', 'medium', array['Linked List'], false),
  ('rotate-list', 'Rotate List', 'medium', array['Linked List'], false),
  ('partition-list', 'Partition List', 'medium', array['Linked List'], false),
  ('sort-list', 'Sort List', 'medium', array['Linked List'], false),

  -- ── Binary Tree - DFS ────────────────────────────────────────────────────
  ('symmetric-tree', 'Symmetric Tree', 'easy', array['Binary Tree - DFS'], false),
  ('construct-binary-tree-from-inorder-and-postorder-traversal', 'Construct Binary Tree from Inorder and Postorder Traversal', 'medium', array['Binary Tree - DFS'], false),
  ('populating-next-right-pointers-in-each-node-ii', 'Populating Next Right Pointers in Each Node II', 'medium', array['Binary Tree - DFS'], false),
  ('flatten-binary-tree-to-linked-list', 'Flatten Binary Tree to Linked List', 'medium', array['Binary Tree - DFS'], false),
  ('path-sum', 'Path Sum', 'easy', array['Binary Tree - DFS'], false),
  ('sum-root-to-leaf-numbers', 'Sum Root to Leaf Numbers', 'medium', array['Binary Tree - DFS'], false),
  ('count-complete-tree-nodes', 'Count Complete Tree Nodes', 'easy', array['Binary Tree - DFS'], false),

  -- ── Binary Tree - BFS ────────────────────────────────────────────────────
  ('average-of-levels-in-binary-tree', 'Average of Levels in Binary Tree', 'easy', array['Binary Tree - BFS'], false),
  ('binary-tree-zigzag-level-order-traversal', 'Binary Tree Zigzag Level Order Traversal', 'medium', array['Binary Tree - BFS'], false),

  -- ── Binary Search Tree ───────────────────────────────────────────────────
  ('minimum-absolute-difference-in-bst', 'Minimum Absolute Difference in BST', 'easy', array['Binary Search Tree'], false),
  ('binary-search-tree-iterator', 'Binary Search Tree Iterator', 'medium', array['Binary Search Tree'], false),
  ('lowest-common-ancestor-of-a-binary-search-tree', 'Lowest Common Ancestor of a Binary Search Tree', 'medium', array['Binary Search Tree'], false),
  ('convert-sorted-array-to-binary-search-tree', 'Convert Sorted Array to Binary Search Tree', 'easy', array['Binary Search Tree'], false),

  -- ── Graphs - DFS / BFS ───────────────────────────────────────────────────
  ('graph-valid-tree', 'Graph Valid Tree', 'medium', array['Graphs - DFS'], true),
  ('walls-and-gates', 'Walls and Gates', 'medium', array['Graphs - BFS'], true),
  ('minimum-genetic-mutation', 'Minimum Genetic Mutation', 'medium', array['Graphs - BFS'], false),
  ('longest-increasing-path-in-a-matrix', 'Longest Increasing Path in a Matrix', 'hard', array['Graphs - DFS'], false),
  ('construct-quad-tree', 'Construct Quad Tree', 'medium', array['Graphs - DFS'], false),

  -- ── Backtracking ─────────────────────────────────────────────────────────
  ('subsets-ii', 'Subsets II', 'medium', array['Backtracking'], false),
  ('combination-sum-ii', 'Combination Sum II', 'medium', array['Backtracking'], false),
  ('palindrome-partitioning', 'Palindrome Partitioning', 'medium', array['Backtracking'], false),
  ('combinations', 'Combinations', 'medium', array['Backtracking'], false),
  ('n-queens-ii', 'N-Queens II', 'hard', array['Backtracking'], false),

  -- ── Heap / Priority Queue ────────────────────────────────────────────────
  ('kth-largest-element-in-a-stream', 'Kth Largest Element in a Stream', 'easy', array['Heap / Priority Queue'], false),
  ('design-twitter', 'Design Twitter', 'medium', array['Heap / Priority Queue'], false),
  ('ipo', 'IPO', 'hard', array['Heap / Priority Queue'], false),
  ('find-k-pairs-with-smallest-sums', 'Find K Pairs with Smallest Sums', 'medium', array['Heap / Priority Queue'], false),

  -- ── Binary Search ────────────────────────────────────────────────────────
  ('search-insert-position', 'Search Insert Position', 'easy', array['Binary Search'], false),
  ('find-first-and-last-position-of-element-in-sorted-array', 'Find First and Last Position of Element in Sorted Array', 'medium', array['Binary Search'], false),

  -- ── Bit Manipulation ─────────────────────────────────────────────────────
  ('add-binary', 'Add Binary', 'easy', array['Bit Manipulation'], false),
  ('single-number-ii', 'Single Number II', 'medium', array['Bit Manipulation'], false),
  ('bitwise-and-of-numbers-range', 'Bitwise AND of Numbers Range', 'medium', array['Bit Manipulation'], false),
  ('reverse-integer', 'Reverse Integer', 'medium', array['Bit Manipulation'], false),

  -- ── Math & Geometry ──────────────────────────────────────────────────────
  ('factorial-trailing-zeroes', 'Factorial Trailing Zeroes', 'medium', array['Math & Geometry'], false),
  ('sqrtx', 'Sqrt(x)', 'easy', array['Math & Geometry'], false),
  ('max-points-on-a-line', 'Max Points on a Line', 'hard', array['Math & Geometry'], false),

  -- ── DP - 1D ──────────────────────────────────────────────────────────────
  ('longest-palindromic-substring', 'Longest Palindromic Substring', 'medium', array['DP - 1D'], false),
  ('palindromic-substrings', 'Palindromic Substrings', 'medium', array['DP - 1D'], false),
  ('triangle', 'Triangle', 'medium', array['DP - 1D'], false),

  -- ── DP - Multidimensional ────────────────────────────────────────────────
  ('coin-change-ii', 'Coin Change II', 'medium', array['DP - Multidimensional'], false),
  ('best-time-to-buy-and-sell-stock-with-cooldown', 'Best Time to Buy and Sell Stock with Cooldown', 'medium', array['DP - Multidimensional'], false),
  ('distinct-subsequences', 'Distinct Subsequences', 'hard', array['DP - Multidimensional'], false),
  ('minimum-path-sum', 'Minimum Path Sum', 'medium', array['DP - Multidimensional'], false),
  ('unique-paths-ii', 'Unique Paths II', 'medium', array['DP - Multidimensional'], false),
  ('maximal-square', 'Maximal Square', 'medium', array['DP - Multidimensional'], false),
  ('best-time-to-buy-and-sell-stock-iii', 'Best Time to Buy and Sell Stock III', 'hard', array['DP - Multidimensional'], false),
  ('best-time-to-buy-and-sell-stock-iv', 'Best Time to Buy and Sell Stock IV', 'hard', array['DP - Multidimensional'], false)

on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Tracks
-- ---------------------------------------------------------------------------

create table if not exists tracks (
  id          text primary key,
  name        text not null,
  blurb       text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists track_problems (
  track_id     text not null references tracks(id) on delete cascade,
  problem_slug text not null references problems(slug) on delete cascade,
  section      text not null,
  position     int  not null,
  primary key (track_id, problem_slug)
);

create index if not exists track_problems_track_pos_idx
  on track_problems (track_id, position);

alter table tracks          enable row level security;
alter table track_problems  enable row level security;

-- Catalog data: readable by any signed-in user, writable only by service role.
do $$ begin
  if not exists (select 1 from pg_policies where tablename='tracks' and policyname='tracks readable') then
    create policy "tracks readable" on tracks
      for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='track_problems' and policyname='track_problems readable') then
    create policy "track_problems readable" on track_problems
      for select to authenticated using (true);
  end if;
end $$;

insert into tracks (id, name, blurb, sort_order) values
  ('blind-75',          'Blind 75',           'The classic 75. The shortest path to interview-ready.', 1),
  ('neetcode-150',      'NeetCode 150',       'Blind 75 plus the gaps it leaves. The default modern list.', 2),
  ('top-interview-150', 'Top Interview 150',  'LeetCode''s own study plan. Broadest coverage of the three.', 3)
on conflict (id) do update
  set name = excluded.name,
      blurb = excluded.blurb,
      sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- 2b. Track membership
--
-- Seeded from an ordered (section, slug) array per track so `position` stays in
-- published list order. Rows whose slug is missing from `problems` are skipped
-- rather than failing the migration, so this stays runnable if the catalog ever
-- drifts. Re-running replaces a track's membership wholesale.
-- ---------------------------------------------------------------------------

create or replace function seed_track(p_track text, p_rows text[][])
returns void language plpgsql as $$
declare
  i int;
begin
  delete from track_problems where track_id = p_track;
  for i in 1 .. array_length(p_rows, 1) loop
    insert into track_problems (track_id, problem_slug, section, position)
    select p_track, p_rows[i][2], p_rows[i][1], i
    where exists (select 1 from problems where slug = p_rows[i][2])
    on conflict do nothing;
  end loop;
end $$;

select seed_track('blind-75', array[
  ['Array','two-sum'],
  ['Array','best-time-to-buy-and-sell-stock'],
  ['Array','contains-duplicate'],
  ['Array','product-of-array-except-self'],
  ['Array','maximum-subarray'],
  ['Array','maximum-product-subarray'],
  ['Array','find-minimum-in-rotated-sorted-array'],
  ['Array','search-in-rotated-sorted-array'],
  ['Array','3sum'],
  ['Array','container-with-most-water'],
  ['Binary','sum-of-two-integers'],
  ['Binary','number-of-1-bits'],
  ['Binary','counting-bits'],
  ['Binary','missing-number'],
  ['Binary','reverse-bits'],
  ['Dynamic Programming','climbing-stairs'],
  ['Dynamic Programming','coin-change'],
  ['Dynamic Programming','longest-increasing-subsequence'],
  ['Dynamic Programming','longest-common-subsequence'],
  ['Dynamic Programming','word-break'],
  ['Dynamic Programming','combination-sum'],
  ['Dynamic Programming','house-robber'],
  ['Dynamic Programming','house-robber-ii'],
  ['Dynamic Programming','decode-ways'],
  ['Dynamic Programming','unique-paths'],
  ['Dynamic Programming','jump-game'],
  ['Graph','clone-graph'],
  ['Graph','course-schedule'],
  ['Graph','pacific-atlantic-water-flow'],
  ['Graph','number-of-islands'],
  ['Graph','longest-consecutive-sequence'],
  ['Graph','alien-dictionary'],
  ['Graph','graph-valid-tree'],
  ['Graph','number-of-connected-components-in-an-undirected-graph'],
  ['Interval','insert-interval'],
  ['Interval','merge-intervals'],
  ['Interval','non-overlapping-intervals'],
  ['Interval','meeting-rooms'],
  ['Interval','meeting-rooms-ii'],
  ['Linked List','reverse-linked-list'],
  ['Linked List','linked-list-cycle'],
  ['Linked List','merge-two-sorted-lists'],
  ['Linked List','merge-k-sorted-lists'],
  ['Linked List','remove-nth-node-from-end-of-list'],
  ['Linked List','reorder-list'],
  ['Matrix','set-matrix-zeroes'],
  ['Matrix','spiral-matrix'],
  ['Matrix','rotate-image'],
  ['Matrix','word-search'],
  ['String','longest-substring-without-repeating-characters'],
  ['String','longest-repeating-character-replacement'],
  ['String','minimum-window-substring'],
  ['String','valid-anagram'],
  ['String','group-anagrams'],
  ['String','valid-parentheses'],
  ['String','valid-palindrome'],
  ['String','longest-palindromic-substring'],
  ['String','palindromic-substrings'],
  ['String','encode-and-decode-strings'],
  ['Tree','maximum-depth-of-binary-tree'],
  ['Tree','same-tree'],
  ['Tree','invert-binary-tree'],
  ['Tree','binary-tree-maximum-path-sum'],
  ['Tree','binary-tree-level-order-traversal'],
  ['Tree','serialize-and-deserialize-binary-tree'],
  ['Tree','subtree-of-another-tree'],
  ['Tree','construct-binary-tree-from-preorder-and-inorder-traversal'],
  ['Tree','validate-binary-search-tree'],
  ['Tree','kth-smallest-element-in-a-bst'],
  ['Tree','lowest-common-ancestor-of-a-binary-search-tree'],
  ['Tree','implement-trie-prefix-tree'],
  ['Tree','design-add-and-search-words-data-structure'],
  ['Tree','word-search-ii'],
  ['Heap','top-k-frequent-elements'],
  ['Heap','find-median-from-data-stream']
]);

select seed_track('neetcode-150', array[
  ['Arrays & Hashing','contains-duplicate'],
  ['Arrays & Hashing','valid-anagram'],
  ['Arrays & Hashing','two-sum'],
  ['Arrays & Hashing','group-anagrams'],
  ['Arrays & Hashing','top-k-frequent-elements'],
  ['Arrays & Hashing','encode-and-decode-strings'],
  ['Arrays & Hashing','product-of-array-except-self'],
  ['Arrays & Hashing','valid-sudoku'],
  ['Arrays & Hashing','longest-consecutive-sequence'],
  ['Two Pointers','valid-palindrome'],
  ['Two Pointers','two-sum-ii-input-array-is-sorted'],
  ['Two Pointers','3sum'],
  ['Two Pointers','container-with-most-water'],
  ['Two Pointers','trapping-rain-water'],
  ['Sliding Window','best-time-to-buy-and-sell-stock'],
  ['Sliding Window','longest-substring-without-repeating-characters'],
  ['Sliding Window','longest-repeating-character-replacement'],
  ['Sliding Window','permutation-in-string'],
  ['Sliding Window','minimum-window-substring'],
  ['Sliding Window','sliding-window-maximum'],
  ['Stack','valid-parentheses'],
  ['Stack','min-stack'],
  ['Stack','evaluate-reverse-polish-notation'],
  ['Stack','generate-parentheses'],
  ['Stack','daily-temperatures'],
  ['Stack','car-fleet'],
  ['Stack','largest-rectangle-in-histogram'],
  ['Binary Search','binary-search'],
  ['Binary Search','search-a-2d-matrix'],
  ['Binary Search','koko-eating-bananas'],
  ['Binary Search','find-minimum-in-rotated-sorted-array'],
  ['Binary Search','search-in-rotated-sorted-array'],
  ['Binary Search','time-based-key-value-store'],
  ['Binary Search','median-of-two-sorted-arrays'],
  ['Linked List','reverse-linked-list'],
  ['Linked List','merge-two-sorted-lists'],
  ['Linked List','reorder-list'],
  ['Linked List','remove-nth-node-from-end-of-list'],
  ['Linked List','copy-list-with-random-pointer'],
  ['Linked List','add-two-numbers'],
  ['Linked List','linked-list-cycle'],
  ['Linked List','find-the-duplicate-number'],
  ['Linked List','lru-cache'],
  ['Linked List','merge-k-sorted-lists'],
  ['Linked List','reverse-nodes-in-k-group'],
  ['Trees','invert-binary-tree'],
  ['Trees','maximum-depth-of-binary-tree'],
  ['Trees','diameter-of-binary-tree'],
  ['Trees','balanced-binary-tree'],
  ['Trees','same-tree'],
  ['Trees','subtree-of-another-tree'],
  ['Trees','lowest-common-ancestor-of-a-binary-search-tree'],
  ['Trees','binary-tree-level-order-traversal'],
  ['Trees','binary-tree-right-side-view'],
  ['Trees','count-good-nodes-in-binary-tree'],
  ['Trees','validate-binary-search-tree'],
  ['Trees','kth-smallest-element-in-a-bst'],
  ['Trees','construct-binary-tree-from-preorder-and-inorder-traversal'],
  ['Trees','binary-tree-maximum-path-sum'],
  ['Trees','serialize-and-deserialize-binary-tree'],
  ['Tries','implement-trie-prefix-tree'],
  ['Tries','design-add-and-search-words-data-structure'],
  ['Tries','word-search-ii'],
  ['Heap / Priority Queue','kth-largest-element-in-a-stream'],
  ['Heap / Priority Queue','last-stone-weight'],
  ['Heap / Priority Queue','k-closest-points-to-origin'],
  ['Heap / Priority Queue','kth-largest-element-in-an-array'],
  ['Heap / Priority Queue','task-scheduler'],
  ['Heap / Priority Queue','design-twitter'],
  ['Heap / Priority Queue','find-median-from-data-stream'],
  ['Backtracking','subsets'],
  ['Backtracking','combination-sum'],
  ['Backtracking','permutations'],
  ['Backtracking','subsets-ii'],
  ['Backtracking','combination-sum-ii'],
  ['Backtracking','word-search'],
  ['Backtracking','palindrome-partitioning'],
  ['Backtracking','letter-combinations-of-a-phone-number'],
  ['Backtracking','n-queens'],
  ['Graphs','number-of-islands'],
  ['Graphs','max-area-of-island'],
  ['Graphs','clone-graph'],
  ['Graphs','walls-and-gates'],
  ['Graphs','rotting-oranges'],
  ['Graphs','pacific-atlantic-water-flow'],
  ['Graphs','surrounded-regions'],
  ['Graphs','course-schedule'],
  ['Graphs','course-schedule-ii'],
  ['Graphs','graph-valid-tree'],
  ['Graphs','number-of-connected-components-in-an-undirected-graph'],
  ['Graphs','redundant-connection'],
  ['Graphs','word-ladder'],
  ['Advanced Graphs','reconstruct-itinerary'],
  ['Advanced Graphs','min-cost-to-connect-all-points'],
  ['Advanced Graphs','network-delay-time'],
  ['Advanced Graphs','swim-in-rising-water'],
  ['Advanced Graphs','alien-dictionary'],
  ['Advanced Graphs','cheapest-flights-within-k-stops'],
  ['1-D DP','climbing-stairs'],
  ['1-D DP','min-cost-climbing-stairs'],
  ['1-D DP','house-robber'],
  ['1-D DP','house-robber-ii'],
  ['1-D DP','longest-palindromic-substring'],
  ['1-D DP','palindromic-substrings'],
  ['1-D DP','decode-ways'],
  ['1-D DP','coin-change'],
  ['1-D DP','maximum-product-subarray'],
  ['1-D DP','word-break'],
  ['1-D DP','longest-increasing-subsequence'],
  ['1-D DP','partition-equal-subset-sum'],
  ['2-D DP','unique-paths'],
  ['2-D DP','longest-common-subsequence'],
  ['2-D DP','best-time-to-buy-and-sell-stock-with-cooldown'],
  ['2-D DP','coin-change-ii'],
  ['2-D DP','target-sum'],
  ['2-D DP','interleaving-string'],
  ['2-D DP','longest-increasing-path-in-a-matrix'],
  ['2-D DP','distinct-subsequences'],
  ['2-D DP','edit-distance'],
  ['2-D DP','burst-balloons'],
  ['2-D DP','regular-expression-matching'],
  ['Greedy','maximum-subarray'],
  ['Greedy','jump-game'],
  ['Greedy','jump-game-ii'],
  ['Greedy','gas-station'],
  ['Greedy','hand-of-straights'],
  ['Greedy','merge-triplets-to-form-target-triplet'],
  ['Greedy','partition-labels'],
  ['Greedy','valid-parenthesis-string'],
  ['Intervals','insert-interval'],
  ['Intervals','merge-intervals'],
  ['Intervals','non-overlapping-intervals'],
  ['Intervals','meeting-rooms'],
  ['Intervals','meeting-rooms-ii'],
  ['Intervals','minimum-interval-to-include-each-query'],
  ['Math & Geometry','rotate-image'],
  ['Math & Geometry','spiral-matrix'],
  ['Math & Geometry','set-matrix-zeroes'],
  ['Math & Geometry','happy-number'],
  ['Math & Geometry','plus-one'],
  ['Math & Geometry','power-x-n'],
  ['Math & Geometry','multiply-strings'],
  ['Math & Geometry','detect-squares'],
  ['Bit Manipulation','single-number'],
  ['Bit Manipulation','number-of-1-bits'],
  ['Bit Manipulation','counting-bits'],
  ['Bit Manipulation','reverse-bits'],
  ['Bit Manipulation','missing-number'],
  ['Bit Manipulation','sum-of-two-integers'],
  ['Bit Manipulation','reverse-integer']
]);

select seed_track('top-interview-150', array[
  ['Array / String','merge-sorted-array'],
  ['Array / String','remove-element'],
  ['Array / String','remove-duplicates-from-sorted-array'],
  ['Array / String','remove-duplicates-from-sorted-array-ii'],
  ['Array / String','majority-element'],
  ['Array / String','rotate-array'],
  ['Array / String','best-time-to-buy-and-sell-stock'],
  ['Array / String','best-time-to-buy-and-sell-stock-ii'],
  ['Array / String','jump-game'],
  ['Array / String','jump-game-ii'],
  ['Array / String','h-index'],
  ['Array / String','insert-delete-getrandom-o1'],
  ['Array / String','product-of-array-except-self'],
  ['Array / String','gas-station'],
  ['Array / String','candy'],
  ['Array / String','trapping-rain-water'],
  ['Array / String','roman-to-integer'],
  ['Array / String','integer-to-roman'],
  ['Array / String','length-of-last-word'],
  ['Array / String','longest-common-prefix'],
  ['Array / String','reverse-words-in-a-string'],
  ['Array / String','zigzag-conversion'],
  ['Array / String','find-the-index-of-the-first-occurrence-in-a-string'],
  ['Array / String','text-justification'],
  ['Two Pointers','valid-palindrome'],
  ['Two Pointers','is-subsequence'],
  ['Two Pointers','two-sum-ii-input-array-is-sorted'],
  ['Two Pointers','container-with-most-water'],
  ['Two Pointers','3sum'],
  ['Sliding Window','minimum-size-subarray-sum'],
  ['Sliding Window','longest-substring-without-repeating-characters'],
  ['Sliding Window','substring-with-concatenation-of-all-words'],
  ['Sliding Window','minimum-window-substring'],
  ['Matrix','valid-sudoku'],
  ['Matrix','spiral-matrix'],
  ['Matrix','rotate-image'],
  ['Matrix','set-matrix-zeroes'],
  ['Matrix','game-of-life'],
  ['Hashmap','ransom-note'],
  ['Hashmap','isomorphic-strings'],
  ['Hashmap','word-pattern'],
  ['Hashmap','valid-anagram'],
  ['Hashmap','group-anagrams'],
  ['Hashmap','two-sum'],
  ['Hashmap','happy-number'],
  ['Hashmap','contains-duplicate-ii'],
  ['Hashmap','longest-consecutive-sequence'],
  ['Intervals','summary-ranges'],
  ['Intervals','merge-intervals'],
  ['Intervals','insert-interval'],
  ['Intervals','minimum-number-of-arrows-to-burst-balloons'],
  ['Stack','valid-parentheses'],
  ['Stack','simplify-path'],
  ['Stack','min-stack'],
  ['Stack','evaluate-reverse-polish-notation'],
  ['Stack','basic-calculator'],
  ['Linked List','linked-list-cycle'],
  ['Linked List','add-two-numbers'],
  ['Linked List','merge-two-sorted-lists'],
  ['Linked List','copy-list-with-random-pointer'],
  ['Linked List','reverse-linked-list-ii'],
  ['Linked List','reverse-nodes-in-k-group'],
  ['Linked List','remove-nth-node-from-end-of-list'],
  ['Linked List','remove-duplicates-from-sorted-list-ii'],
  ['Linked List','rotate-list'],
  ['Linked List','partition-list'],
  ['Linked List','lru-cache'],
  ['Binary Tree General','maximum-depth-of-binary-tree'],
  ['Binary Tree General','same-tree'],
  ['Binary Tree General','invert-binary-tree'],
  ['Binary Tree General','symmetric-tree'],
  ['Binary Tree General','construct-binary-tree-from-preorder-and-inorder-traversal'],
  ['Binary Tree General','construct-binary-tree-from-inorder-and-postorder-traversal'],
  ['Binary Tree General','populating-next-right-pointers-in-each-node-ii'],
  ['Binary Tree General','flatten-binary-tree-to-linked-list'],
  ['Binary Tree General','path-sum'],
  ['Binary Tree General','sum-root-to-leaf-numbers'],
  ['Binary Tree General','binary-tree-maximum-path-sum'],
  ['Binary Tree General','binary-search-tree-iterator'],
  ['Binary Tree General','count-complete-tree-nodes'],
  ['Binary Tree General','lowest-common-ancestor-of-a-binary-tree'],
  ['Binary Tree BFS','binary-tree-right-side-view'],
  ['Binary Tree BFS','average-of-levels-in-binary-tree'],
  ['Binary Tree BFS','binary-tree-level-order-traversal'],
  ['Binary Tree BFS','binary-tree-zigzag-level-order-traversal'],
  ['Binary Search Tree','minimum-absolute-difference-in-bst'],
  ['Binary Search Tree','kth-smallest-element-in-a-bst'],
  ['Binary Search Tree','validate-binary-search-tree'],
  ['Graph General','number-of-islands'],
  ['Graph General','surrounded-regions'],
  ['Graph General','clone-graph'],
  ['Graph General','evaluate-division'],
  ['Graph General','course-schedule'],
  ['Graph General','course-schedule-ii'],
  ['Graph BFS','snakes-and-ladders'],
  ['Graph BFS','minimum-genetic-mutation'],
  ['Graph BFS','word-ladder'],
  ['Trie','implement-trie-prefix-tree'],
  ['Trie','design-add-and-search-words-data-structure'],
  ['Trie','word-search-ii'],
  ['Backtracking','letter-combinations-of-a-phone-number'],
  ['Backtracking','combinations'],
  ['Backtracking','permutations'],
  ['Backtracking','combination-sum'],
  ['Backtracking','n-queens-ii'],
  ['Backtracking','generate-parentheses'],
  ['Backtracking','word-search'],
  ['Divide & Conquer','convert-sorted-array-to-binary-search-tree'],
  ['Divide & Conquer','sort-list'],
  ['Divide & Conquer','construct-quad-tree'],
  ['Divide & Conquer','merge-k-sorted-lists'],
  ['Kadane','maximum-subarray'],
  ['Kadane','maximum-sum-circular-subarray'],
  ['Binary Search','search-insert-position'],
  ['Binary Search','search-a-2d-matrix'],
  ['Binary Search','find-peak-element'],
  ['Binary Search','search-in-rotated-sorted-array'],
  ['Binary Search','find-first-and-last-position-of-element-in-sorted-array'],
  ['Binary Search','find-minimum-in-rotated-sorted-array'],
  ['Binary Search','median-of-two-sorted-arrays'],
  ['Heap','kth-largest-element-in-an-array'],
  ['Heap','ipo'],
  ['Heap','find-k-pairs-with-smallest-sums'],
  ['Heap','find-median-from-data-stream'],
  ['Bit Manipulation','add-binary'],
  ['Bit Manipulation','reverse-bits'],
  ['Bit Manipulation','number-of-1-bits'],
  ['Bit Manipulation','single-number'],
  ['Bit Manipulation','single-number-ii'],
  ['Bit Manipulation','bitwise-and-of-numbers-range'],
  ['Math','palindrome-number'],
  ['Math','plus-one'],
  ['Math','factorial-trailing-zeroes'],
  ['Math','sqrtx'],
  ['Math','power-x-n'],
  ['Math','max-points-on-a-line'],
  ['1-D DP','climbing-stairs'],
  ['1-D DP','house-robber'],
  ['1-D DP','word-break'],
  ['1-D DP','coin-change'],
  ['1-D DP','longest-increasing-subsequence'],
  ['Multidimensional DP','triangle'],
  ['Multidimensional DP','minimum-path-sum'],
  ['Multidimensional DP','unique-paths-ii'],
  ['Multidimensional DP','longest-palindromic-substring'],
  ['Multidimensional DP','interleaving-string'],
  ['Multidimensional DP','edit-distance'],
  ['Multidimensional DP','best-time-to-buy-and-sell-stock-iii'],
  ['Multidimensional DP','best-time-to-buy-and-sell-stock-iv'],
  ['Multidimensional DP','maximal-square']
]);

drop function if exists seed_track(text, text[][]);

-- ---------------------------------------------------------------------------
-- 3. The user's active track
-- ---------------------------------------------------------------------------

create table if not exists user_tracks (
  user_id    uuid primary key references profiles(id) on delete cascade,
  track_id   text not null references tracks(id),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_tracks enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='user_tracks' and policyname='own track select') then
    create policy "own track select" on user_tracks
      for select to authenticated using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where tablename='user_tracks' and policyname='own track insert') then
    create policy "own track insert" on user_tracks
      for insert to authenticated with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where tablename='user_tracks' and policyname='own track update') then
    create policy "own track update" on user_tracks
      for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Derived progress
--
-- The client computes this itself from `problems` + `solves` (one round trip it
-- already makes), but the view exists so the crew feed / notifications can ask
-- "how far along is this user" without duplicating the join.
-- ---------------------------------------------------------------------------

create or replace view track_progress
with (security_invoker = true) as
select
  s.user_id,
  tp.track_id,
  count(*) filter (where s.problem_slug is not null) as done,
  (select count(*) from track_problems x where x.track_id = tp.track_id) as total
from track_problems tp
join solves s on s.problem_slug = tp.problem_slug
group by s.user_id, tp.track_id;
