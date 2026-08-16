/**
 * Practice tracks — the course a user is following.
 *
 * A track is an ordered list of LeetCode problem slugs, grouped into the
 * sections the published list uses. Progress is never stored: it is always
 * recomputed by intersecting a track's slugs with the user's rows in `solves`,
 * so it moves the moment a solve lands.
 *
 * Slugs are matched against the seeded catalog
 * (supabase/migrations/0011_reseed_problems_lc75.sql). `solves.problem_slug`
 * has a foreign key onto `problems.slug`, so a slug that is not in the catalog
 * can never be solved — those entries are filtered out at read time (see
 * `resolveTrack`) rather than inflating a denominator the user cannot move.
 * supabase/migrations/0027_practice_tracks.sql backfills the 91 missing rows;
 * once it is applied every track resolves to its full published length with no
 * client change.
 *
 * One deliberate deviation: `power-x-n` is the catalog's slug for Pow(x, n)
 * (LeetCode's own slug is `powx-n`). The catalog wins because the FK does.
 */

export interface TrackSection {
  name: string;
  slugs: readonly string[];
}

export interface TrackDef {
  id: string;
  /** Shown as the active-track title. */
  name: string;
  /** One line, shown under the name in the picker. */
  blurb: string;
  sections: readonly TrackSection[];
}

/* ------------------------------------------------------------------ */

const BLIND_75: TrackDef = {
  id: 'blind-75',
  name: 'Blind 75',
  blurb: 'The classic 75. The shortest path to interview-ready.',
  sections: [
    {
      name: 'Array',
      slugs: [
        'two-sum',
        'best-time-to-buy-and-sell-stock',
        'contains-duplicate',
        'product-of-array-except-self',
        'maximum-subarray',
        'maximum-product-subarray',
        'find-minimum-in-rotated-sorted-array',
        'search-in-rotated-sorted-array',
        '3sum',
        'container-with-most-water',
      ],
    },
    {
      name: 'Binary',
      slugs: [
        'sum-of-two-integers',
        'number-of-1-bits',
        'counting-bits',
        'missing-number',
        'reverse-bits',
      ],
    },
    {
      name: 'Dynamic Programming',
      slugs: [
        'climbing-stairs',
        'coin-change',
        'longest-increasing-subsequence',
        'longest-common-subsequence',
        'word-break',
        'combination-sum',
        'house-robber',
        'house-robber-ii',
        'decode-ways',
        'unique-paths',
        'jump-game',
      ],
    },
    {
      name: 'Graph',
      slugs: [
        'clone-graph',
        'course-schedule',
        'pacific-atlantic-water-flow',
        'number-of-islands',
        'longest-consecutive-sequence',
        'alien-dictionary',
        'graph-valid-tree',
        'number-of-connected-components-in-an-undirected-graph',
      ],
    },
    {
      name: 'Interval',
      slugs: [
        'insert-interval',
        'merge-intervals',
        'non-overlapping-intervals',
        'meeting-rooms',
        'meeting-rooms-ii',
      ],
    },
    {
      name: 'Linked List',
      slugs: [
        'reverse-linked-list',
        'linked-list-cycle',
        'merge-two-sorted-lists',
        'merge-k-sorted-lists',
        'remove-nth-node-from-end-of-list',
        'reorder-list',
      ],
    },
    {
      name: 'Matrix',
      slugs: ['set-matrix-zeroes', 'spiral-matrix', 'rotate-image', 'word-search'],
    },
    {
      name: 'String',
      slugs: [
        'longest-substring-without-repeating-characters',
        'longest-repeating-character-replacement',
        'minimum-window-substring',
        'valid-anagram',
        'group-anagrams',
        'valid-parentheses',
        'valid-palindrome',
        'longest-palindromic-substring',
        'palindromic-substrings',
        'encode-and-decode-strings',
      ],
    },
    {
      name: 'Tree',
      slugs: [
        'maximum-depth-of-binary-tree',
        'same-tree',
        'invert-binary-tree',
        'binary-tree-maximum-path-sum',
        'binary-tree-level-order-traversal',
        'serialize-and-deserialize-binary-tree',
        'subtree-of-another-tree',
        'construct-binary-tree-from-preorder-and-inorder-traversal',
        'validate-binary-search-tree',
        'kth-smallest-element-in-a-bst',
        'lowest-common-ancestor-of-a-binary-search-tree',
        'implement-trie-prefix-tree',
        'design-add-and-search-words-data-structure',
        'word-search-ii',
      ],
    },
    {
      name: 'Heap',
      slugs: ['top-k-frequent-elements', 'find-median-from-data-stream'],
    },
  ],
};

