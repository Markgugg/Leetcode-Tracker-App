-- Full reseed aligned with LeetCode 75 category names.
-- Covers all 75 LC75 problems + classic extras per topic.
-- ON CONFLICT DO UPDATE so this is safe to re-run.

insert into problems (slug, title, difficulty, tags, is_premium) values

  -- ── Array / String ─────────────────────────────────────────────────────────
  ('two-sum', 'Two Sum', 'easy', array['Array / String'], false),
  ('best-time-to-buy-and-sell-stock', 'Best Time to Buy and Sell Stock', 'easy', array['Array / String'], false),
  ('contains-duplicate', 'Contains Duplicate', 'easy', array['Array / String'], false),
  ('merge-strings-alternately', 'Merge Strings Alternately', 'easy', array['Array / String'], false),
  ('greatest-common-divisor-of-strings', 'Greatest Common Divisor of Strings', 'easy', array['Array / String'], false),
  ('kids-with-the-greatest-number-of-candies', 'Kids With the Greatest Number of Candies', 'easy', array['Array / String'], false),
  ('can-place-flowers', 'Can Place Flowers', 'easy', array['Array / String'], false),
  ('reverse-vowels-of-a-string', 'Reverse Vowels of a String', 'easy', array['Array / String'], false),
  ('reverse-words-in-a-string', 'Reverse Words in a String', 'medium', array['Array / String'], false),
  ('product-of-array-except-self', 'Product of Array Except Self', 'medium', array['Array / String'], false),
  ('increasing-triplet-subsequence', 'Increasing Triplet Subsequence', 'medium', array['Array / String'], false),
  ('string-compression', 'String Compression', 'medium', array['Array / String'], false),
  ('maximum-subarray', 'Maximum Subarray', 'medium', array['Array / String'], false),
  ('spiral-matrix', 'Spiral Matrix', 'medium', array['Array / String'], false),
  ('rotate-image', 'Rotate Image', 'medium', array['Array / String'], false),
  ('set-matrix-zeroes', 'Set Matrix Zeroes', 'medium', array['Array / String'], false),
  ('jump-game', 'Jump Game', 'medium', array['Array / String'], false),
  ('first-missing-positive', 'First Missing Positive', 'hard', array['Array / String'], false),
  ('trapping-rain-water', 'Trapping Rain Water', 'hard', array['Array / String'], false),

  -- ── Two Pointers ───────────────────────────────────────────────────────────
  ('move-zeroes', 'Move Zeroes', 'easy', array['Two Pointers'], false),
  ('is-subsequence', 'Is Subsequence', 'easy', array['Two Pointers'], false),
  ('valid-palindrome', 'Valid Palindrome', 'easy', array['Two Pointers'], false),
  ('remove-duplicates-from-sorted-array', 'Remove Duplicates from Sorted Array', 'easy', array['Two Pointers'], false),
  ('squares-of-a-sorted-array', 'Squares of a Sorted Array', 'easy', array['Two Pointers'], false),
  ('container-with-most-water', 'Container With Most Water', 'medium', array['Two Pointers'], false),
  ('max-number-of-k-sum-pairs', 'Max Number of K-Sum Pairs', 'medium', array['Two Pointers'], false),
  ('two-sum-ii-input-array-is-sorted', 'Two Sum II - Input Array Is Sorted', 'medium', array['Two Pointers'], false),
  ('sort-colors', 'Sort Colors', 'medium', array['Two Pointers'], false),
  ('3sum', '3Sum', 'medium', array['Two Pointers'], false),
  ('4sum', '4Sum', 'medium', array['Two Pointers'], false),

  -- ── Sliding Window ─────────────────────────────────────────────────────────
  ('maximum-average-subarray-i', 'Maximum Average Subarray I', 'easy', array['Sliding Window'], false),
  ('maximum-number-of-vowels-in-a-substring-of-given-length', 'Maximum Number of Vowels in a Substring of Given Length', 'medium', array['Sliding Window'], false),
  ('max-consecutive-ones-iii', 'Max Consecutive Ones III', 'medium', array['Sliding Window'], false),
  ('longest-subarray-of-1s-after-deleting-one-element', 'Longest Subarray of 1''s After Deleting One Element', 'medium', array['Sliding Window'], false),
  ('longest-substring-without-repeating-characters', 'Longest Substring Without Repeating Characters', 'medium', array['Sliding Window'], false),
  ('longest-repeating-character-replacement', 'Longest Repeating Character Replacement', 'medium', array['Sliding Window'], false),
  ('permutation-in-string', 'Permutation in String', 'medium', array['Sliding Window'], false),
  ('fruit-into-baskets', 'Fruit Into Baskets', 'medium', array['Sliding Window'], false),
  ('subarray-sum-equals-k', 'Subarray Sum Equals K', 'medium', array['Sliding Window'], false),
  ('minimum-window-substring', 'Minimum Window Substring', 'hard', array['Sliding Window'], false),
  ('sliding-window-maximum', 'Sliding Window Maximum', 'hard', array['Sliding Window'], false),

  -- ── Prefix Sum ─────────────────────────────────────────────────────────────
  ('find-the-highest-altitude', 'Find the Highest Altitude', 'easy', array['Prefix Sum'], false),
  ('find-pivot-index', 'Find Pivot Index', 'easy', array['Prefix Sum'], false),
  ('range-sum-query-immutable', 'Range Sum Query - Immutable', 'easy', array['Prefix Sum'], false),
  ('running-sum-of-1d-array', 'Running Sum of 1d Array', 'easy', array['Prefix Sum'], false),
  ('contiguous-array', 'Contiguous Array', 'medium', array['Prefix Sum'], false),

  -- ── Hash Map / Set ─────────────────────────────────────────────────────────
  ('find-the-difference-of-two-arrays', 'Find the Difference of Two Arrays', 'easy', array['Hash Map / Set'], false),
  ('unique-number-of-occurrences', 'Unique Number of Occurrences', 'easy', array['Hash Map / Set'], false),
  ('determine-if-two-strings-are-close', 'Determine if Two Strings Are Close', 'medium', array['Hash Map / Set'], false),
  ('equal-row-and-column-pairs', 'Equal Row and Column Pairs', 'medium', array['Hash Map / Set'], false),
  ('group-anagrams', 'Group Anagrams', 'medium', array['Hash Map / Set'], false),
  ('top-k-frequent-elements', 'Top K Frequent Elements', 'medium', array['Hash Map / Set'], false),
  ('valid-anagram', 'Valid Anagram', 'easy', array['Hash Map / Set'], false),
  ('longest-consecutive-sequence', 'Longest Consecutive Sequence', 'medium', array['Hash Map / Set'], false),

  -- ── Stack ──────────────────────────────────────────────────────────────────
  ('removing-stars-from-a-string', 'Removing Stars From a String', 'medium', array['Stack'], false),
  ('asteroid-collision', 'Asteroid Collision', 'medium', array['Stack'], false),
  ('decode-string', 'Decode String', 'medium', array['Stack'], false),
  ('valid-parentheses', 'Valid Parentheses', 'easy', array['Stack'], false),
  ('min-stack', 'Min Stack', 'medium', array['Stack'], false),
  ('evaluate-reverse-polish-notation', 'Evaluate Reverse Polish Notation', 'medium', array['Stack'], false),
  ('generate-parentheses', 'Generate Parentheses', 'medium', array['Stack'], false),
  ('car-fleet', 'Car Fleet', 'medium', array['Stack'], false),

  -- ── Queue ──────────────────────────────────────────────────────────────────
  ('number-of-recent-calls', 'Number of Recent Calls', 'easy', array['Queue'], false),
  ('dota2-senate', 'Dota2 Senate', 'medium', array['Queue'], false),
  ('design-circular-queue', 'Design Circular Queue', 'medium', array['Queue'], false),

  -- ── Linked List ────────────────────────────────────────────────────────────
  ('reverse-linked-list', 'Reverse Linked List', 'easy', array['Linked List'], false),
  ('merge-two-sorted-lists', 'Merge Two Sorted Lists', 'easy', array['Linked List'], false),
  ('linked-list-cycle', 'Linked List Cycle', 'easy', array['Linked List'], false),
  ('delete-the-middle-node-of-a-linked-list', 'Delete the Middle Node of a Linked List', 'medium', array['Linked List'], false),
  ('odd-even-linked-list', 'Odd Even Linked List', 'medium', array['Linked List'], false),
  ('maximum-twin-sum-of-a-linked-list', 'Maximum Twin Sum of a Linked List', 'medium', array['Linked List'], false),
  ('reorder-list', 'Reorder List', 'medium', array['Linked List'], false),
  ('remove-nth-node-from-end-of-list', 'Remove Nth Node From End of List', 'medium', array['Linked List'], false),
  ('copy-list-with-random-pointer', 'Copy List with Random Pointer', 'medium', array['Linked List'], false),
  ('lru-cache', 'LRU Cache', 'medium', array['Linked List'], false),
  ('add-two-numbers', 'Add Two Numbers', 'medium', array['Linked List'], false),
  ('merge-k-sorted-lists', 'Merge k Sorted Lists', 'hard', array['Linked List'], false),
  ('reverse-nodes-in-k-group', 'Reverse Nodes in k-Group', 'hard', array['Linked List'], false),

  -- ── Binary Tree - DFS ──────────────────────────────────────────────────────
  ('maximum-depth-of-binary-tree', 'Maximum Depth of Binary Tree', 'easy', array['Binary Tree - DFS'], false),
  ('leaf-similar-trees', 'Leaf-Similar Trees', 'easy', array['Binary Tree - DFS'], false),
  ('invert-binary-tree', 'Invert Binary Tree', 'easy', array['Binary Tree - DFS'], false),
  ('diameter-of-binary-tree', 'Diameter of Binary Tree', 'easy', array['Binary Tree - DFS'], false),
  ('balanced-binary-tree', 'Balanced Binary Tree', 'easy', array['Binary Tree - DFS'], false),
  ('same-tree', 'Same Tree', 'easy', array['Binary Tree - DFS'], false),
  ('subtree-of-another-tree', 'Subtree of Another Tree', 'easy', array['Binary Tree - DFS'], false),
  ('count-good-nodes-in-binary-tree', 'Count Good Nodes in Binary Tree', 'medium', array['Binary Tree - DFS'], false),
  ('path-sum-iii', 'Path Sum III', 'medium', array['Binary Tree - DFS'], false),
  ('longest-zigzag-path-in-a-binary-tree', 'Longest ZigZag Path in a Binary Tree', 'medium', array['Binary Tree - DFS'], false),
  ('lowest-common-ancestor-of-a-binary-tree', 'Lowest Common Ancestor of a Binary Tree', 'medium', array['Binary Tree - DFS'], false),
  ('construct-binary-tree-from-preorder-and-inorder-traversal', 'Construct Binary Tree from Preorder and Inorder Traversal', 'medium', array['Binary Tree - DFS'], false),
  ('binary-tree-maximum-path-sum', 'Binary Tree Maximum Path Sum', 'hard', array['Binary Tree - DFS'], false),
  ('serialize-and-deserialize-binary-tree', 'Serialize and Deserialize Binary Tree', 'hard', array['Binary Tree - DFS'], false),

  -- ── Binary Tree - BFS ──────────────────────────────────────────────────────
  ('binary-tree-right-side-view', 'Binary Tree Right Side View', 'medium', array['Binary Tree - BFS'], false),
  ('maximum-level-sum-of-a-binary-tree', 'Maximum Level Sum of a Binary Tree', 'medium', array['Binary Tree - BFS'], false),
  ('binary-tree-level-order-traversal', 'Binary Tree Level Order Traversal', 'medium', array['Binary Tree - BFS'], false),
  ('populating-next-right-pointers-in-each-node', 'Populating Next Right Pointers in Each Node', 'medium', array['Binary Tree - BFS'], false),

  -- ── Binary Search Tree ─────────────────────────────────────────────────────
  ('search-in-a-binary-search-tree', 'Search in a Binary Search Tree', 'easy', array['Binary Search Tree'], false),
  ('delete-node-in-a-bst', 'Delete Node in a BST', 'medium', array['Binary Search Tree'], false),
  ('validate-binary-search-tree', 'Validate Binary Search Tree', 'medium', array['Binary Search Tree'], false),
  ('kth-smallest-element-in-a-bst', 'Kth Smallest Element in a BST', 'medium', array['Binary Search Tree'], false),

  -- ── Graphs - DFS ───────────────────────────────────────────────────────────
  ('keys-and-rooms', 'Keys and Rooms', 'medium', array['Graphs - DFS'], false),
  ('number-of-provinces', 'Number of Provinces', 'medium', array['Graphs - DFS'], false),
  ('reorder-routes-to-make-all-paths-lead-to-the-city-zero', 'Reorder Routes to Make All Paths Lead to the City Zero', 'medium', array['Graphs - DFS'], false),
  ('evaluate-division', 'Evaluate Division', 'medium', array['Graphs - DFS'], false),
  ('number-of-islands', 'Number of Islands', 'medium', array['Graphs - DFS'], false),
  ('clone-graph', 'Clone Graph', 'medium', array['Graphs - DFS'], false),
  ('max-area-of-island', 'Max Area of Island', 'medium', array['Graphs - DFS'], false),
  ('pacific-atlantic-water-flow', 'Pacific Atlantic Water Flow', 'medium', array['Graphs - DFS'], false),
  ('course-schedule', 'Course Schedule', 'medium', array['Graphs - DFS'], false),
  ('course-schedule-ii', 'Course Schedule II', 'medium', array['Graphs - DFS'], false),
  ('surrounded-regions', 'Surrounded Regions', 'medium', array['Graphs - DFS'], false),

  -- ── Graphs - BFS ───────────────────────────────────────────────────────────
  ('nearest-exit-from-entrance-in-maze', 'Nearest Exit from Entrance in Maze', 'medium', array['Graphs - BFS'], false),
  ('rotting-oranges', 'Rotting Oranges', 'medium', array['Graphs - BFS'], false),
  ('word-ladder', 'Word Ladder', 'hard', array['Graphs - BFS'], false),
  ('snakes-and-ladders', 'Snakes and Ladders', 'medium', array['Graphs - BFS'], false),

  -- ── Heap / Priority Queue ──────────────────────────────────────────────────
  ('kth-largest-element-in-an-array', 'Kth Largest Element in an Array', 'medium', array['Heap / Priority Queue'], false),
  ('smallest-number-in-infinite-set', 'Smallest Number in Infinite Set', 'medium', array['Heap / Priority Queue'], false),
  ('maximum-subsequence-score', 'Maximum Subsequence Score', 'medium', array['Heap / Priority Queue'], false),
  ('total-cost-to-hire-k-workers', 'Total Cost to Hire K Workers', 'medium', array['Heap / Priority Queue'], false),
  ('find-median-from-data-stream', 'Find Median from Data Stream', 'hard', array['Heap / Priority Queue'], false),
  ('task-scheduler', 'Task Scheduler', 'medium', array['Heap / Priority Queue'], false),
  ('k-closest-points-to-origin', 'K Closest Points to Origin', 'medium', array['Heap / Priority Queue'], false),
  ('last-stone-weight', 'Last Stone Weight', 'easy', array['Heap / Priority Queue'], false),

  -- ── Binary Search ──────────────────────────────────────────────────────────
  ('binary-search', 'Binary Search', 'easy', array['Binary Search'], false),
  ('guess-number-higher-or-lower', 'Guess Number Higher or Lower', 'easy', array['Binary Search'], false),
  ('successful-pairs-of-spells-and-potions', 'Successful Pairs of Spells and Potions', 'medium', array['Binary Search'], false),
  ('find-peak-element', 'Find Peak Element', 'medium', array['Binary Search'], false),
  ('koko-eating-bananas', 'Koko Eating Bananas', 'medium', array['Binary Search'], false),
  ('search-a-2d-matrix', 'Search a 2D Matrix', 'medium', array['Binary Search'], false),
  ('find-minimum-in-rotated-sorted-array', 'Find Minimum in Rotated Sorted Array', 'medium', array['Binary Search'], false),
  ('search-in-rotated-sorted-array', 'Search in Rotated Sorted Array', 'medium', array['Binary Search'], false),
  ('time-based-key-value-store', 'Time Based Key-Value Store', 'medium', array['Binary Search'], false),
  ('median-of-two-sorted-arrays', 'Median of Two Sorted Arrays', 'hard', array['Binary Search'], false),

  -- ── Backtracking ───────────────────────────────────────────────────────────
  ('letter-combinations-of-a-phone-number', 'Letter Combinations of a Phone Number', 'medium', array['Backtracking'], false),
  ('combination-sum-iii', 'Combination Sum III', 'medium', array['Backtracking'], false),
  ('combination-sum', 'Combination Sum', 'medium', array['Backtracking'], false),
  ('permutations', 'Permutations', 'medium', array['Backtracking'], false),
  ('subsets', 'Subsets', 'medium', array['Backtracking'], false),
  ('word-search', 'Word Search', 'medium', array['Backtracking'], false),
  ('n-queens', 'N-Queens', 'hard', array['Backtracking'], false),

  -- ── DP - 1D ────────────────────────────────────────────────────────────────
  ('n-th-tribonacci-number', 'N-th Tribonacci Number', 'easy', array['DP - 1D'], false),
  ('min-cost-climbing-stairs', 'Min Cost Climbing Stairs', 'easy', array['DP - 1D'], false),
  ('climbing-stairs', 'Climbing Stairs', 'easy', array['DP - 1D'], false),
  ('house-robber', 'House Robber', 'medium', array['DP - 1D'], false),
  ('house-robber-ii', 'House Robber II', 'medium', array['DP - 1D'], false),
  ('domino-and-tromino-tiling', 'Domino and Tromino Tiling', 'medium', array['DP - 1D'], false),
  ('decode-ways', 'Decode Ways', 'medium', array['DP - 1D'], false),
  ('coin-change', 'Coin Change', 'medium', array['DP - 1D'], false),
  ('word-break', 'Word Break', 'medium', array['DP - 1D'], false),
  ('longest-increasing-subsequence', 'Longest Increasing Subsequence', 'medium', array['DP - 1D'], false),
  ('maximum-product-subarray', 'Maximum Product Subarray', 'medium', array['DP - 1D'], false),

  -- ── DP - Multidimensional ──────────────────────────────────────────────────
  ('unique-paths', 'Unique Paths', 'medium', array['DP - Multidimensional'], false),
  ('longest-common-subsequence', 'Longest Common Subsequence', 'medium', array['DP - Multidimensional'], false),
  ('best-time-to-buy-and-sell-stock-with-transaction-fee', 'Best Time to Buy and Sell Stock with Transaction Fee', 'medium', array['DP - Multidimensional'], false),
  ('edit-distance', 'Edit Distance', 'medium', array['DP - Multidimensional'], false),
  ('interleaving-string', 'Interleaving String', 'medium', array['DP - Multidimensional'], false),
  ('target-sum', 'Target Sum', 'medium', array['DP - Multidimensional'], false),
  ('partition-equal-subset-sum', 'Partition Equal Subset Sum', 'medium', array['DP - Multidimensional'], false),
  ('burst-balloons', 'Burst Balloons', 'hard', array['DP - Multidimensional'], false),
  ('regular-expression-matching', 'Regular Expression Matching', 'hard', array['DP - Multidimensional'], false),

  -- ── Bit Manipulation ───────────────────────────────────────────────────────
  ('counting-bits', 'Counting Bits', 'easy', array['Bit Manipulation'], false),
  ('single-number', 'Single Number', 'easy', array['Bit Manipulation'], false),
  ('number-of-1-bits', 'Number of 1 Bits', 'easy', array['Bit Manipulation'], false),
  ('reverse-bits', 'Reverse Bits', 'easy', array['Bit Manipulation'], false),
  ('missing-number', 'Missing Number', 'easy', array['Bit Manipulation'], false),
  ('minimum-flips-to-make-a-or-b-equal-to-c', 'Minimum Flips to Make a OR b Equal to c', 'medium', array['Bit Manipulation'], false),
  ('sum-of-two-integers', 'Sum of Two Integers', 'medium', array['Bit Manipulation'], false),

  -- ── Trie ───────────────────────────────────────────────────────────────────
  ('implement-trie-prefix-tree', 'Implement Trie (Prefix Tree)', 'medium', array['Trie'], false),
  ('search-suggestions-system', 'Search Suggestions System', 'medium', array['Trie'], false),
  ('word-search-ii', 'Word Search II', 'hard', array['Trie'], false),
  ('design-add-and-search-words-data-structure', 'Design Add and Search Words Data Structure', 'medium', array['Trie'], false),

  -- ── Intervals ──────────────────────────────────────────────────────────────
  ('non-overlapping-intervals', 'Non-overlapping Intervals', 'medium', array['Intervals'], false),
  ('minimum-number-of-arrows-to-burst-balloons', 'Minimum Number of Arrows to Burst Balloons', 'medium', array['Intervals'], false),
  ('merge-intervals', 'Merge Intervals', 'medium', array['Intervals'], false),
  ('insert-interval', 'Insert Interval', 'medium', array['Intervals'], false),
  ('meeting-rooms-ii', 'Meeting Rooms II', 'medium', array['Intervals'], true),

  -- ── Monotonic Stack ────────────────────────────────────────────────────────
  ('daily-temperatures', 'Daily Temperatures', 'medium', array['Monotonic Stack'], false),
  ('online-stock-span', 'Online Stock Span', 'medium', array['Monotonic Stack'], false),
  ('largest-rectangle-in-histogram', 'Largest Rectangle in Histogram', 'hard', array['Monotonic Stack'], false),
  ('next-greater-element-i', 'Next Greater Element I', 'easy', array['Monotonic Stack'], false),
  ('next-greater-element-ii', 'Next Greater Element II', 'medium', array['Monotonic Stack'], false),

  -- ── Math & Geometry ────────────────────────────────────────────────────────
  ('happy-number', 'Happy Number', 'easy', array['Math & Geometry'], false),
  ('plus-one', 'Plus One', 'easy', array['Math & Geometry'], false),
  ('palindrome-number', 'Palindrome Number', 'easy', array['Math & Geometry'], false),
  ('power-x-n', 'Pow(x, n)', 'medium', array['Math & Geometry'], false),
  ('multiply-strings', 'Multiply Strings', 'medium', array['Math & Geometry'], false),

  -- ── Advanced Graphs ────────────────────────────────────────────────────────
  ('network-delay-time', 'Network Delay Time', 'medium', array['Advanced Graphs'], false),
  ('swim-in-rising-water', 'Swim in Rising Water', 'hard', array['Advanced Graphs'], false),
  ('alien-dictionary', 'Alien Dictionary', 'hard', array['Advanced Graphs'], true),
  ('cheapest-flights-within-k-stops', 'Cheapest Flights Within K Stops', 'medium', array['Advanced Graphs'], false),
  ('reconstruct-itinerary', 'Reconstruct Itinerary', 'hard', array['Advanced Graphs'], false),
  ('min-cost-to-connect-all-points', 'Min Cost to Connect All Points', 'medium', array['Advanced Graphs'], false),
  ('number-of-connected-components-in-an-undirected-graph', 'Number of Connected Components in an Undirected Graph', 'medium', array['Advanced Graphs'], true),
  ('redundant-connection', 'Redundant Connection', 'medium', array['Advanced Graphs'], false)

on conflict (slug) do update
  set title      = excluded.title,
      difficulty = excluded.difficulty,
      tags       = excluded.tags,
      is_premium = excluded.is_premium;
