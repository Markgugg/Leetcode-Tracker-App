/**
 * Practice — design_handoff/README.md §3.7, revised after owner review.
 *
 * What changed from the first pass, and why:
 *
 * 1. **Tracks replace the Pathways / Blind 75 / Saved segmented control.**
 *    Blind 75 was one tab of three, a static list with a ring on top, which is
 *    why it read as non-functional. It is now the default *track*: the course
 *    the user has chosen to follow, pinned to the top of the screen, with the
 *    picker (Blind 75 · NeetCode 150 · Top Interview 150) in a Sheet.
 *    Progress is never stored — it is the intersection of the track's slugs
 *    with the user's `solves` rows, recomputed on every render, so it moves the
 *    moment a solve lands. Track definitions live in `src/screens/practice/
 *    tracks.ts`; `supabase/migrations/0027_practice_tracks.sql` mirrors them
 *    server-side and backfills the catalog rows the lists reference.
 *
 * 2. **The 40px completion circles are gone.** Two dozen small rings gave every
 *    row the same visual weight and no hierarchy. The screen now carries one
 *    focal numeral (the active track's count) and thin 3px inline bars for
 *    everything subordinate — see `src/screens/practice/Bar.tsx`.
 *
 * 3. Mock Interview keeps its action row — still the only entry point into
 *    `app/interview`.
 *
 * Pathway tags are verbatim from supabase/migrations/0011_reseed_problems_lc75.sql.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/stores/auth';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import { GlassCard } from '@/components/GlassCard';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { Bar } from '@/screens/practice/Bar';
import {
  DEFAULT_TRACK_ID,
  TRACKS,
  type TrackDef,
  trackById,
  trackLength,
  trackSlugs,
} from '@/screens/practice/tracks';
import {
  EASE,
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

/** Bar fill for a locked row — visible, not hidden (§3.7). */
const LOCKED_BAR = '#5A5A5F';

interface ProblemRow {
  slug: string;
  title: string;
  difficulty: Difficulty;
  tags: string[];
  /** LeetCode Premium. Still in the catalog, still solvable, still counted. */
  isPremium: boolean;
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

interface TrackSectionView {
  name: string;
  rows: ProblemRow[];
  done: number;
}

interface TrackView {
  def: TrackDef;
  sections: TrackSectionView[];
  /** Problems from this track that exist in the catalog, in list order. */
  rows: ProblemRow[];
  done: number;
  total: number;
  pct: number;
  /** Published length (75 / 150) — `total` can be lower pre-migration. */
  published: number;
  /** The next unsolved problems, in list order. */
  upNext: ProblemRow[];
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function PracticeScreen() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const uid = session?.user.id;

  const [openTag, setOpenTag] = useState<string | null>(null);
  const [trackSheet, setTrackSheet] = useState(false);
  const [pickerSheet, setPickerSheet] = useState(false);
  const { show, toastNode } = useToast();
  const { saved, toggleSaved } = useSavedProblems(uid);
  const { trackId, setTrackId } = useActiveTrack(uid);

  /* ---- data ---- */

  /**
   * The whole catalog, premium rows included. Premium problems are seeded into
   * `problems` (alien-dictionary, meeting-rooms, walls-and-gates, …), so the
   * `solves` FK lets a user actually solve them; filtering them out here dropped
   * them from `bySlug` and therefore from both sides of every track fraction —
   * Blind 75 resolved to 68 and NeetCode 150 to ~143, and the track sheet blamed
   * the gap on a catalog that in fact has the rows. They are counted; the row
   * just carries a "Premium" note so the LeetCode tap is not a surprise.
   */
  const { data: problems = [], isLoading: loadingProblems } = useQuery({
    queryKey: ['practice-problems'],
    queryFn: async (): Promise<ProblemRow[]> => {
      const { data, error } = await supabase
        .from('problems')
        .select('slug, title, difficulty, tags, is_premium');
      if (error) throw error;
      return (data ?? []).map(
        (p: {
          slug: string;
          title: string;
          difficulty: Difficulty;
          tags: string[] | null;
          is_premium: boolean | null;
        }): ProblemRow => ({
          slug: p.slug,
          title: p.title,
          difficulty: p.difficulty,
          tags: p.tags ?? [],
          isPremium: !!p.is_premium,
        }),
      );
    },
    staleTime: 1000 * 60 * 60,
  });

