/**
 * Practice — design_handoff/README.md §3.7
 *
 * Replaces the old `app/(tabs)/pathways.tsx` (deleted):
 *   · the 15 emoji icons are gone — coverage rings replace them
 *   · the tag strings now match the seeded catalog
 *     (`Array / String`, `Binary Tree - DFS`, `Hash Map / Set`, …) from
 *     supabase/migrations/0011_reseed_problems_lc75.sql. The old screen queried
 *     'Arrays' / 'Trees' / 'Hashing', which exist nowhere, so every pathway
 *     rendered 0 of 0.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/stores/auth';
import { GlassCard } from '@/components/GlassCard';
import { ProgressRing } from '@/components/Ring';
import { Segmented } from '@/components/Segmented';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import {
  EASE,
  ambientGlows,
  colors,
  coverageColor,
  duration,
  pressed,
  radius,
  spacing,
  tabular,
  type,
} from '@/theme';
import type { Difficulty } from '@/types/database';

/* ------------------------------------------------------------------ */
/* Pathways — tags are verbatim from 0011_reseed_problems_lc75.sql      */
/* ------------------------------------------------------------------ */

interface Pathway {
  /** The exact `problems.tags[0]` value in the seeded catalog. */
  tag: string;
  /** Total problems solved required to unlock. */
  unlockAt: number;
}

const PATHWAYS: readonly Pathway[] = [
  { tag: 'Array / String', unlockAt: 0 },
  { tag: 'Two Pointers', unlockAt: 5 },
  { tag: 'Sliding Window', unlockAt: 10 },
  { tag: 'Prefix Sum', unlockAt: 14 },
  { tag: 'Hash Map / Set', unlockAt: 18 },
  { tag: 'Stack', unlockAt: 24 },
  { tag: 'Queue', unlockAt: 28 },
  { tag: 'Monotonic Stack', unlockAt: 32 },
  { tag: 'Linked List', unlockAt: 36 },
  { tag: 'Binary Search', unlockAt: 42 },
  { tag: 'Intervals', unlockAt: 48 },
  { tag: 'Binary Tree - DFS', unlockAt: 54 },
  { tag: 'Binary Tree - BFS', unlockAt: 60 },
  { tag: 'Binary Search Tree', unlockAt: 66 },
  { tag: 'Trie', unlockAt: 72 },
  { tag: 'Heap / Priority Queue', unlockAt: 78 },
  { tag: 'Backtracking', unlockAt: 85 },
  { tag: 'Graphs - DFS', unlockAt: 92 },
  { tag: 'Graphs - BFS', unlockAt: 99 },
  { tag: 'Advanced Graphs', unlockAt: 108 },
  { tag: 'DP - 1D', unlockAt: 116 },
  { tag: 'DP - Multidimensional', unlockAt: 126 },
  { tag: 'Bit Manipulation', unlockAt: 134 },
  { tag: 'Math & Geometry', unlockAt: 142 },
] as const;

/** Canonical Blind 75, by slug. Slugs absent from the catalog are skipped. */
const BLIND_75: readonly string[] = [
  'two-sum', 'best-time-to-buy-and-sell-stock', 'contains-duplicate',
  'product-of-array-except-self', 'maximum-subarray', 'maximum-product-subarray',
  'find-minimum-in-rotated-sorted-array', 'search-in-rotated-sorted-array', '3sum',
  'container-with-most-water',
  'sum-of-two-integers', 'number-of-1-bits', 'counting-bits', 'missing-number',
  'reverse-bits',
  'climbing-stairs', 'coin-change', 'longest-increasing-subsequence',
  'longest-common-subsequence', 'word-break', 'combination-sum', 'house-robber',
  'house-robber-ii', 'decode-ways', 'unique-paths', 'jump-game',
  'clone-graph', 'course-schedule', 'pacific-atlantic-water-flow', 'number-of-islands',
  'longest-consecutive-sequence', 'alien-dictionary',
  'number-of-connected-components-in-an-undirected-graph',
  'insert-interval', 'merge-intervals', 'non-overlapping-intervals', 'meeting-rooms-ii',
  'reverse-linked-list', 'linked-list-cycle', 'merge-two-sorted-lists',
  'merge-k-sorted-lists', 'remove-nth-node-from-end-of-list', 'reorder-list',
  'set-matrix-zeroes', 'spiral-matrix', 'rotate-image', 'word-search',
  'longest-substring-without-repeating-characters',
  'longest-repeating-character-replacement', 'minimum-window-substring',
  'valid-anagram', 'group-anagrams', 'valid-parentheses', 'valid-palindrome',
  'maximum-depth-of-binary-tree', 'same-tree', 'invert-binary-tree',
  'binary-tree-maximum-path-sum', 'binary-tree-level-order-traversal',
  'serialize-and-deserialize-binary-tree', 'subtree-of-another-tree',
  'construct-binary-tree-from-preorder-and-inorder-traversal',
  'validate-binary-search-tree', 'kth-smallest-element-in-a-bst',
  'lowest-common-ancestor-of-a-binary-tree', 'implement-trie-prefix-tree',
  'design-add-and-search-words-data-structure', 'word-search-ii',
  'top-k-frequent-elements', 'find-median-from-data-stream',
];

