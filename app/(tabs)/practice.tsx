import { useState } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, SafeAreaView, ScrollView, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/stores/auth';
import { GemChip } from '@/ranks/GemChip';
import { rankForSolves } from '@/ranks/ranks-data';
import { colors, radius, space, shadow } from '@/theme';
import type { Problem, Difficulty } from '@/types/database';

// ─── Pathway definitions ──────────────────────────────────────────────────────
interface Pathway {
  id: string;
  label: string;
  icon: string;
  color: string;
  unlockAt: number;  // total problems solved required
  tag: string;       // matches problems.tags[0]
  description: string;
}

const PATHWAYS: Pathway[] = [
  { id: 'arrays',       label: 'Arrays',              icon: '📊', color: '#2563EB', unlockAt: 0,  tag: 'Arrays',              description: 'The foundation. Indexing, traversal, and classic array tricks.' },
  { id: 'two-pointers', label: 'Two Pointers',         icon: '👆', color: '#7C3AED', unlockAt: 5,  tag: 'Two Pointers',         description: 'Shrink the search space from both ends.' },
  { id: 'sliding-win',  label: 'Sliding Window',       icon: '🪟', color: '#0891B2', unlockAt: 10, tag: 'Sliding Window',       description: 'Expand and contract a window over sequences.' },
  { id: 'hashing',      label: 'Hashing',              icon: '#️⃣', color: '#9333EA', unlockAt: 12, tag: 'Hashing',              description: 'O(1) lookups and frequency counting.' },
  { id: 'stack',        label: 'Stack',                icon: '📚', color: '#DC2626', unlockAt: 15, tag: 'Stack',                description: 'LIFO order for nested structures and monotonic problems.' },
  { id: 'binary-search',label: 'Binary Search',        icon: '🔍', color: '#059669', unlockAt: 18, tag: 'Binary Search',        description: 'Halve the search space every step.' },
  { id: 'linked-lists', label: 'Linked Lists',         icon: '🔗', color: '#D97706', unlockAt: 20, tag: 'Linked Lists',         description: 'Pointer manipulation and classic list patterns.' },
  { id: 'intervals',    label: 'Intervals',            icon: '📏', color: '#0D9488', unlockAt: 25, tag: 'Intervals',            description: 'Merge, insert, and schedule ranges.' },
  { id: 'trees',        label: 'Trees',                icon: '🌳', color: '#16A34A', unlockAt: 28, tag: 'Trees',                description: 'DFS, BFS, BST properties, and tree construction.' },
  { id: 'heap',         label: 'Heap / Priority Queue',icon: '⛰️', color: '#EA580C', unlockAt: 35, tag: 'Heap',                 description: 'Always-sorted access to the min or max element.' },
  { id: 'graphs',       label: 'Graphs',               icon: '🕸️', color: '#6D28D9', unlockAt: 40, tag: 'Graphs',               description: 'BFS, DFS, topological sort, union-find, shortest path.' },
  { id: 'backtracking', label: 'Backtracking',         icon: '↩️', color: '#B91C1C', unlockAt: 50, tag: 'Backtracking',         description: 'Explore all possibilities and prune early.' },
  { id: 'dp',           label: 'Dynamic Programming',  icon: '⚡', color: '#1D4ED8', unlockAt: 55, tag: 'Dynamic Programming',  description: 'Break problems into overlapping subproblems.' },
  { id: 'tries',        label: 'Tries',                icon: '🌐', color: '#7C3AED', unlockAt: 60, tag: 'Tries',                description: 'Prefix trees for fast string lookups.' },
  { id: 'bits',         label: 'Bit Manipulation',     icon: '🔢', color: '#374151', unlockAt: 65, tag: 'Bit Manipulation',     description: 'Flip, shift, and mask at the bit level.' },
];