  const {
    data: solvedSlugs = EMPTY_SET,
    isLoading: loadingSolves,
    isRefetching: refetchingSolves,
    refetch: refetchSolves,
  } = useQuery({
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

  /**
   * Track progress is derived, never stored — but the derivation only moves if
   * the solves query re-runs. React Navigation keeps this tab mounted and
   * react-query's `refetchOnWindowFocus` is inert in RN without a `focusManager`
   * binding, so without this the count sat at whatever it was when the tab first
   * mounted. Refetch on every focus (a solve is logged on another tab), plus
   * pull-to-refresh for the manual case.
   */
  useFocusEffect(
    useCallback(() => {
      if (uid) void refetchSolves();
    }, [uid, refetchSolves]),
  );

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

  /** The active track, resolved against the catalog and the user's solves. */
  const track: TrackView = useMemo(
    () => resolveTrack(trackById(trackId), bySlug, solvedSlugs),
    [trackId, bySlug, solvedSlugs],
  );

  /** Every track's headline numbers, for the picker sheet. */
  const trackSummaries = useMemo(
    () =>
      TRACKS.map((def) => {
        const slugs = trackSlugs(def);
        const present = slugs.filter((s) => bySlug.has(s));
        const done = present.reduce((n, s) => n + (solvedSlugs.has(s) ? 1 : 0), 0);
        return {
          def,
          done,
          total: present.length,
          pct: present.length ? done / present.length : 0,
        };
      }),
    [bySlug, solvedSlugs],
  );

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

  const onToggleSave = useCallback(
    (slug: string) => {
      const wasSaved = saved.has(slug);
      toggleSaved(slug);
      show(wasSaved ? 'Removed from Saved' : 'Saved');
    },
    [saved, toggleSaved, show],
  );

  const onPickTrack = useCallback(
    (def: TrackDef) => {
      setPickerSheet(false);
      if (def.id === trackId) return;
      setTrackId(def.id);
      show(`Now following ${def.name}`);
    },
    [trackId, setTrackId, show],
  );

  /* ---- render ---- */

  return (
    <View style={s.root}>
      <AmbientBackdrop />

      <FadeUp style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refetchingSolves}
              onRefresh={() => void refetchSolves()}
              tintColor={colors.textTertiary}
            />
          }
          contentContainerStyle={[s.scroll, { paddingTop: insets.top + 2 }]}>
          <View style={s.header}>
            <Text style={s.h1}>Practice</Text>
            <Pressable
              onPress={() => setPickerSheet(true)}
              hitSlop={8}
              style={({ pressed: p }) => [s.headerButton, p && pressed]}>
              <Ionicons name="swap-horizontal" size={17} color={colors.text} />
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 60 }} />
          ) : (
            <>
              {/* ---- Active track ------------------------------------ */}
              <GlassCard
                radius={radius.cardLarge}
                borderColor={colors.accentSelectedBorder}
                style={s.trackCard}
                onPress={() => setTrackSheet(true)}>
                <View style={s.trackLabelRow}>
                  <Text style={s.trackLabel}>YOUR TRACK</Text>
                  <Pressable
                    onPress={() => setPickerSheet(true)}
                    hitSlop={10}
                    style={({ pressed: p }) => [s.changeRow, p && pressed]}>
                    <Text style={s.changeText}>Change</Text>
                    <Ionicons name="chevron-forward" size={12} color={colors.accentText} />
                  </Pressable>
                </View>

                <Text style={s.trackName}>{track.def.name}</Text>

                <View style={s.trackNumbers}>
                  <Text style={[s.trackDone, tabular]}>{track.done}</Text>
                  <Text style={[s.trackTotal, tabular]}>/ {track.total}</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={[s.trackPct, tabular]}>
                    {Math.round(track.pct * 100)}%
                  </Text>
                </View>

                <Bar progress={track.pct} height={5} style={s.trackBar} />

                <Text style={s.trackSub}>
                  {track.done >= track.total && track.total > 0
                    ? 'Track complete — pick another'
                    : `${track.total - track.done} to go · tap for the full list`}
                </Text>
              </GlassCard>

              {/* ---- Up next ---------------------------------------- */}
              {track.upNext.length ? (
                <GlassCard
                  radius={radius.cardLarge}
                  padding={0}
                  contentStyle={s.listCard}
                  style={s.sectionCard}>
                  <Text style={s.sectionLabel}>UP NEXT</Text>
                  {track.upNext.map((p) => (
                    <ProblemListRow
                      key={p.slug}
                      problem={p}
                      solved={false}
                      saved={saved.has(p.slug)}
                      first={false}
                      onPress={() => onOpenLeetCode(p.slug)}
                      onToggleSave={() => onToggleSave(p.slug)}
                    />
                  ))}
                </GlassCard>
              ) : null}

              {/* ---- Mock Interview (§3.4 glass action row) ---------- */}
              <GlassCard
                radius={radius.card}
                padding={18}
                style={s.sectionCard}
                onPress={() => router.push('/interview')}>
                <View style={s.actionRow}>
                  <View style={s.actionIcon}>
                    <Ionicons name="mic" size={22} color="#000" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.actionTitle}>Mock Interview</Text>
                    <Text style={s.actionSub}>Practice under pressure</Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={15}
                    color="rgba(235,235,245,0.3)"
                  />
                </View>
              </GlassCard>

              {/* ---- Topics ----------------------------------------- */}
              <GlassCard
                radius={radius.cardLarge}
                padding={0}
                contentStyle={s.listCard}
                style={s.sectionCard}>
                <Text style={s.sectionLabel}>TOPICS</Text>
                {topics.map((t, i) => (
                  <TopicRow
                    key={t.tag}
                    topic={t}
                    delay={i * 30}
                    onPress={() => onRowPress(t)}
                  />
                ))}
              </GlassCard>

              {/* ---- Saved ------------------------------------------ */}
              {savedRows.length ? (
                <GlassCard
                  radius={radius.cardLarge}
                  padding={0}
                  contentStyle={s.listCard}
                  style={s.sectionCard}>
                  <Text style={s.sectionLabel}>SAVED</Text>
                  {savedRows.map((p) => (
                    <ProblemListRow
                      key={p.slug}
                      problem={p}
                      solved={solvedSlugs.has(p.slug)}
                      saved
                      first={false}
                      onPress={() => onOpenLeetCode(p.slug)}
                      onToggleSave={() => onToggleSave(p.slug)}
                    />
                  ))}
                </GlassCard>
              ) : null}
            </>
          )}
        </ScrollView>
      </FadeUp>

      {/* ---- Track picker ---- */}
      <Sheet
        visible={pickerSheet}
        onClose={() => setPickerSheet(false)}
        title="Choose a track"
        subtitle="Progress carries over">
        <View style={s.sheetList}>
          {trackSummaries.map((t) => (
            <TrackPickerRow
              key={t.def.id}
              def={t.def}
              done={t.done}
              total={t.total}
              pct={t.pct}
              active={t.def.id === trackId}
              onPress={() => onPickTrack(t.def)}
            />
          ))}
        </View>
      </Sheet>

      {/* ---- Active track detail ---- */}
      <Sheet
        visible={trackSheet}
        onClose={() => setTrackSheet(false)}
        title={track.def.name}
        subtitle={`${track.done} of ${track.total}`}>
        <View style={s.sheetList}>
          {track.sections.map((sec) => (
            <View key={sec.name} style={s.trackSection}>
              <View style={s.trackSectionHead}>
                <Text style={s.trackSectionName}>{sec.name}</Text>
                <Text style={[s.trackSectionCount, tabular]}>
                  {sec.done} / {sec.rows.length}
                </Text>
              </View>
              <Bar
                progress={sec.rows.length ? sec.done / sec.rows.length : 0}
                color={coverageColor(sec.rows.length ? sec.done / sec.rows.length : 0)}
                style={s.trackSectionBar}
              />
              {sec.rows.map((p) => (
                <ProblemListRow
                  key={p.slug}
                  problem={p}
                  solved={solvedSlugs.has(p.slug)}
                  saved={saved.has(p.slug)}
                  first={false}
                  onPress={() => onOpenLeetCode(p.slug)}
                  onToggleSave={() => onToggleSave(p.slug)}
                />
              ))}
            </View>
          ))}

          {track.published > track.total ? (
            <Text style={s.trackFootnote}>
              {track.published - track.total} of the {track.published} problems on this
              list aren&apos;t in the catalog yet, so they can&apos;t be tracked.
            </Text>
          ) : null}
        </View>
      </Sheet>

      {/* ---- Topic detail ---- */}
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
              onToggleSave={() => onToggleSave(p.slug)}
            />
          ))}
        </View>
      </Sheet>

      {toastNode}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Track resolution — the only place track progress is computed        */
