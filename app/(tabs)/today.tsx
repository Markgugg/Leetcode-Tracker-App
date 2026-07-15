import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, RefreshControl, Pressable, SafeAreaView,
  SectionList, Linking,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/stores/auth';
import { Avatar } from '@/components/Avatar';
import { GoalRing } from '@/components/GoalRing';
import {
  useLcTagStats, buildRadarAxes, weakestAxes,
  RADAR_TO_CATALOG_TAG, safeLcUsername, problemUrl, type RadarLabel,
} from '@/lib/leetcode';
import { weekStartISO, timeAgo, dayLabel, todayEyebrow } from '@/lib/time';
import { colors, radius, space, shadow } from '@/theme';
import type { Profile, Streak, Difficulty } from '@/types/database';

// ─── Types ────────────────────────────────────────────────────────────────────

type FeedRow = {
  id: string;
  user_id: string;
  solved_at: string;
  points: number;
  source: 'manual' | 'leetcode_sync';
  problems: { title: string; difficulty: Difficulty } | null;
  profiles: { username: string; display_name: string | null } | null;
};

type Section = { title: string; data: FeedRow[] };

const DIFF_COLOR = { easy: colors.easy, medium: colors.medium, hard: colors.hard };
const DIFF_LABEL = { easy: 'Easy', medium: 'Med', hard: 'Hard' };

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchFeedData(userId: string): Promise<FeedRow[]> {
  const { data: myGroups } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId);

  const groupIds = myGroups?.map((g: any) => g.group_id) ?? [];
  let peerIds: string[] = [userId];

  if (groupIds.length > 0) {
    const { data: peers } = await supabase
      .from('group_members')
      .select('user_id')
      .in('group_id', groupIds);
    const ids = peers?.map((p: any) => p.user_id) ?? [];
    peerIds = [...new Set([userId, ...ids])];
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('solves')
    .select('id, user_id, solved_at, points, source, problems(title, difficulty), profiles(username, display_name)')
    .in('user_id', peerIds)
    .gte('solved_at', thirtyDaysAgo)
    .order('solved_at', { ascending: false })
    .limit(200);

  if (error) throw error;
  return data as unknown as FeedRow[];
}

type SquadPosition = {
  groupName: string;
  rank: number;
  memberCount: number;
  gapToLeader: number;
  leaderName: string | null;
};

async function fetchSquadPosition(userId: string): Promise<SquadPosition | null> {
  const { data: membership } = await supabase
    .from('group_members').select('group_id').eq('user_id', userId).limit(1).maybeSingle();
  if (!membership) return null;

  const { data: group } = await supabase
    .from('groups').select('name').eq('id', membership.group_id).maybeSingle();
  if (!group) return null;

  const { data: members } = await supabase
    .from('group_members')
    .select('user_id, profiles(username, display_name)')
    .eq('group_id', membership.group_id);
  const memberIds = (members ?? []).map((m: any) => m.user_id);
  if (!memberIds.length) return null;

  const { data: solves } = await supabase
    .from('solves').select('user_id, points')
    .in('user_id', memberIds)
    .gte('solved_at', weekStartISO());

  const pts = new Map<string, number>();
  for (const id of memberIds) pts.set(id, 0);
  for (const r of solves ?? []) pts.set(r.user_id, (pts.get(r.user_id) ?? 0) + r.points);

  const ranked = [...pts.entries()].sort((a, b) => b[1] - a[1]);
  const myIdx = ranked.findIndex(([id]) => id === userId);
  const leaderId = ranked[0]?.[0];
  const leader = (members ?? []).find((m: any) => m.user_id === leaderId) as any;

  return {
    groupName: group.name,
    rank: myIdx + 1,
    memberCount: memberIds.length,
    gapToLeader: (ranked[0]?.[1] ?? 0) - (pts.get(userId) ?? 0),
    leaderName: leaderId === userId ? null : (leader?.profiles?.display_name ?? leader?.profiles?.username ?? null),
  };
}

