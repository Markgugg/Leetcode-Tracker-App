/**
 * Bundled ready-made packs — lists we ship inside the app because their
 * publisher has no API to import them from.
 *
 * NeetCode is the only one so far. It has **no official public API**: neetcode.io
 * serves its roadmap from a static bundle, there is no documented endpoint, and
 * scraping it from a phone would break the first time the site is rebuilt. So
 * the slug list lives here, in the app, and the UI says so out loud
 * (`BundledPack.disclosure`) rather than implying a live sync.
 *
 * NeetCode 150 is already a built-in track (`tracks.ts`). This module adds
 * NeetCode 250 — the same eighteen categories, extended with the problems the
 * 250 adds on top of the 150.
 *
 * Adding one of these creates a normal custom pack (`packs.ts`), so it is
 * renameable, deletable, and resolved against the catalog by exactly the same
 * `resolveTrack` path as the three built-in tracks. Slugs that are not in the
 * seeded catalog are dropped at read time and reported in the footnote, same as
 * every other list.
 */
import type { TrackDef, TrackSection } from './tracks';

export interface BundledPack {
  def: TrackDef;
  /** One honest line about where the list came from. Always rendered. */
  disclosure: string;
}

/* ------------------------------------------------------------------ */
/* NeetCode 250                                                        */
/* ------------------------------------------------------------------ */

const NC250_SECTIONS: readonly TrackSection[] = [
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
      'concatenation-of-array',
      'remove-element',
      'majority-element',
      'design-hashset',
      'design-hashmap',
      'sort-an-array',
      'sort-colors',
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
      'merge-strings-alternately',
      'is-subsequence',
      'remove-duplicates-from-sorted-array',
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
      'contains-duplicate-ii',
      'minimum-size-subarray-sum',
      'find-k-closest-elements',
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
      'baseball-game',
      'asteroid-collision',
      'online-stock-span',
      'simplify-path',
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
      'search-insert-position',
      'guess-number-higher-or-lower',
      'sqrtx',
      'capacity-to-ship-packages-within-d-days',
      'split-array-largest-sum',
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
      'remove-duplicates-from-sorted-list',
      'palindrome-linked-list',
      'middle-of-the-linked-list',
      'design-linked-list',
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
      'binary-tree-inorder-traversal',
      'binary-tree-preorder-traversal',
      'binary-tree-postorder-traversal',
      'path-sum',
      'symmetric-tree',
      'minimum-absolute-difference-in-bst',
      'convert-sorted-array-to-binary-search-tree',
    ],
  },
  {
    name: 'Tries',
    slugs: [
      'implement-trie-prefix-tree',
      'design-add-and-search-words-data-structure',
      'word-search-ii',
      'extra-characters-in-a-string',
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
      'single-threaded-cpu',
      'reorganize-string',
      'longest-happy-string',
      'car-pooling',
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
      'binary-tree-paths',
      'combinations',
      'permutations-ii',
      'matchsticks-to-square',
      'partition-to-k-equal-sum-subsets',
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
      'island-perimeter',
      'find-the-town-judge',
      'open-the-lock',
      'snakes-and-ladders',
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
      'path-with-minimum-effort',
      'find-the-city-with-the-smallest-number-of-neighbors-at-a-threshold-distance',
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
      'n-th-tribonacci-number',
      'delete-and-earn',
      'perfect-squares',
      'integer-break',
      'stone-game',
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
      'minimum-path-sum',
      'unique-paths-ii',
      'maximal-square',
      'cherry-pickup-ii',
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
      'two-city-scheduling',
      'boats-to-save-people',
      'largest-number',
      'eliminate-maximum-number-of-monsters',
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
      'minimum-number-of-arrows-to-burst-balloons',
      'my-calendar-i',
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
      'insert-delete-getrandom-o1',
      'roman-to-integer',
      'integer-to-roman',
      'greatest-common-divisor-of-strings',
      'transpose-matrix',
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
      'add-binary',
      'minimum-bit-flips-to-convert-number',
      'add-to-array-form-of-integer',
    ],
  },
];

const NEETCODE_250: TrackDef = {
  id: 'neetcode-250',
  name: 'NeetCode 250',
  blurb: 'The 150 plus a second pass on every category.',
  sections: NC250_SECTIONS,
};

export const BUNDLED_PACKS: readonly BundledPack[] = [
  {
    def: NEETCODE_250,
    disclosure:
      'NeetCode publishes no API, so this list ships inside the app and is maintained by us — the number on the right is what we actually carry, not what the site claims.',
  },
];

export const bundledById = (id: string): BundledPack | undefined =>
  BUNDLED_PACKS.find((b) => b.def.id === id);