/* ------------------------------------------------------------------ */

const UP_NEXT_COUNT = 3;

function resolveTrack(
  def: TrackDef,
  bySlug: Map<string, ProblemRow>,
  solved: Set<string>,
): TrackView {
  const seen = new Set<string>();
  const sections: TrackSectionView[] = [];
  const rows: ProblemRow[] = [];
  let done = 0;

  for (const sec of def.sections) {
    const secRows: ProblemRow[] = [];
    let secDone = 0;
    for (const slug of sec.slugs) {
      if (seen.has(slug)) continue;
      const row = bySlug.get(slug);
      if (!row) continue; // not in the catalog → not solvable → not counted
      seen.add(slug);
      secRows.push(row);
      rows.push(row);
      if (solved.has(slug)) {
        secDone += 1;
        done += 1;
      }
    }
    if (secRows.length) sections.push({ name: sec.name, rows: secRows, done: secDone });
  }

  const total = rows.length;
  return {
    def,
    sections,
    rows,
    done,
    total,
    pct: total ? done / total : 0,
    published: trackLength(def),
    upNext: rows.filter((p) => !solved.has(p.slug)).slice(0, UP_NEXT_COUNT),
  };
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

function TopicRow({
  topic,
  delay,
  onPress,
}: {
  topic: TopicView;
  delay: number;
  onPress: () => void;
}) {
  const c = topic.locked ? LOCKED_BAR : coverageColor(topic.pct);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed: p }) => [
        s.topicRow,
        topic.locked && s.rowLocked,
        p && pressed,
      ]}>
      <View style={s.topicHead}>
        <Text style={s.rowTitle} numberOfLines={1}>
          {topic.tag}
        </Text>
        <Text style={[s.rowRight, { color: c }, tabular]}>
          {topic.locked ? 'Locked' : `${topic.done}/${topic.total}`}
        </Text>
      </View>
      <Bar
        progress={topic.locked ? 0 : topic.pct}
        color={c}
        delay={delay}
        style={s.topicBar}
      />
      <Text style={s.rowSub}>{topic.subtitle}</Text>
    </Pressable>
  );
}