const DIFF_COLOR: Record<Difficulty, string> = {
  easy: colors.easy,
  medium: colors.medium,
  hard: colors.hard,
};

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function Practice() {
  const { session } = useAuth();
  const router = useRouter();
  const [selected, setSelected] = useState<Pathway | null>(null);

  const { data: solvedSlugs = new Set<string>() } = useQuery({
    queryKey: ['all-solved', session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data } = await supabase
        .from('solves')
        .select('problem_slug')
        .eq('user_id', session!.user.id);
      return new Set((data ?? []).map((r: any) => r.problem_slug));
    },
  });

  const { data: tagCounts = {} as Record<string, number> } = useQuery({
    queryKey: ['tag-counts'],
    queryFn: async () => {
      const { data } = await supabase.from('problems').select('tags').eq('is_premium', false);
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as any[]) {
        const tag: string = row.tags?.[0] ?? 'Other';
        counts[tag] = (counts[tag] ?? 0) + 1;
      }
      return counts;
    },
  });

  const totalSolved = solvedSlugs.size;

  if (selected) {
    return (
      <PathwayDetail
        pathway={selected}
        solvedSlugs={solvedSlugs}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <Text style={s.h1}>Practice</Text>
        <Text style={s.sub}>Master each topic to unlock the next. Grind the basics first.</Text>

        <FlatList
          data={PATHWAYS}
          keyExtractor={(p) => p.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: space(4), paddingBottom: space(20) }}
          ListHeaderComponent={
            <Pressable style={s.interviewCard} onPress={() => router.push('/interview')}>
              <View style={s.interviewIcon}>
                <Ionicons name="sparkles" size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.interviewTitle}>Mock Interview</Text>
                <Text style={s.interviewSub}>Socratic AI interviewer · graded report</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.accentText} />
            </Pressable>
          }
          renderItem={({ item: pw }) => {
            const locked = totalSolved < pw.unlockAt;
            const total = tagCounts[pw.tag] ?? 0;

            return (
              <PathwayCard
                pathway={pw}
                locked={locked}
                total={total}
                solvedSlugs={solvedSlugs}
                totalSolved={totalSolved}
                onPress={() => setSelected(pw)}
              />
            );
          }}
        />
      </View>
    </SafeAreaView>
  );
}

// ─── Card (needs its own solve-count query per tag) ────────────────────────────
function PathwayCard({
  pathway, locked, total, solvedSlugs, totalSolved, onPress,
}: {
  pathway: Pathway;
  locked: boolean;
  total: number;
  solvedSlugs: Set<string>;
  totalSolved: number;
  onPress: () => void;
}) {
  const { data: tagProblems } = useQuery({
    queryKey: ['tag-problems-slugs', pathway.tag],
    queryFn: async () => {
      const { data } = await supabase
        .from('problems')
        .select('slug')
        .contains('tags', [pathway.tag])
        .eq('is_premium', false);
      return (data ?? []).map((r: any) => r.slug as string);
    },
  });

  const done = (tagProblems ?? []).filter((slug) => solvedSlugs.has(slug)).length;
  const count = tagProblems?.length ?? total;
  const pct = count > 0 ? done / count : 0;
  const topicRank = rankForSolves(done);

  return (
    <Pressable
      style={[s.card, locked && s.cardLocked]}
      onPress={onPress}
      disabled={locked}
    >
      <View style={s.cardHeader}>
        <View style={[s.iconCircle, { backgroundColor: pathway.color + '18' }]}>
          <Text style={s.iconEmoji}>{pathway.icon}</Text>
        </View>
        <View style={s.cardMeta}>
          <Text style={[s.cardLabel, locked && s.cardLabelLocked]}>{pathway.label}</Text>
          <Text style={s.cardDesc} numberOfLines={1}>{pathway.description}</Text>
        </View>
        {locked
          ? (
            <View style={s.lockChip}>
              <Ionicons name="lock-closed" size={12} color={colors.textLight} />
              <Text style={s.lockChipText}>{pathway.unlockAt - totalSolved} more</Text>
            </View>
          )
          : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
              <GemChip tier={topicRank} size={26} />
              <Text style={[s.doneLabel, pct === 1 && { color: colors.success }]}>
                {done}/{count}
              </Text>
            </View>
          )
        }
      </View>

      {!locked && (
        <View style={s.barBg}>
          <View style={[
            s.barFill,
            { width: `${Math.max(pct === 0 ? 0 : 3, pct * 100)}%`, backgroundColor: pct === 1 ? colors.success : pathway.color },
          ]} />
        </View>
      )}

      {locked && (
        <View style={s.lockRow}>
          <View style={s.lockBarBg}>
            <View style={[s.lockBarFill, { width: `${Math.min(100, (totalSolved / pathway.unlockAt) * 100)}%` }]} />
          </View>
          <Text style={s.lockRowLabel}>{totalSolved}/{pathway.unlockAt} solved</Text>
        </View>
      )}
    </Pressable>
  );
}