const FILTERS = ['Pathways', 'Blind 75', 'Saved'] as const;
type Filter = (typeof FILTERS)[number];

/** Ring for a locked row — visible, not hidden (§3.7). */
const LOCKED_RING = '#5A5A5F';

interface ProblemRow {
  slug: string;
  title: string;
  difficulty: Difficulty;
  tags: string[];
}

interface TopicView {
  tag: string;
  done: number;
  total: number;
  pct: number;
  locked: boolean;
  unlockAt: number;
  subtitle: string;
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function PracticeScreen() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const uid = session?.user.id;

  const [filter, setFilter] = useState<Filter>('Pathways');
  const [openTag, setOpenTag] = useState<string | null>(null);
  const { show, toastNode } = useToast();
  const { saved, toggleSaved } = useSavedProblems(uid);

  /* ---- data ---- */

  const { data: problems = [], isLoading: loadingProblems } = useQuery({
    queryKey: ['practice-problems'],
    queryFn: async (): Promise<ProblemRow[]> => {
      const { data, error } = await supabase
        .from('problems')
        .select('slug, title, difficulty, tags')
        .eq('is_premium', false);
      if (error) throw error;
      return (data ?? []) as ProblemRow[];
    },
    staleTime: 1000 * 60 * 60,
  });

  const { data: solvedSlugs = EMPTY_SET, isLoading: loadingSolves } = useQuery({
    queryKey: ['all-solved', uid],
    enabled: !!uid,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('solves')
        .select('problem_slug')
        .eq('user_id', uid!);
      if (error) throw error;
      return new Set((data ?? []).map((r: { problem_slug: string }) => r.problem_slug));
    },
  });

  const loading = loadingProblems || loadingSolves;

  /* ---- derived ---- */

  const bySlug = useMemo(() => {
    const m = new Map<string, ProblemRow>();
    for (const p of problems) m.set(p.slug, p);
    return m;
  }, [problems]);

  const byTag = useMemo(() => {
    const m = new Map<string, ProblemRow[]>();
    for (const p of problems) {
      const tag = p.tags?.[0] ?? 'Other';
      const list = m.get(tag);
      if (list) list.push(p);
      else m.set(tag, [p]);
    }
    return m;
  }, [problems]);

  const totalSolved = solvedSlugs.size;

  const topics: TopicView[] = useMemo(() => {
    let firstLocked = true;
    return PATHWAYS.map((pw) => {
      const list = byTag.get(pw.tag) ?? [];
      const done = list.reduce((n, p) => n + (solvedSlugs.has(p.slug) ? 1 : 0), 0);
      const total = list.length;
      const locked = totalSolved < pw.unlockAt;
      let subtitle: string;
      if (locked) {
        subtitle = firstLocked
          ? `Unlocks after ${pw.unlockAt - totalSolved} more solves`
          : `Unlocks at ${pw.unlockAt} solves`;
        firstLocked = false;
      } else {
        subtitle = `${done} of ${total}`;
      }
      return {
        tag: pw.tag,
        done,
        total,
        pct: total > 0 ? done / total : 0,
        locked,
        unlockAt: pw.unlockAt,
        subtitle,
      };
    });
  }, [byTag, solvedSlugs, totalSolved]);

  /** Continue = the unlocked, unfinished pathway closest to done. */
  const cont = useMemo(() => {
    const open = topics.filter((t) => !t.locked && t.total > 0 && t.pct < 1);
    if (!open.length) return null;
    const started = open.filter((t) => t.done > 0);
    const pool = started.length ? started : open;
    return pool.reduce((best, t) => (t.pct > best.pct ? t : best), pool[0]);
  }, [topics]);

  const nextLocked = useMemo(() => topics.find((t) => t.locked) ?? null, [topics]);

  const blind = useMemo(() => {
    const rows = BLIND_75.map((slug) => bySlug.get(slug)).filter(
      (p): p is ProblemRow => !!p,
    );
    const done = rows.reduce((n, p) => n + (solvedSlugs.has(p.slug) ? 1 : 0), 0);
    return { rows, done };
  }, [bySlug, solvedSlugs]);

  const savedRows = useMemo(
    () => Array.from(saved).map((s) => bySlug.get(s)).filter((p): p is ProblemRow => !!p),
    [saved, bySlug],
  );

  const openProblems = openTag ? (byTag.get(openTag) ?? []) : [];
  const openTopic = openTag ? topics.find((t) => t.tag === openTag) ?? null : null;

  const onRowPress = useCallback(
    (t: TopicView) => {
      if (t.locked) show('Locked — keep going');
      else setOpenTag(t.tag);
    },
    [show],
  );

  const onOpenLeetCode = useCallback((slug: string) => {
    Linking.openURL(`https://leetcode.com/problems/${slug}/`).catch(() => {});
  }, []);

  /* ---- render ---- */

  return (
    <View style={s.root}>
      <Ambient />

      <FadeUp style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            s.scroll,
            { paddingTop: insets.top + 2 },
          ]}>
          <Text style={s.h1}>Practice</Text>

          <Segmented
            options={FILTERS}
            value={filter}
            onChange={setFilter}
            style={s.segmented}
          />

          {loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 60 }} />
          ) : filter === 'Pathways' ? (
            <>
              {cont ? (
                <GlassCard
                  radius={radius.cardLarge}
                  borderColor="rgba(255,212,38,0.28)"
                  style={s.continueCard}
                  onPress={() => setOpenTag(cont.tag)}>
                  <Text style={s.continueLabel}>CONTINUE</Text>
                  <View style={s.continueBody}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.continueTitle}>{cont.tag}</Text>
                      <Text style={s.continueSub}>
                        {cont.done} of {cont.total}
                        {nextLocked
                          ? ` · ${Math.max(0, nextLocked.unlockAt - totalSolved)} to unlock ${nextLocked.tag}`
                          : ' · every pathway unlocked'}
                      </Text>
                    </View>
                    <ProgressRing
                      progress={cont.pct}
                      size={54}
                      r={25}
                      strokeWidth={6}
                      color={colors.medium}
                      trackColor="rgba(255,212,38,0.22)"
                      label={`${Math.round(cont.pct * 100)}%`}
                      labelSize={14}
                      labelColor={colors.text}
                    />
                  </View>
                </GlassCard>
              ) : null}

              <GlassCard
                radius={radius.cardLarge}
                padding={0}
                contentStyle={s.listCard}
                style={s.topicCard}>
                {topics.map((t, i) => (
                  <TopicRow
                    key={t.tag}
                    topic={t}
                    first={i === 0}
                    delay={i * 40}
                    onPress={() => onRowPress(t)}
                  />
                ))}
              </GlassCard>
            </>
          ) : filter === 'Blind 75' ? (
            <>
              <GlassCard radius={radius.cardLarge} style={s.continueCard}>
                <Text style={[s.continueLabel, { color: colors.accentText }]}>
                  BLIND 75
                </Text>
                <View style={s.continueBody}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.continueTitle}>The classic list</Text>
                    <Text style={s.continueSub}>
                      {blind.done} of {blind.rows.length} solved
                    </Text>
                  </View>
                  <ProgressRing
                    progress={blind.rows.length ? blind.done / blind.rows.length : 0}
                    size={54}
                    r={25}
                    strokeWidth={6}
                    color={coverageColor(blind.rows.length ? blind.done / blind.rows.length : 0)}
                    label={`${Math.round(
                      (blind.rows.length ? blind.done / blind.rows.length : 0) * 100,
                    )}%`}
                    labelSize={14}
                    labelColor={colors.text}
                  />
                </View>
              </GlassCard>

              <GlassCard
                radius={radius.cardLarge}
                padding={0}
                contentStyle={s.listCard}
                style={s.topicCard}>
                {blind.rows.map((p, i) => (
                  <ProblemListRow
                    key={p.slug}
                    problem={p}
                    solved={solvedSlugs.has(p.slug)}
                    saved={saved.has(p.slug)}
                    first={i === 0}
                    onPress={() => onOpenLeetCode(p.slug)}
                    onToggleSave={() => {
                      toggleSaved(p.slug);
                      show(saved.has(p.slug) ? 'Removed from Saved' : 'Saved');
                    }}
                  />
                ))}
              </GlassCard>
            </>
          ) : savedRows.length ? (
            <GlassCard
              radius={radius.cardLarge}
              padding={0}
              contentStyle={s.listCard}
              style={s.topicCard}>
              {savedRows.map((p, i) => (
                <ProblemListRow
                  key={p.slug}
                  problem={p}
                  solved={solvedSlugs.has(p.slug)}
                  saved
                  first={i === 0}
                  onPress={() => onOpenLeetCode(p.slug)}
                  onToggleSave={() => {
                    toggleSaved(p.slug);
                    show('Removed from Saved');
                  }}
                />
              ))}
            </GlassCard>
          ) : (
            <GlassCard radius={radius.cardLarge} style={s.topicCard}>
              <Text style={s.emptyTitle}>Nothing saved yet</Text>
              <Text style={s.emptyBody}>
                Tap the bookmark on any problem to keep it here for later.
              </Text>
            </GlassCard>
          )}
        </ScrollView>
      </FadeUp>

      <Sheet
        visible={!!openTag}
        onClose={() => setOpenTag(null)}
        title={openTag ?? ''}
        subtitle={openTopic ? `${openTopic.done} of ${openTopic.total}` : undefined}>
        <View style={s.sheetList}>
          {openProblems.map((p, i) => (
            <ProblemListRow
              key={p.slug}
              problem={p}
              solved={solvedSlugs.has(p.slug)}
              saved={saved.has(p.slug)}
              first={i === 0}
              onPress={() => onOpenLeetCode(p.slug)}
              onToggleSave={() => {
                toggleSaved(p.slug);
                show(saved.has(p.slug) ? 'Removed from Saved' : 'Saved');
              }}
            />
          ))}
        </View>
      </Sheet>

      {toastNode}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