type UpNext = {
  slug: string;
  title: string;
  difficulty: Difficulty;
  topic: RadarLabel;
  topicPct: number;
};

async function fetchUpNext(userId: string, topics: Array<{ label: RadarLabel; value: number }>): Promise<UpNext | null> {
  const { data: solved } = await supabase
    .from('solves').select('problem_slug').eq('user_id', userId);
  const solvedSlugs = new Set((solved ?? []).map((r: any) => r.problem_slug));

  // Walk weakest → strongest topic until we find an unsolved catalog problem.
  const diffOrder: Record<string, number> = { easy: 0, medium: 1, hard: 2 };
  for (const t of topics) {
    const tag = RADAR_TO_CATALOG_TAG[t.label];
    const { data: problems } = await supabase
      .from('problems')
      .select('slug, title, difficulty')
      .contains('tags', [tag])
      .eq('is_premium', false);
    const candidates = (problems ?? [])
      .filter((p: any) => !solvedSlugs.has(p.slug))
      .sort((a: any, b: any) => (diffOrder[a.difficulty] ?? 1) - (diffOrder[b.difficulty] ?? 1));
    // Prefer a medium if one exists (easies are warm-ups, hards scare people off).
    const pick = candidates.find((p: any) => p.difficulty === 'medium') ?? candidates[0];
    if (pick) {
      return { slug: pick.slug, title: pick.title, difficulty: pick.difficulty, topic: t.label, topicPct: t.value };
    }
  }
  return null;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function Today() {
  const qc = useQueryClient();
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [topicOffset, setTopicOffset] = useState(0);

  useEffect(() => {
    const ch = supabase
      .channel('feed-solves')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'solves' }, () => {
        qc.invalidateQueries({ queryKey: ['feed'] });
        qc.invalidateQueries({ queryKey: ['week-stats'] });
        qc.invalidateQueries({ queryKey: ['squad-position'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const { data: profile } = useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      return data as Profile | null;
    },
  });

  const { data: streak } = useQuery({
    queryKey: ['streak', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from('streaks').select('*').eq('user_id', userId).maybeSingle();
      return data as Streak | null;
    },
  });

  const { data: weekStats } = useQuery({
    queryKey: ['week-stats', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('solves').select('points, solved_at')
        .eq('user_id', userId)
        .gte('solved_at', weekStartISO());
      const today = new Date().toDateString();
      return {
        count: data?.length ?? 0,
        pts: data?.reduce((s, r) => s + r.points, 0) ?? 0,
        todayCount: data?.filter(r => new Date(r.solved_at).toDateString() === today).length ?? 0,
      };
    },
  });

  const { data: feed, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['feed', userId],
    queryFn: () => fetchFeedData(userId),
    enabled: !!userId,
  });

  const { data: squad } = useQuery({
    queryKey: ['squad-position', userId],
    enabled: !!userId,
    staleTime: 1000 * 60,
    queryFn: () => fetchSquadPosition(userId),
  });

  const lcUsername = safeLcUsername(profile?.leetcode_username);
  const { data: lcTagStats } = useLcTagStats(lcUsername);

  const weakTopics = useMemo(
    () => weakestAxes(buildRadarAxes(lcTagStats)),
    [lcTagStats],
  );
  const rotatedTopics = useMemo(
    () => weakTopics.map((_, i) => weakTopics[(i + topicOffset) % weakTopics.length]),
    [weakTopics, topicOffset],
  );

  const { data: upNext } = useQuery({
    queryKey: ['up-next', userId, topicOffset, !!lcTagStats],
    enabled: !!userId && rotatedTopics.length > 0,
    staleTime: 1000 * 60 * 5,
    queryFn: () => fetchUpNext(userId, rotatedTopics),
  });

  const sections = useMemo<Section[]>(() => {
    if (!feed) return [];
    const map = new Map<string, FeedRow[]>();
    for (const row of feed) {
      const label = dayLabel(row.solved_at);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(row);
    }
    return Array.from(map.entries()).map(([title, rows]) => ({ title, data: rows }));
  }, [feed]);

  const goal = profile?.weekly_goal ?? 5;
  const done = weekStats?.count ?? 0;
  const toGo = Math.max(0, goal - done);
  const name = profile?.display_name ?? profile?.username ?? 'You';

  const header = (
    <View style={s.headerWrap}>
      {/* ── Title row ─────────────────────────── */}
      <View style={s.titleRow}>
        <View>
          <Text style={s.eyebrow}>{todayEyebrow()}</Text>
          <Text style={s.h1}>Today</Text>
        </View>
        <View style={s.titleRight}>
          {(streak?.current_days ?? 0) > 0 && (
            <View style={s.streakChip}>
              <Text style={s.streakChipText}>🔥 {streak!.current_days}</Text>
            </View>
          )}
          <Pressable onPress={() => router.push('/profile')} hitSlop={8}>
            <Avatar name={name} size={34} url={profile?.avatar_url} />
          </Pressable>
        </View>
      </View>

      {/* ── Weekly goal ring ──────────────────── */}
      <View style={s.card}>
        <View style={s.ringRow}>
          <GoalRing done={done} goal={goal} />
          <View style={s.ringInfo}>
            <Text style={s.ringTitle}>
              {toGo === 0 ? 'Weekly goal hit 🎉' : `${toGo} solve${toGo !== 1 ? 's' : ''} from your goal`}
            </Text>
            <Text style={s.ringSub}>
              {toGo === 0
                ? 'Streak safe. Everything above this is flexing.'
                : 'Solve today to stay on pace — the week resets Monday.'}
            </Text>
            <View style={s.ringChips}>
              {(weekStats?.todayCount ?? 0) > 0
                ? <View style={[s.pill, { backgroundColor: colors.easy + '18' }]}>
                    <Text style={[s.pillText, { color: colors.easy }]}>✓ today: {weekStats!.todayCount}</Text>
                  </View>
                : <View style={s.pill}><Text style={s.pillText}>nothing today yet</Text></View>
              }
              <View style={s.pill}><Text style={s.pillText}>+{weekStats?.pts ?? 0} pts</Text></View>
            </View>
          </View>
        </View>
      </View>

      {/* ── Up next ───────────────────────────── */}
      {upNext && (
        <View style={[s.card, s.upNextCard]}>
          <View style={s.upNextTop}>
            <Text style={s.upNextLabel}>UP NEXT · WEAKEST: {upNext.topic.toUpperCase()}</Text>
            <View style={[s.pill, { backgroundColor: DIFF_COLOR[upNext.difficulty] + '18' }]}>
              <Text style={[s.pillText, { color: DIFF_COLOR[upNext.difficulty] }]}>
                {DIFF_LABEL[upNext.difficulty]}
              </Text>
            </View>
          </View>
          <Text style={s.upNextTitle}>{upNext.title}</Text>
          <Text style={s.upNextWhy}>
            {upNext.topic} is your lowest radar axis ({Math.round(upNext.topicPct * 100)}%). Clearing this moves your breadth bonus.
          </Text>
          <View style={s.upNextBtns}>
            <Pressable
              style={s.solveBtn}
              onPress={() => Linking.openURL(problemUrl(upNext.slug))}
            >
              <Text style={s.solveBtnText}>Solve on LeetCode</Text>
              <Ionicons name="open-outline" size={14} color="#fff" />
            </Pressable>
            <Pressable
              style={s.swapBtn}
              onPress={() => setTopicOffset(o => o + 1)}
            >
              <Text style={s.swapBtnText}>Swap</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Mock interview ────────────────────── */}
      <Pressable style={[s.card, s.interviewCard]} onPress={() => router.push('/interview')}>
        <View style={s.interviewIcon}>
          <Ionicons name="sparkles" size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.interviewTitle}>Mock Interview</Text>
          <Text style={s.interviewSub}>Socratic AI interviewer · graded report</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.accentText} />
      </Pressable>

      {/* ── Squad position / CTA ──────────────── */}
      {squad ? (
        <Pressable style={[s.card, s.squadCard]} onPress={() => router.push('/group')}>
          <Ionicons name="people" size={18} color={colors.accentText} />
          <View style={{ flex: 1 }}>
            <Text style={s.squadTitle}>#{squad.rank} in {squad.groupName}</Text>
            <Text style={s.squadSub}>
              {squad.rank === 1
                ? `You hold the crown — ${squad.memberCount} members chasing`
                : `${squad.gapToLeader} pts behind ${squad.leaderName ?? 'the leader'}`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={15} color={colors.textLight} />
        </Pressable>
      ) : squad === null ? (
        <View style={[s.card, s.squadCtaCard]}>
          <Text style={s.squadCtaTitle}>Grind hits different with a squad</Text>
          <Text style={s.squadCtaSub}>
            Shared leaderboard, streak pressure, and a chat that celebrates every hard solve.
          </Text>
          <Pressable style={s.solveBtn} onPress={() => router.push('/group/create')}>
            <Text style={s.solveBtnText}>Start a squad</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/group/join')} style={s.joinLink}>
            <Text style={s.joinLinkText}>I have an invite code</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={s.feedLabel}>SQUAD ACTIVITY</Text>
    </View>
  );

  return (
    <SafeAreaView style={s.safe}>
      <SectionList
        sections={sections}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingHorizontal: space(4), paddingBottom: space(20) }}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl tintColor={colors.accent} refreshing={isRefetching} onRefresh={refetch} />
        }
        renderSectionHeader={({ section }) => (
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>{section.title}</Text>
            <View style={s.sectionLine} />
          </View>
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <View style={s.emptyIcon}>
              <Ionicons name="code-slash-outline" size={32} color={colors.accent} />
            </View>
            <Text style={s.emptyTitle}>{isLoading ? 'Loading…' : 'No activity yet'}</Text>
            <Text style={s.emptySub}>
              {isLoading ? '' : 'Solve on LeetCode — auto-sync posts it here for your squad.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isMe = item.user_id === userId;
          const rowName = item.profiles?.display_name ?? item.profiles?.username ?? '?';
          const handle = item.profiles?.username ?? '';
          const diff = item.problems?.difficulty ?? 'easy';
          const diffColor = DIFF_COLOR[diff];
          return (
            <View style={[s.feedCard, isMe && s.feedCardMe]}>
              <View style={s.feedCardInner}>
                <View style={s.feedCardTop}>
                  <Avatar name={rowName} size={34} />
                  <View style={s.feedCardUser}>
                    <Text style={s.feedCardName}>{isMe ? 'You' : rowName}</Text>
                    {!isMe && <Text style={s.feedCardHandle}>@{handle}</Text>}
                  </View>
                  <Text style={s.feedCardTime}>{timeAgo(item.solved_at)}</Text>
                </View>
                <Text style={s.feedCardProblem} numberOfLines={2}>{item.problems?.title ?? 'Unknown problem'}</Text>
                <View style={s.feedCardBottom}>
                  <View style={[s.pill, { backgroundColor: diffColor + '18' }]}>
                    <Text style={[s.pillText, { color: diffColor }]}>{DIFF_LABEL[diff]}</Text>
                  </View>
                  <Text style={s.pts}>+{item.points} pts</Text>
                  {item.source === 'leetcode_sync' && (
                    <View style={s.lcBadge}>
                      <Ionicons name="checkmark-circle" size={11} color={colors.accent} />
                      <Text style={s.lcBadgeText}>LC</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  headerWrap: { paddingTop: space(4), gap: space(3) },

  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: colors.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  h1: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  titleRight: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  streakChip: {
    backgroundColor: 'rgba(255,138,61,0.14)', borderRadius: 20,
    paddingHorizontal: space(3), paddingVertical: space(1),
  },
  streakChipText: { color: colors.streak, fontSize: 13, fontWeight: '800' },

  card: {
    backgroundColor: colors.card, borderRadius: radius.xl,
    padding: space(4), borderWidth: 1, borderColor: colors.border, ...shadow.sm,
  },

  // Goal ring
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: space(4) },
  ringInfo: { flex: 1, gap: space(1) },
  ringTitle: { color: colors.text, fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  ringSub: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  ringChips: { flexDirection: 'row', gap: space(2), marginTop: space(1) },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  pillText: { color: colors.textDim, fontSize: 11, fontWeight: '700' },

  // Up next
  upNextCard: { borderColor: colors.accent + '45', backgroundColor: '#151a2e', gap: space(2) },
  upNextTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  upNextLabel: { color: colors.accentText, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  upNextTitle: { color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  upNextWhy: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  upNextBtns: { flexDirection: 'row', gap: space(2), marginTop: space(1) },
  solveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.accent, borderRadius: radius.lg, paddingVertical: space(3),
  },
  solveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  swapBtn: {
    backgroundColor: colors.accentLight, borderRadius: radius.lg,
    paddingVertical: space(3), paddingHorizontal: space(4),
    alignItems: 'center', justifyContent: 'center',
  },
  swapBtnText: { color: colors.accentText, fontWeight: '700', fontSize: 13 },

  // Mock interview
  interviewCard: {
    flexDirection: 'row', alignItems: 'center', gap: space(3),
    backgroundColor: colors.accentLight, borderColor: colors.accent + '50',
  },
  interviewIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 4,
  },
  interviewTitle: { color: colors.text, fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  interviewSub: { color: colors.accentText, fontSize: 11, marginTop: 2 },

  // Squad
  squadCard: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(3) },
  squadTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  squadSub: { color: colors.textDim, fontSize: 11, marginTop: 1 },
  squadCtaCard: { alignItems: 'center', gap: space(2), paddingVertical: space(5), borderColor: colors.accent + '35' },
  squadCtaTitle: { color: colors.text, fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  squadCtaSub: { color: colors.textDim, fontSize: 12, textAlign: 'center', paddingHorizontal: space(4), marginBottom: space(2) },
  joinLink: { paddingVertical: space(2) },
  joinLinkText: { color: colors.accentText, fontSize: 13, fontWeight: '600' },

  feedLabel: {
    color: colors.textDim, fontSize: 11, fontWeight: '700',
    letterSpacing: 0.8, marginTop: space(2),
  },

  // Feed (carried over from feed.tsx)
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: space(2),
    marginTop: space(4), marginBottom: space(2),
  },
  sectionTitle: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  sectionLine: { flex: 1, height: 1, backgroundColor: colors.border },
  feedCard: {
    backgroundColor: colors.card, borderRadius: radius.lg,
    marginBottom: space(2), borderWidth: 1, borderColor: colors.border,
  },
  feedCardMe: { borderColor: 'rgba(99,102,241,0.25)', backgroundColor: '#13111f' },
  feedCardInner: { padding: space(3) },
  feedCardTop: { flexDirection: 'row', alignItems: 'center', gap: space(2), marginBottom: space(2) },
  feedCardUser: { flex: 1 },
  feedCardName: { color: colors.text, fontWeight: '700', fontSize: 13 },
  feedCardHandle: { color: colors.textLight, fontSize: 11 },
  feedCardTime: { color: colors.textLight, fontSize: 11 },
  feedCardProblem: { color: colors.text, fontSize: 14, fontWeight: '600', marginBottom: space(3), lineHeight: 20 },
  feedCardBottom: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  pts: { color: colors.textDim, fontWeight: '600', fontSize: 12 },
  lcBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto',
    backgroundColor: colors.accentLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  lcBadgeText: { color: colors.accent, fontSize: 10, fontWeight: '700' },

  empty: { alignItems: 'center', paddingTop: space(10), gap: space(3) },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.accentLight, alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  emptySub: { color: colors.textDim, fontSize: 13, textAlign: 'center', paddingHorizontal: space(8) },
});
