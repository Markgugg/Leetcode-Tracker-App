-- Seed common LeetCode problems with algorithm tags.
-- Uses ON CONFLICT DO UPDATE so re-running is safe.

insert into problems (slug, title, difficulty, tags, is_premium) values
  -- Arrays
  ('two-sum', 'Two Sum', 'easy', array['Arrays'], false),
  ('best-time-to-buy-and-sell-stock', 'Best Time to Buy and Sell Stock', 'easy', array['Arrays'], false),
  ('contains-duplicate', 'Contains Duplicate', 'easy', array['Arrays'], false),
  ('product-of-array-except-self', 'Product of Array Except Self', 'medium', array['Arrays'], false),
  ('maximum-subarray', 'Maximum Subarray', 'medium', array['Arrays'], false),
  ('find-minimum-in-rotated-sorted-array', 'Find Minimum in Rotated Sorted Array', 'medium', array['Arrays'], false),
  ('search-in-rotated-sorted-array', 'Search in Rotated Sorted Array', 'medium', array['Arrays'], false),
  ('3sum', '3Sum', 'medium', array['Arrays'], false),
  ('container-with-most-water', 'Container With Most Water', 'medium', array['Arrays'], false),
  ('spiral-matrix', 'Spiral Matrix', 'medium', array['Arrays'], false),
  ('rotate-image', 'Rotate Image', 'medium', array['Arrays'], false),
  ('set-matrix-zeroes', 'Set Matrix Zeroes', 'medium', array['Arrays'], false),
  ('jump-game', 'Jump Game', 'medium', array['Arrays'], false),
  ('merge-intervals', 'Merge Intervals', 'medium', array['Arrays'], false),
  ('insert-interval', 'Insert Interval', 'medium', array['Arrays'], false),
  ('non-overlapping-intervals', 'Non-overlapping Intervals', 'medium', array['Arrays'], false),
  ('trapping-rain-water', 'Trapping Rain Water', 'hard', array['Arrays'], false),
  ('sliding-window-maximum', 'Sliding Window Maximum', 'hard', array['Arrays'], false),
  ('first-missing-positive', 'First Missing Positive', 'hard', array['Arrays'], false),

  -- Sliding Window
  ('longest-substring-without-repeating-characters', 'Longest Substring Without Repeating Characters', 'medium', array['Sliding Window'], false),
  ('minimum-window-substring', 'Minimum Window Substring', 'hard', array['Sliding Window'], false),
  ('longest-repeating-character-replacement', 'Longest Repeating Character Replacement', 'medium', array['Sliding Window'], false),
  ('permutation-in-string', 'Permutation in String', 'medium', array['Sliding Window'], false),
  ('fruit-into-baskets', 'Fruit Into Baskets', 'medium', array['Sliding Window'], false),
  ('subarray-sum-equals-k', 'Subarray Sum Equals K', 'medium', array['Sliding Window'], false),

  -- Two Pointers
  ('valid-palindrome', 'Valid Palindrome', 'easy', array['Two Pointers'], false),
  ('two-sum-ii-input-array-is-sorted', 'Two Sum II - Input Array Is Sorted', 'medium', array['Two Pointers'], false),
  ('sort-colors', 'Sort Colors', 'medium', array['Two Pointers'], false),
  ('remove-duplicates-from-sorted-array', 'Remove Duplicates from Sorted Array', 'easy', array['Two Pointers'], false),
  ('move-zeroes', 'Move Zeroes', 'easy', array['Two Pointers'], false),
  ('squares-of-a-sorted-array', 'Squares of a Sorted Array', 'easy', array['Two Pointers'], false),
  ('4sum', '4Sum', 'medium', array['Two Pointers'], false),

  -- Binary Search
  ('binary-search', 'Binary Search', 'easy', array['Binary Search'], false),
  ('find-peak-element', 'Find Peak Element', 'medium', array['Binary Search'], false),
  ('koko-eating-bananas', 'Koko Eating Bananas', 'medium', array['Binary Search'], false),
  ('search-a-2d-matrix', 'Search a 2D Matrix', 'medium', array['Binary Search'], false),
  ('time-based-key-value-store', 'Time Based Key-Value Store', 'medium', array['Binary Search'], false),
  ('median-of-two-sorted-arrays', 'Median of Two Sorted Arrays', 'hard', array['Binary Search'], false),

  -- Linked Lists
  ('reverse-linked-list', 'Reverse Linked List', 'easy', array['Linked Lists'], false),
  ('merge-two-sorted-lists', 'Merge Two Sorted Lists', 'easy', array['Linked Lists'], false),
  ('linked-list-cycle', 'Linked List Cycle', 'easy', array['Linked Lists'], false),
  ('reorder-list', 'Reorder List', 'medium', array['Linked Lists'], false),
  ('remove-nth-node-from-end-of-list', 'Remove Nth Node From End of List', 'medium', array['Linked Lists'], false),
  ('copy-list-with-random-pointer', 'Copy List with Random Pointer', 'medium', array['Linked Lists'], false),
  ('lru-cache', 'LRU Cache', 'medium', array['Linked Lists'], false),
  ('add-two-numbers', 'Add Two Numbers', 'medium', array['Linked Lists'], false),
  ('merge-k-sorted-lists', 'Merge k Sorted Lists', 'hard', array['Linked Lists'], false),
  ('reverse-nodes-in-k-group', 'Reverse Nodes in k-Group', 'hard', array['Linked Lists'], false),

  -- Trees
  ('invert-binary-tree', 'Invert Binary Tree', 'easy', array['Trees'], false),
  ('maximum-depth-of-binary-tree', 'Maximum Depth of Binary Tree', 'easy', array['Trees'], false),
  ('same-tree', 'Same Tree', 'easy', array['Trees'], false),
  ('subtree-of-another-tree', 'Subtree of Another Tree', 'easy', array['Trees'], false),
  ('lowest-common-ancestor-of-a-binary-search-tree', 'Lowest Common Ancestor of a BST', 'medium', array['Trees'], false),
  ('binary-tree-level-order-traversal', 'Binary Tree Level Order Traversal', 'medium', array['Trees'], false),
  ('validate-binary-search-tree', 'Validate Binary Search Tree', 'medium', array['Trees'], false),
  ('kth-smallest-element-in-a-bst', 'Kth Smallest Element in a BST', 'medium', array['Trees'], false),
  ('construct-binary-tree-from-preorder-and-inorder-traversal', 'Construct Binary Tree From Preorder & Inorder', 'medium', array['Trees'], false),
  ('binary-tree-right-side-view', 'Binary Tree Right Side View', 'medium', array['Trees'], false),
  ('count-good-nodes-in-binary-tree', 'Count Good Nodes in Binary Tree', 'medium', array['Trees'], false),
  ('lowest-common-ancestor-of-a-binary-tree', 'Lowest Common Ancestor of a Binary Tree', 'medium', array['Trees'], false),
  ('binary-tree-maximum-path-sum', 'Binary Tree Maximum Path Sum', 'hard', array['Trees'], false),
  ('serialize-and-deserialize-binary-tree', 'Serialize and Deserialize Binary Tree', 'hard', array['Trees'], false),

  -- Graphs
  ('number-of-islands', 'Number of Islands', 'medium', array['Graphs'], false),
  ('clone-graph', 'Clone Graph', 'medium', array['Graphs'], false),
  ('max-area-of-island', 'Max Area of Island', 'medium', array['Graphs'], false),
  ('pacific-atlantic-water-flow', 'Pacific Atlantic Water Flow', 'medium', array['Graphs'], false),
  ('surrounded-regions', 'Surrounded Regions', 'medium', array['Graphs'], false),
  ('rotting-oranges', 'Rotting Oranges', 'medium', array['Graphs'], false),
  ('course-schedule', 'Course Schedule', 'medium', array['Graphs'], false),
  ('course-schedule-ii', 'Course Schedule II', 'medium', array['Graphs'], false),
  ('number-of-connected-components-in-an-undirected-graph', 'Number of Connected Components', 'medium', array['Graphs'], false),
  ('graph-valid-tree', 'Graph Valid Tree', 'medium', array['Graphs'], false),
  ('word-ladder', 'Word Ladder', 'hard', array['Graphs'], false),
  ('redundant-connection', 'Redundant Connection', 'medium', array['Graphs'], false),
  ('walls-and-gates', 'Walls and Gates', 'medium', array['Graphs'], false),
  ('swim-in-rising-water', 'Swim in Rising Water', 'hard', array['Graphs'], false),
  ('minimum-cost-to-connect-all-points', 'Minimum Cost to Connect All Points', 'medium', array['Graphs'], false),
  ('network-delay-time', 'Network Delay Time', 'medium', array['Graphs'], false),
  ('critical-connections-in-a-network', 'Critical Connections in a Network', 'hard', array['Graphs'], false),

  -- Dynamic Programming
  ('climbing-stairs', 'Climbing Stairs', 'easy', array['Dynamic Programming'], false),
  ('house-robber', 'House Robber', 'medium', array['Dynamic Programming'], false),
  ('house-robber-ii', 'House Robber II', 'medium', array['Dynamic Programming'], false),
  ('longest-palindromic-substring', 'Longest Palindromic Substring', 'medium', array['Dynamic Programming'], false),
  ('palindromic-substrings', 'Palindromic Substrings', 'medium', array['Dynamic Programming'], false),
  ('decode-ways', 'Decode Ways', 'medium', array['Dynamic Programming'], false),
  ('coin-change', 'Coin Change', 'medium', array['Dynamic Programming'], false),
  ('maximum-product-subarray', 'Maximum Product Subarray', 'medium', array['Dynamic Programming'], false),
  ('word-break', 'Word Break', 'medium', array['Dynamic Programming'], false),
  ('longest-increasing-subsequence', 'Longest Increasing Subsequence', 'medium', array['Dynamic Programming'], false),
  ('unique-paths', 'Unique Paths', 'medium', array['Dynamic Programming'], false),
  ('jump-game-ii', 'Jump Game II', 'medium', array['Dynamic Programming'], false),
  ('partition-equal-subset-sum', 'Partition Equal Subset Sum', 'medium', array['Dynamic Programming'], false),
  ('target-sum', 'Target Sum', 'medium', array['Dynamic Programming'], false),
  ('interleaving-string', 'Interleaving String', 'medium', array['Dynamic Programming'], false),
  ('edit-distance', 'Edit Distance', 'medium', array['Dynamic Programming'], false),
  ('burst-balloons', 'Burst Balloons', 'hard', array['Dynamic Programming'], false),
  ('regular-expression-matching', 'Regular Expression Matching', 'hard', array['Dynamic Programming'], false),
  ('maximum-profit-in-job-scheduling', 'Maximum Profit in Job Scheduling', 'hard', array['Dynamic Programming'], false),

  -- Backtracking
  ('subsets', 'Subsets', 'medium', array['Backtracking'], false),
  ('combination-sum', 'Combination Sum', 'medium', array['Backtracking'], false),
  ('combination-sum-ii', 'Combination Sum II', 'medium', array['Backtracking'], false),
  ('permutations', 'Permutations', 'medium', array['Backtracking'], false),
  ('subsets-ii', 'Subsets II', 'medium', array['Backtracking'], false),
  ('word-search', 'Word Search', 'medium', array['Backtracking'], false),
  ('palindrome-partitioning', 'Palindrome Partitioning', 'medium', array['Backtracking'], false),
  ('letter-combinations-of-a-phone-number', 'Letter Combinations of a Phone Number', 'medium', array['Backtracking'], false),
  ('n-queens', 'N-Queens', 'hard', array['Backtracking'], false),
  ('sudoku-solver', 'Sudoku Solver', 'hard', array['Backtracking'], false),

  -- Stack
  ('valid-parentheses', 'Valid Parentheses', 'easy', array['Stack'], false),
  ('min-stack', 'Min Stack', 'medium', array['Stack'], false),
  ('evaluate-reverse-polish-notation', 'Evaluate Reverse Polish Notation', 'medium', array['Stack'], false),
  ('generate-parentheses', 'Generate Parentheses', 'medium', array['Stack'], false),
  ('daily-temperatures', 'Daily Temperatures', 'medium', array['Stack'], false),
  ('car-fleet', 'Car Fleet', 'medium', array['Stack'], false),
  ('largest-rectangle-in-histogram', 'Largest Rectangle in Histogram', 'hard', array['Stack'], false),

  -- Heap / Priority Queue
  ('kth-largest-element-in-a-stream', 'Kth Largest Element in a Stream', 'easy', array['Heap'], false),
  ('last-stone-weight', 'Last Stone Weight', 'easy', array['Heap'], false),
  ('k-closest-points-to-origin', 'K Closest Points to Origin', 'medium', array['Heap'], false),
  ('kth-largest-element-in-an-array', 'Kth Largest Element in an Array', 'medium', array['Heap'], false),
  ('task-scheduler', 'Task Scheduler', 'medium', array['Heap'], false),
  ('design-twitter', 'Design Twitter', 'medium', array['Heap'], false),
  ('top-k-frequent-elements', 'Top K Frequent Elements', 'medium', array['Heap'], false),
  ('find-median-from-data-stream', 'Find Median from Data Stream', 'hard', array['Heap'], false),
  ('ipo', 'IPO', 'hard', array['Heap'], false),

  -- Tries
  ('implement-trie-prefix-tree', 'Implement Trie (Prefix Tree)', 'medium', array['Tries'], false),
  ('design-add-and-search-words-data-structure', 'Design Add and Search Words Data Structure', 'medium', array['Tries'], false),
  ('word-search-ii', 'Word Search II', 'hard', array['Tries'], false),

  -- Hashing
  ('valid-anagram', 'Valid Anagram', 'easy', array['Hashing'], false),
  ('group-anagrams', 'Group Anagrams', 'medium', array['Hashing'], false),
  ('top-k-frequent-words', 'Top K Frequent Words', 'medium', array['Hashing'], false),
  ('longest-consecutive-sequence', 'Longest Consecutive Sequence', 'medium', array['Hashing'], false),
  ('find-duplicate-subtrees', 'Find Duplicate Subtrees', 'medium', array['Hashing'], false),
  ('random-pick-with-weight', 'Random Pick with Weight', 'medium', array['Hashing'], false),

  -- Math / Bit Manipulation
  ('reverse-bits', 'Reverse Bits', 'easy', array['Bit Manipulation'], false),
  ('number-of-1-bits', 'Number of 1 Bits', 'easy', array['Bit Manipulation'], false),
  ('counting-bits', 'Counting Bits', 'easy', array['Bit Manipulation'], false),
  ('missing-number', 'Missing Number', 'easy', array['Bit Manipulation'], false),
  ('sum-of-two-integers', 'Sum of Two Integers', 'medium', array['Bit Manipulation'], false),
  ('reverse-integer', 'Reverse Integer', 'medium', array['Bit Manipulation'], false),
  ('single-number', 'Single Number', 'easy', array['Bit Manipulation'], false),
  ('find-the-duplicate-number', 'Find the Duplicate Number', 'medium', array['Bit Manipulation'], false),
  ('robot-bounded-in-circle', 'Robot Bounded in Circle', 'medium', array['Bit Manipulation'], false),

  -- Intervals
  ('meeting-rooms-ii', 'Meeting Rooms II', 'medium', array['Intervals'], false),
  ('minimum-interval-to-include-each-query', 'Minimum Interval to Include Each Query', 'hard', array['Intervals'], false)

on conflict (slug) do update set
  tags = excluded.tags,
  title = excluded.title,
  difficulty = excluded.difficulty,
  is_premium = excluded.is_premium;