function TopicRow({
  topic,
  first,
  delay,
  onPress,
}: {
  topic: TopicView;
  first: boolean;
  delay: number;
  onPress: () => void;
}) {
  const c = topic.locked ? LOCKED_RING : coverageColor(topic.pct);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed: p }) => [
        s.row,
        !first && s.rowDivider,
        topic.locked && s.rowLocked,
        p && pressed,
      ]}>
      <ProgressRing
        progress={topic.locked ? 0 : topic.pct}
        size={40}
        r={25}
        strokeWidth={5}
        color={c}
        delay={delay}
        style={{ flexShrink: 0 }}
      />
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{topic.tag}</Text>
        <Text style={s.rowSub}>{topic.subtitle}</Text>
      </View>
      <Text style={[s.rowRight, { color: c }, tabular]}>
        {topic.locked ? 'Locked' : `${Math.round(topic.pct * 100)}%`}
      </Text>
    </Pressable>
  );
}

function ProblemListRow({
  problem,
  solved,
  saved,
  first,
  onPress,
  onToggleSave,
}: {
  problem: ProblemRow;
  solved: boolean;
  saved: boolean;
  first: boolean;
  onPress: () => void;
  onToggleSave: () => void;
}) {
  const dc =
    problem.difficulty === 'hard'
      ? colors.hard
      : problem.difficulty === 'medium'
        ? colors.medium
        : colors.easy;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed: p }) => [s.row, !first && s.rowDivider, p && pressed]}>
      <View style={[s.check, solved && { backgroundColor: colors.difficulty, borderWidth: 0 }]}>
        {solved ? <Ionicons name="checkmark" size={13} color="#0B1400" /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.problemTitle, solved && s.problemTitleSolved]} numberOfLines={2}>
          {problem.title}
        </Text>
        <Text style={[s.problemDiff, { color: dc }]}>
          {problem.difficulty.charAt(0).toUpperCase() + problem.difficulty.slice(1)}
        </Text>
      </View>
      <Pressable onPress={onToggleSave} hitSlop={10} style={({ pressed: p }) => [p && pressed]}>
        <Ionicons
          name={saved ? 'bookmark' : 'bookmark-outline'}
          size={18}
          color={saved ? colors.accentText : colors.textQuaternary}
        />
      </Pressable>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Saved problems — local only, no backing table exists yet            */