const NEETCODE_150: TrackDef = {
  id: 'neetcode-150',
  name: 'NeetCode 150',
  blurb: 'Blind 75 plus the gaps it leaves. The default modern list.',
  sections: [
    {
      name: 'Arrays & Hashing',
      slugs: [
        'contains-duplicate',
        'valid-anagram',
        'two-sum',
        'group-anagrams',
        'top-k-frequent-elements',
        'encode-and-decode-strings',
        'product-of-array-except-self',
        'valid-sudoku',
        'longest-consecutive-sequence',
      ],
    },
    {
      name: 'Two Pointers',
      slugs: [
        'valid-palindrome',
        'two-sum-ii-input-array-is-sorted',
        '3sum',
        'container-with-most-water',
        'trapping-rain-water',
      ],
    },
    {
      name: 'Sliding Window',
      slugs: [
        'best-time-to-buy-and-sell-stock',
        'longest-substring-without-repeating-characters',
        'longest-repeating-character-replacement',
        'permutation-in-string',
        'minimum-window-substring',
        'sliding-window-maximum',
      ],
    },
    {
      name: 'Stack',
      slugs: [
        'valid-parentheses',
        'min-stack',
        'evaluate-reverse-polish-notation',
        'generate-parentheses',
        'daily-temperatures',
        'car-fleet',
        'largest-rectangle-in-histogram',
      ],
    },
    {
      name: 'Binary Search',
      slugs: [
        'binary-search',
        'search-a-2d-matrix',
        'koko-eating-bananas',
        'find-minimum-in-rotated-sorted-array',
        'search-in-rotated-sorted-array',
        'time-based-key-value-store',
        'median-of-two-sorted-arrays',
      ],
    },
    {
      name: 'Linked List',
      slugs: [
        'reverse-linked-list',
        'merge-two-sorted-lists',
        'reorder-list',
        'remove-nth-node-from-end-of-list',
        'copy-list-with-random-pointer',
        'add-two-numbers',
        'linked-list-cycle',
        'find-the-duplicate-number',
        'lru-cache',
        'merge-k-sorted-lists',
        'reverse-nodes-in-k-group',
      ],
    },
    {
      name: 'Trees',
      slugs: [
        'invert-binary-tree',
        'maximum-depth-of-binary-tree',
        'diameter-of-binary-tree',
        'balanced-binary-tree',
        'same-tree',
        'subtree-of-another-tree',
        'lowest-common-ancestor-of-a-binary-search-tree',
        'binary-tree-level-order-traversal',
        'binary-tree-right-side-view',
        'count-good-nodes-in-binary-tree',
        'validate-binary-search-tree',
        'kth-smallest-element-in-a-bst',
        'construct-binary-tree-from-preorder-and-inorder-traversal',
        'binary-tree-maximum-path-sum',
        'serialize-and-deserialize-binary-tree',
      ],
    },
    {
      name: 'Tries',
      slugs: [
        'implement-trie-prefix-tree',
        'design-add-and-search-words-data-structure',
        'word-search-ii',
      ],
    },
    {
      name: 'Heap / Priority Queue',
      slugs: [
        'kth-largest-element-in-a-stream',
        'last-stone-weight',
        'k-closest-points-to-origin',
        'kth-largest-element-in-an-array',
        'task-scheduler',
        'design-twitter',
        'find-median-from-data-stream',
      ],
    },
    {
      name: 'Backtracking',
      slugs: [
        'subsets',
        'combination-sum',
        'permutations',
        'subsets-ii',
        'combination-sum-ii',
        'word-search',
        'palindrome-partitioning',
        'letter-combinations-of-a-phone-number',
        'n-queens',
      ],
    },
    {
      name: 'Graphs',
      slugs: [
        'number-of-islands',
        'max-area-of-island',
        'clone-graph',
        'walls-and-gates',
        'rotting-oranges',
        'pacific-atlantic-water-flow',
        'surrounded-regions',
        'course-schedule',
        'course-schedule-ii',
        'graph-valid-tree',
        'number-of-connected-components-in-an-undirected-graph',
        'redundant-connection',
        'word-ladder',
      ],
    },
    {
      name: 'Advanced Graphs',
      slugs: [
        'reconstruct-itinerary',
        'min-cost-to-connect-all-points',
        'network-delay-time',
        'swim-in-rising-water',
        'alien-dictionary',
        'cheapest-flights-within-k-stops',
      ],
    },
    {
      name: '1-D DP',
      slugs: [
        'climbing-stairs',
        'min-cost-climbing-stairs',
        'house-robber',
        'house-robber-ii',
        'longest-palindromic-substring',
        'palindromic-substrings',
        'decode-ways',
        'coin-change',
        'maximum-product-subarray',
        'word-break',
        'longest-increasing-subsequence',
        'partition-equal-subset-sum',
      ],
    },
    {
      name: '2-D DP',
      slugs: [
        'unique-paths',
        'longest-common-subsequence',
        'best-time-to-buy-and-sell-stock-with-cooldown',
        'coin-change-ii',
        'target-sum',
        'interleaving-string',
        'longest-increasing-path-in-a-matrix',
        'distinct-subsequences',
        'edit-distance',
        'burst-balloons',
        'regular-expression-matching',
      ],
    },
    {
      name: 'Greedy',
      slugs: [
        'maximum-subarray',
        'jump-game',
        'jump-game-ii',
        'gas-station',
        'hand-of-straights',
        'merge-triplets-to-form-target-triplet',
        'partition-labels',
        'valid-parenthesis-string',
      ],
    },
    {
      name: 'Intervals',
      slugs: [
        'insert-interval',
        'merge-intervals',
        'non-overlapping-intervals',
        'meeting-rooms',
        'meeting-rooms-ii',
        'minimum-interval-to-include-each-query',
      ],
    },
    {
      name: 'Math & Geometry',
      slugs: [
        'rotate-image',
        'spiral-matrix',
        'set-matrix-zeroes',
        'happy-number',
        'plus-one',
        'power-x-n',
        'multiply-strings',
        'detect-squares',
      ],
    },
    {
      name: 'Bit Manipulation',
      slugs: [
        'single-number',
        'number-of-1-bits',
        'counting-bits',
        'reverse-bits',
        'missing-number',
        'sum-of-two-integers',
        'reverse-integer',
      ],
    },
  ],
};