// ─── Detail screen ────────────────────────────────────────────────────────────
function PathwayDetail({
  pathway, solvedSlugs, onBack,
}: {
  pathway: Pathway;
  solvedSlugs: Set<string>;
  onBack: () => void;
}) {
  const { data: problems, isLoading } = useQuery({
    queryKey: ['pathway-problems', pathway.tag],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('problems')
        .select('*')
        .contains('tags', [pathway.tag])
        .eq('is_premium', false)
        .order('difficulty', { ascending: true });
      if (error) throw error;
      // Sort easy → medium → hard
      const order: Record<string, number> = { easy: 0, medium: 1, hard: 2 };
      return ((data ?? []) as Problem[]).sort((a, b) => (order[a.difficulty] ?? 1) - (order[b.difficulty] ?? 1));
    },
  });

  const done = (problems ?? []).filter((p) => solvedSlugs.has(p.slug)).length;
  const total = problems?.length ?? 0;
  const pct = total > 0 ? done / total : 0;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space(20) }}>
        {/* Hero */}
        <View style={[s.hero, { backgroundColor: pathway.color + '12' }]}>
          <Pressable onPress={onBack} style={s.backBtn} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={s.heroIcon}>{pathway.icon}</Text>
          <Text style={s.heroTitle}>{pathway.label}</Text>
          <Text style={s.heroDesc}>{pathway.description}</Text>

          <View style={s.heroStats}>
            <View style={s.heroStat}>
              <Text style={[s.heroStatNum, { color: pathway.color }]}>{done}</Text>
              <Text style={s.heroStatLabel}>solved</Text>
            </View>
            <View style={s.heroStatDivider} />
            <View style={s.heroStat}>
              <Text style={s.heroStatNum}>{total}</Text>
              <Text style={s.heroStatLabel}>total</Text>
            </View>
            <View style={s.heroStatDivider} />
            <View style={s.heroStat}>
              <Text style={[s.heroStatNum, pct === 1 && { color: colors.success }]}>
                {Math.round(pct * 100)}%
              </Text>
              <Text style={s.heroStatLabel}>done</Text>
            </View>
          </View>

          <View style={s.heroBg}>
            <View style={[s.heroBar, { width: `${Math.max(pct === 0 ? 0 : 2, pct * 100)}%`, backgroundColor: pct === 1 ? colors.success : pathway.color }]} />
          </View>

          {pct === 1 && (
            <View style={s.completeBadge}>
              <Ionicons name="checkmark-circle" size={15} color={colors.success} />
              <Text style={s.completeBadgeText}>Pathway complete!</Text>
            </View>
          )}
        </View>

        {/* Problem list */}
        <View style={{ paddingHorizontal: space(4), paddingTop: space(4) }}>
          {isLoading
            ? <ActivityIndicator color={colors.accent} style={{ paddingTop: space(10) }} />
            : (problems ?? []).map((p, i) => {
                const solved = solvedSlugs.has(p.slug);
                return (
                  <View key={p.slug} style={[s.problemRow, solved && s.problemRowSolved]}>
                    <View style={[s.problemBadge, solved && { backgroundColor: colors.success }]}>
                      {solved
                        ? <Ionicons name="checkmark" size={13} color="#fff" />
                        : <Text style={s.problemBadgeText}>{i + 1}</Text>
                      }
                    </View>
                    <View style={s.problemInfo}>
                      <Text style={[s.problemTitle, solved && s.problemTitleSolved]} numberOfLines={2}>{p.title}</Text>
                      <Text style={[s.problemDiff, { color: DIFF_COLOR[p.difficulty] }]}>
                        {p.difficulty.charAt(0).toUpperCase() + p.difficulty.slice(1)}
                      </Text>
                    </View>
                    {solved
                      ? <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                      : <Ionicons name="ellipse-outline" size={18} color={colors.border} />
                    }
                  </View>
                );
              })
          }
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1 },
  h1: {
    color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5,
    paddingHorizontal: space(4), paddingTop: space(4), paddingBottom: space(1),
  },
  sub: { color: colors.textDim, fontSize: 13, paddingHorizontal: space(4), paddingBottom: space(4) },

  // Mock interview entry (moved here from the Stats page)
  interviewCard: {
    flexDirection: 'row', alignItems: 'center', gap: space(3),
    backgroundColor: colors.accentLight, borderWidth: 1, borderColor: colors.accent + '50',
    borderRadius: radius.xl, padding: space(4), marginBottom: space(3),
  },
  interviewIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 4,
  },
  interviewTitle: { color: colors.text, fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  interviewSub: { color: colors.accentText, fontSize: 11, marginTop: 2 },

  card: {
    backgroundColor: colors.card, borderRadius: radius.xl,
    padding: space(4), marginBottom: space(3), ...shadow.sm,
  },
  cardLocked: { opacity: 0.7 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: space(3), marginBottom: space(3) },
  iconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  iconEmoji: { fontSize: 22 },
  cardMeta: { flex: 1 },
  cardLabel: { color: colors.text, fontWeight: '800', fontSize: 15 },
  cardLabelLocked: { color: colors.textDim },
  cardDesc: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  doneLabel: { color: colors.textDim, fontWeight: '700', fontSize: 13 },

  lockChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.border, paddingHorizontal: space(2), paddingVertical: 4,
    borderRadius: radius.md,
  },
  lockChipText: { color: colors.textLight, fontSize: 11, fontWeight: '600' },

  barBg: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },

  lockRow: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  lockBarBg: { flex: 1, height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' },
  lockBarFill: { height: 4, backgroundColor: colors.textLight, borderRadius: 2 },
  lockRowLabel: { color: colors.textLight, fontSize: 11, fontWeight: '600' },

  // Detail
  hero: { padding: space(5), paddingTop: space(4) },
  backBtn: { alignSelf: 'flex-start', padding: space(2), marginBottom: space(3) },
  heroIcon: { fontSize: 44, textAlign: 'center', marginBottom: space(2) },
  heroTitle: { color: colors.text, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  heroDesc: { color: colors.textDim, fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: space(4), paddingHorizontal: space(4) },

  heroStats: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: space(4), gap: space(6) },
  heroStat: { alignItems: 'center' },
  heroStatNum: { color: colors.text, fontSize: 24, fontWeight: '900' },
  heroStatLabel: { color: colors.textDim, fontSize: 11, marginTop: 1 },
  heroStatDivider: { width: 1, height: 28, backgroundColor: colors.border },

  heroBg: { height: 8, backgroundColor: colors.border + '80', borderRadius: 4, overflow: 'hidden' },
  heroBar: { height: 8, borderRadius: 4 },
  completeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center',
    marginTop: space(3), backgroundColor: colors.success + '18',
    paddingHorizontal: space(3), paddingVertical: space(2), borderRadius: radius.lg,
    alignSelf: 'center',
  },
  completeBadgeText: { color: colors.success, fontWeight: '700', fontSize: 13 },

  problemRow: {
    flexDirection: 'row', alignItems: 'center', gap: space(3),
    backgroundColor: colors.card, borderRadius: radius.lg,
    padding: space(4), marginBottom: space(2), ...shadow.sm,
  },
  problemRowSolved: { borderWidth: 1, borderColor: colors.success + '35' },
  problemBadge: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  problemBadgeText: { color: colors.textDim, fontWeight: '700', fontSize: 11 },
  problemInfo: { flex: 1 },
  problemTitle: { color: colors.text, fontWeight: '600', fontSize: 14 },
  problemTitleSolved: { color: colors.textDim },
  problemDiff: { fontSize: 11, fontWeight: '700', marginTop: 2 },
});