/* ------------------------------------------------------------------ */

const EMPTY_SET: Set<string> = new Set();
const savedKey = (uid?: string) => `saved-problems:${uid ?? 'anon'}`;

function useSavedProblems(uid?: string) {
  const [saved, setSaved] = useState<Set<string>>(EMPTY_SET);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(savedKey(uid))
      .then((raw) => {
        if (!alive || !raw) return;
        try {
          const list = JSON.parse(raw) as string[];
          if (Array.isArray(list)) setSaved(new Set(list));
        } catch {
          /* ignore malformed cache */
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [uid]);

  const toggleSaved = useCallback(
    (slug: string) => {
      setSaved((prev) => {
        const next = new Set(prev);
        if (next.has(slug)) next.delete(slug);
        else next.add(slug);
        AsyncStorage.setItem(savedKey(uid), JSON.stringify(Array.from(next))).catch(() => {});
        return next;
      });
    },
    [uid],
  );

  return { saved, toggleSaved };
}

/* ------------------------------------------------------------------ */
/* Chrome                                                              */
/* ------------------------------------------------------------------ */

/** The three ambient radial glows (§1) — they are what makes blur read as glass. */
function Ambient() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          {ambientGlows.map((g, i) => (
            <RadialGradient key={i} id={`glow${i}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={g.color} />
              <Stop offset="0.7" stopColor={g.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {ambientGlows.map((g, i) => (
          <Ellipse
            key={i}
            cx={`${g.x * 100}%`}
            cy={`${g.y * 100}%`}
            rx={g.w / 2}
            ry={g.h / 2}
            fill={`url(#glow${i})`}
          />
        ))}
      </Svg>
    </View>
  );
}

/** `fadeUp` — 380ms cubic-bezier(.22,1,.36,1), translateY 16→0, opacity 0→1. */
function FadeUp({ children, style }: { children: React.ReactNode; style?: object }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(1, {
      duration: duration.fadeUp,
      easing: Easing.bezier(...EASE.standard),
    });
  }, []);
  const a = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: 16 * (1 - p.value) }],
  }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