function TrackPickerRow({
  def,
  done,
  total,
  pct,
  active,
  onPress,
}: {
  def: TrackDef;
  done: number;
  total: number;
  pct: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed: p }) => [s.pickerRow, active && s.pickerRowActive, p && pressed]}>
      <View style={s.topicHead}>
        <Text style={s.pickerName}>{def.name}</Text>
        {active ? (
          <Ionicons name="checkmark-circle" size={19} color={colors.accentText} />
        ) : (
          <Text style={[s.pickerCount, tabular]}>
            {done}/{total}
          </Text>
        )}
      </View>
      <Text style={s.pickerBlurb}>{def.blurb}</Text>
      <Bar
        progress={pct}
        color={active ? colors.accent : 'rgba(235,235,245,0.35)'}
        style={s.pickerBar}
      />
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
        <View style={s.problemMeta}>
          <Text style={[s.problemDiff, { color: dc }]}>
            {problem.difficulty.charAt(0).toUpperCase() + problem.difficulty.slice(1)}
          </Text>
          {problem.isPremium ? <Text style={s.problemPremium}>Premium</Text> : null}
        </View>
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
/* Local state — no backing tables exist yet                           */
/* ------------------------------------------------------------------ */

const EMPTY_SET: Set<string> = new Set();
const savedKey = (uid?: string) => `saved-problems:${uid ?? 'anon'}`;
const trackKey = (uid?: string) => `active-track:${uid ?? 'anon'}`;

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

