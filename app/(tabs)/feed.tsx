import { useEffect, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, Pressable, SafeAreaView, SectionList } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/stores/auth';
import { Avatar } from '@/components/Avatar';
import { colors, radius, space, shadow } from '@/theme';

type FeedRow = {
  id: string;
  user_id: string;
  solved_at: string;
  points: number;
  source: 'manual' | 'leetcode_sync';
  problems: { title: string; difficulty: 'easy' | 'medium' | 'hard' } | null;
  profiles: { username: string; display_name: string | null } | null;
};

type Section = { title: string; data: FeedRow[] };

const DIFF_COLOR = { easy: colors.easy, medium: colors.medium, hard: colors.hard };
const DIFF_LABEL = { easy: 'Easy', medium: 'Med', hard: 'Hard' };

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const todayStr = now.toDateString();
  const yestStr = new Date(now.getTime() - 86400000).toDateString();
  if (d.toDateString() === todayStr) return 'Today';
  if (d.toDateString() === yestStr) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

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

export default function Feed() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';

  useEffect(() => {
    const ch = supabase
      .channel('feed-solves')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'solves' }, () => {
        qc.invalidateQueries({ queryKey: ['feed'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['feed', userId],
    queryFn: () => fetchFeedData(userId),
    enabled: !!userId,
  });

  const sections = useMemo<Section[]>(() => {
    if (!data) return [];
    const map = new Map<string, FeedRow[]>();
    for (const row of data) {
      const label = dayLabel(row.solved_at);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(row);
    }
    return Array.from(map.entries()).map(([title, rows]) => ({ title, data: rows }));
  }, [data]);

  const todayCount = useMemo(() => {
    const today = new Date().toDateString();
    return data?.filter(r => new Date(r.solved_at).toDateString() === today).length ?? 0;
  }, [data]);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <View style={s.header}>
          <View>
            <Text style={s.h1}>Activity</Text>
            <Text style={s.headerSub}>
              {todayCount > 0 ? `${todayCount} solve${todayCount > 1 ? 's' : ''} today` : 'Your groups & you'}
            </Text>
          </View>
        </View>

        <SectionList
          sections={sections}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ paddingHorizontal: space(4), paddingBottom: space(20) }}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
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
              <Text style={s.emptyTitle}>{isLoading ? 'Loading…' : 'No solves yet'}</Text>
              <Text style={s.emptySub}>
                {isLoading ? '' : 'Log your first solve or join a group to see activity here.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isMe = item.user_id === userId;
            const name = item.profiles?.display_name ?? item.profiles?.username ?? '?';
            const handle = item.profiles?.username ?? '';
            const diff = item.problems?.difficulty ?? 'easy';
            const diffColor = DIFF_COLOR[diff];
            return (
              <View style={[s.card, isMe && s.cardMe]}>
                <View style={s.cardInner}>
                  <View style={s.cardTop}>
                    <Avatar name={name} size={34} />
                    <View style={s.cardUser}>
                      <Text style={s.cardName}>{isMe ? 'You' : name}</Text>
                      {!isMe && <Text style={s.cardHandle}>@{handle}</Text>}
                    </View>
                    <Text style={s.cardTime}>{timeAgo(item.solved_at)}</Text>
                  </View>
                  <Text style={s.cardProblem} numberOfLines={2}>{item.problems?.title ?? 'Unknown problem'}</Text>
                  <View style={s.cardBottom}>
                    <View style={[s.diffPill, { backgroundColor: diffColor + '18' }]}>
                      <Text style={[s.diffLabel, { color: diffColor }]}>{DIFF_LABEL[diff]}</Text>
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
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: space(4), paddingTop: space(4), paddingBottom: space(3),
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  h1: { color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  headerSub: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  logBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.accent, paddingHorizontal: space(3),
    paddingVertical: space(2), borderRadius: radius.lg,
  },
  logBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: space(2),
    marginTop: space(5), marginBottom: space(2),
  },
  sectionTitle: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  sectionLine: { flex: 1, height: 1, backgroundColor: colors.border },
  card: {
    backgroundColor: colors.card, borderRadius: radius.lg,
    marginBottom: space(2), borderWidth: 1, borderColor: colors.border,
  },
  cardMe: { borderColor: 'rgba(99,102,241,0.25)', backgroundColor: '#13111f' },
  cardInner: { padding: space(3) },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: space(2), marginBottom: space(2) },
  cardUser: { flex: 1 },
  cardName: { color: colors.text, fontWeight: '700', fontSize: 13 },
  cardHandle: { color: colors.textLight, fontSize: 11 },
  cardTime: { color: colors.textLight, fontSize: 11 },
  cardProblem: { color: colors.text, fontSize: 14, fontWeight: '600', marginBottom: space(3), lineHeight: 20 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  diffPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  diffLabel: { fontSize: 11, fontWeight: '700' },
  pts: { color: colors.textDim, fontWeight: '600', fontSize: 12 },
  lcBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto', backgroundColor: colors.accentLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  lcBadgeText: { color: colors.accent, fontSize: 10, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: space(20), gap: space(3) },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  emptySub: { color: colors.textDim, fontSize: 13, textAlign: 'center', paddingHorizontal: space(8) },
});