/* ------------------------------------------------------------------ */

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    paddingHorizontal: spacing.screenH,
    paddingBottom: spacing.contentBottom,
  },

  h1: { ...type.largeTitle, color: colors.text },
  segmented: { marginTop: 16 },

  /* Continue */
  continueCard: { marginTop: 18 },
  continueLabel: {
    ...type.microLabel,
    color: colors.medium,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  continueBody: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  continueTitle: { ...type.cardTitle, color: colors.text },
  continueSub: { ...type.bodySecondary, color: colors.textTertiary, marginTop: 3 },

  /* Lists */
  topicCard: { marginTop: 14 },
  listCard: { paddingVertical: 4, paddingHorizontal: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 11 },
  rowDivider: { borderTopWidth: 0.5, borderTopColor: colors.hairline },
  rowLocked: { opacity: 0.42 },
  rowTitle: { fontSize: 16, fontWeight: '600', letterSpacing: -0.2, color: colors.text },
  rowSub: { ...type.caption, color: colors.textTertiary, marginTop: 2 },
  rowRight: { fontSize: 14, fontWeight: '700' },

  /* Problem rows */
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  problemTitle: { fontSize: 15.5, fontWeight: '500', color: colors.text },
  problemTitleSolved: { color: colors.textSecondary },
  problemDiff: { fontSize: 12, fontWeight: '700', marginTop: 2 },

  /* Empty */
  emptyTitle: { ...type.cardTitle, color: colors.text },
  emptyBody: { ...type.bodySecondary, color: colors.textSecondary, marginTop: 6 },

  sheetList: { paddingBottom: 4 },
});