/**
 * The chosen track. Device-local for now; 0027 ships a `user_tracks` table so
 * this can move server-side without a UI change.
 */
function useActiveTrack(uid?: string) {
  const [trackId, setTrack] = useState<string>(DEFAULT_TRACK_ID);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(trackKey(uid))
      .then((raw) => {
        if (!alive || !raw) return;
        if (TRACKS.some((t) => t.id === raw)) setTrack(raw);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [uid]);

  const setTrackId = useCallback(
    (id: string) => {
      setTrack(id);
      AsyncStorage.setItem(trackKey(uid), id).catch(() => {});
    },
    [uid],
  );

  return { trackId, setTrackId };
}

/* ------------------------------------------------------------------ */
/* Chrome                                                              */
/* ------------------------------------------------------------------ */

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

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { ...type.largeTitle, color: colors.text },
  headerButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.controlAlt26,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Active track */
  trackCard: { marginTop: 18 },
  trackLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trackLabel: {
    ...type.microLabel,
    color: colors.accentText,
    textTransform: 'uppercase',
  },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  changeText: { fontSize: 13, fontWeight: '600', color: colors.accentText },
  trackName: { ...type.cardTitle, color: colors.text, marginTop: 10 },
  trackNumbers: { flexDirection: 'row', alignItems: 'baseline', marginTop: 12, gap: 5 },
  trackDone: { ...type.statNumeral, color: colors.text },
  trackTotal: { fontSize: 17, fontWeight: '600', color: colors.textTertiary },
  trackPct: { fontSize: 17, fontWeight: '700', color: colors.accentText },
  trackBar: { marginTop: 10 },
  trackSub: { ...type.caption, color: colors.textTertiary, marginTop: 9 },

  /* Sections */
  sectionCard: { marginTop: spacing.cardGapTight },
  listCard: { paddingVertical: 6, paddingHorizontal: 18 },
  sectionLabel: {
    ...type.microLabel,
    color: colors.textQuaternary,
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 6,
  },

  /* Mock Interview action row (§3.4) */
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.streak,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
  actionSub: { ...type.bodySecondary, color: colors.textSecondary, marginTop: 2 },

  /* Topic rows — bar, not ring */
  topicRow: { paddingVertical: 11 },
  topicHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  topicBar: { marginTop: 9 },
  rowLocked: { opacity: 0.42 },
  rowTitle: {
    flex: 1,
    fontSize: 15.5,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: colors.text,
  },
  rowSub: { ...type.caption, color: colors.textTertiary, marginTop: 7 },
  rowRight: { fontSize: 13, fontWeight: '700' },

  /* Problem rows */
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 11 },
  rowDivider: { borderTopWidth: 0.5, borderTopColor: colors.hairline },
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
  problemMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  problemDiff: { fontSize: 12, fontWeight: '700' },
  problemPremium: { fontSize: 12, fontWeight: '500', color: colors.textQuaternary },

  /* Track picker */
  pickerRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.smallCard,
    borderWidth: 0.5,
    borderColor: colors.hairline,
    backgroundColor: colors.controlAlt16,
    marginBottom: 10,
  },
  pickerRowActive: {
    backgroundColor: colors.accentSelectedFill,
    borderColor: colors.accentSelectedBorder,
  },
  pickerName: { flex: 1, fontSize: 17, fontWeight: '700', letterSpacing: -0.3, color: colors.text },
  pickerCount: { fontSize: 13.5, fontWeight: '600', color: colors.textTertiary },
  pickerBlurb: { ...type.caption, color: colors.textSecondary, marginTop: 4 },
  pickerBar: { marginTop: 11 },

  /* Track sheet */
  trackSection: { marginBottom: 18 },
  trackSectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trackSectionName: {
    flex: 1,
    ...type.microLabel,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  trackSectionCount: { fontSize: 12.5, fontWeight: '700', color: colors.textTertiary },
  trackSectionBar: { marginTop: 8, marginBottom: 2 },
  trackFootnote: { ...type.caption, color: colors.textQuaternary, lineHeight: 18 },

  sheetList: { paddingBottom: 4 },
});