const TOP_INTERVIEW_150: TrackDef = {
  id: 'top-interview-150',
  name: 'Top Interview 150',
  blurb: "LeetCode's own study plan. Broadest coverage of the three.",
  sections: [
    {
      name: 'Array / String',
      slugs: [
        'merge-sorted-array',
        'remove-element',
        'remove-duplicates-from-sorted-array',
        'remove-duplicates-from-sorted-array-ii',
        'majority-element',
        'rotate-array',
        'best-time-to-buy-and-sell-stock',
        'best-time-to-buy-and-sell-stock-ii',
        'jump-game',
        'jump-game-ii',
        'h-index',
        'insert-delete-getrandom-o1',
        'product-of-array-except-self',
        'gas-station',
        'candy',
        'trapping-rain-water',
        'roman-to-integer',
        'integer-to-roman',
        'length-of-last-word',
        'longest-common-prefix',
        'reverse-words-in-a-string',
        'zigzag-conversion',
        'find-the-index-of-the-first-occurrence-in-a-string',
        'text-justification',
      ],
    },
    {
      name: 'Two Pointers',
      slugs: [
        'valid-palindrome',
        'is-subsequence',
        'two-sum-ii-input-array-is-sorted',
        'container-with-most-water',
        '3sum',
      ],
    },
    {
      name: 'Sliding Window',
      slugs: [
        'minimum-size-subarray-sum',
        'longest-substring-without-repeating-characters',
        'substring-with-concatenation-of-all-words',
        'minimum-window-substring',
      ],
    },
    {
      name: 'Matrix',
      slugs: [
        'valid-sudoku',
        'spiral-matrix',
        'rotate-image',
        'set-matrix-zeroes',
        'game-of-life',
      ],
    },
    {
      name: 'Hashmap',
      slugs: [
        'ransom-note',
        'isomorphic-strings',
        'word-pattern',
        'valid-anagram',
        'group-anagrams',
        'two-sum',
        'happy-number',
        'contains-duplicate-ii',
        'longest-consecutive-sequence',
      ],
    },
    {
      name: 'Intervals',
      slugs: [
        'summary-ranges',
        'merge-intervals',
        'insert-interval',
        'minimum-number-of-arrows-to-burst-balloons',
      ],
    },
    {
      name: 'Stack',
      slugs: [
        'valid-parentheses',
        'simplify-path',
        'min-stack',
        'evaluate-reverse-polish-notation',
        'basic-calculator',
      ],
    },
    {
      name: 'Linked List',
      slugs: [
        'linked-list-cycle',
        'add-two-numbers',
        'merge-two-sorted-lists',
        'copy-list-with-random-pointer',
        'reverse-linked-list-ii',
        'reverse-nodes-in-k-group',
        'remove-nth-node-from-end-of-list',
        'remove-duplicates-from-sorted-list-ii',
        'rotate-list',
        'partition-list',
        'lru-cache',
      ],
    },
    {
      name: 'Binary Tree General',
      slugs: [
        'maximum-depth-of-binary-tree',
        'same-tree',
        'invert-binary-tree',
        'symmetric-tree',
        'construct-binary-tree-from-preorder-and-inorder-traversal',
        'construct-binary-tree-from-inorder-and-postorder-traversal',
        'populating-next-right-pointers-in-each-node-ii',
        'flatten-binary-tree-to-linked-list',
        'path-sum',
        'sum-root-to-leaf-numbers',
        'binary-tree-maximum-path-sum',
        'binary-search-tree-iterator',
        'count-complete-tree-nodes',
        'lowest-common-ancestor-of-a-binary-tree',
      ],
    },
    {
      name: 'Binary Tree BFS',
      slugs: [
        'binary-tree-right-side-view',
        'average-of-levels-in-binary-tree',
        'binary-tree-level-order-traversal',
        'binary-tree-zigzag-level-order-traversal',
      ],
    },
    {
      name: 'Binary Search Tree',
      slugs: [
        'minimum-absolute-difference-in-bst',
        'kth-smallest-element-in-a-bst',
        'validate-binary-search-tree',
      ],
    },
    {
      name: 'Graph General',
      slugs: [
        'number-of-islands',
        'surrounded-regions',
        'clone-graph',
        'evaluate-division',
        'course-schedule',
        'course-schedule-ii',
      ],
    },
    {
      name: 'Graph BFS',
      slugs: ['snakes-and-ladders', 'minimum-genetic-mutation', 'word-ladder'],
    },
    {
      name: 'Trie',
      slugs: [
        'implement-trie-prefix-tree',
        'design-add-and-search-words-data-structure',
        'word-search-ii',
      ],
    },
    {
      name: 'Backtracking',
      slugs: [
        'letter-combinations-of-a-phone-number',
        'combinations',
        'permutations',
        'combination-sum',
        'n-queens-ii',
        'generate-parentheses',
        'word-search',
      ],
    },
    {
      name: 'Divide & Conquer',
      slugs: [
        'convert-sorted-array-to-binary-search-tree',
        'sort-list',
        'construct-quad-tree',
        'merge-k-sorted-lists',
      ],
    },
    {
      name: 'Kadane',
      slugs: ['maximum-subarray', 'maximum-sum-circular-subarray'],
    },
    {
      name: 'Binary Search',
      slugs: [
        'search-insert-position',
        'search-a-2d-matrix',
        'find-peak-element',
        'search-in-rotated-sorted-array',
        'find-first-and-last-position-of-element-in-sorted-array',
        'find-minimum-in-rotated-sorted-array',
        'median-of-two-sorted-arrays',
      ],
    },
    {
      name: 'Heap',
      slugs: [
        'kth-largest-element-in-an-array',
        'ipo',
        'find-k-pairs-with-smallest-sums',
        'find-median-from-data-stream',
      ],
    },
    {
      name: 'Bit Manipulation',
      slugs: [
        'add-binary',
        'reverse-bits',
        'number-of-1-bits',
        'single-number',
        'single-number-ii',
        'bitwise-and-of-numbers-range',
      ],
    },
    {
      name: 'Math',
      slugs: [
        'palindrome-number',
        'plus-one',
        'factorial-trailing-zeroes',
        'sqrtx',
        'power-x-n',
        'max-points-on-a-line',
      ],
    },
    {
      name: '1-D DP',
      slugs: [
        'climbing-stairs',
        'house-robber',
        'word-break',
        'coin-change',
        'longest-increasing-subsequence',
      ],
    },
    {
      name: 'Multidimensional DP',
      slugs: [
        'triangle',
        'minimum-path-sum',
        'unique-paths-ii',
        'longest-palindromic-substring',
        'interleaving-string',
        'edit-distance',
        'best-time-to-buy-and-sell-stock-iii',
        'best-time-to-buy-and-sell-stock-iv',
        'maximal-square',
      ],
    },
  ],
};

export const TRACKS: readonly TrackDef[] = [BLIND_75, NEETCODE_150, TOP_INTERVIEW_150];

export const DEFAULT_TRACK_ID = BLIND_75.id;

export const trackById = (id: string): TrackDef =>
  TRACKS.find((t) => t.id === id) ?? BLIND_75;

/** Published length, before catalog filtering. `Blind 75` → 75. */
export const trackLength = (t: TrackDef): number =>
  t.sections.reduce((n, sec) => n + sec.slugs.length, 0);

/** Every slug in a track, in list order, de-duplicated. */
export function trackSlugs(t: TrackDef): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const sec of t.sections) {
    for (const slug of sec.slugs) {
      if (seen.has(slug)) continue;
      seen.add(slug);
      out.push(slug);
    }
  }
  return out;
}
