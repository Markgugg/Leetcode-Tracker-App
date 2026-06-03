import { View, Text, FlatList, StyleSheet, Pressable, SafeAreaView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/stores/auth';
import { Avatar } from '@/components/Avatar';
import { colors, radius, space, shadow } from '@/theme';

type Row = { user_id: string; username: string; display_name: string | null; points: number; problem_count: number };

const MEDALS = ['🥇', '🥈', '🥉'];
const MEDAL_COLOR = ['#FFD700', '#C0C0C0', '#CD7F32'];

export default function Leaderboard() {
  const [range, setRange] = useState<'week' | 'alltime'>('week');
  const { session } = useAuth();
  const myId = session?.user.id;

  const { data } = useQuery({
    queryKey: ['leaderboard', range, myId],
    enabled: !!myId,
    queryFn: async () => {
      const { data: myGroups } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', myId);

      const groupIds = myGroups?.map((g: any) => g.group_id) ?? [];
      let peerIds: string[] = [myId!];

      if (groupIds.length > 0) {
        const { data: peers } = await supabase
          .from('group_members')
          .select('user_id')
          .in('group_id', groupIds);
        const ids = peers?.map((p: any) => p.user_id) ?? [];
        peerIds = [...new Set([myId!, ...ids])];
      }

      let q = supabase
        .from('solves')
        .select('user_id, points, profiles(username, display_name)')
        .in('user_id', peerIds);

      if (range === 'week') {
        const since = new Date();
        since.setDate(since.getDate() - since.getDay() + 1);
        since.setHours(0, 0, 0, 0);
        q = q.gte('solved_at', since.toISOString());
      }

      const { data, error } = await q;
      if (error) throw error;
      const agg = new Map<string, Row>();
      for (const r of data as any[]) {
        const k = r.user_id;
        const cur = agg.get(k) ?? { user_id: k, username: r.profiles?.username ?? '—', display_name: r.profiles?.display_name ?? null, points: 0, problem_count: 0 };
        cur.points += r.points;
        cur.problem_count += 1;
        agg.set(k, cur);
      }
      return [...agg.values()].sort((a, b) => b.points - a.points);
    },
  });

  const topPoints = data?.[0]?.points ?? 1;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <Text style={s.h1}>Leaderboard</Text>

        <View style={s.toggle}>
          {(['week', 'alltime'] as const).map((r) => (
            <Pressable key={r} style={[s.tab, range === r && s.tabActive]} onPress={() => setRange(r)}>
              <Text style={[s.tabText, range === r && s.tabTextActive]}>
                {r === 'week' ? 'This Week' : 'All Time'}
              </Text>
            </Pressable>
          ))}
        </View>

        <FlatList
          data={data ?? []}
          keyExtractor={(r) => r.user_id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: space(4), paddingBottom: space(20) }}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="trophy-outline" size={48} color={colors.textLight} />
              <Text style={s.emptyTitle}>No activity yet</Text>
              <Text style={s.emptySub}>Log solves to appear on the board.</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const isMe = item.user_id === myId;
            const pct = item.points / topPoints;
            const gap = (data?.[0]?.points ?? 0) - item.points;
            const isTop3 = index < 3;
            const name = item.display_name ?? item.username;

            return (
              <View style={[s.row, isMe && s.rowMe]}>
                {/* Rank */}
                <View style={s.rankWrap}>
                  {isTop3
                    ? <Text style={s.medalEmoji}>{MEDALS[index]}</Text>
                    : <Text style={[s.rankNum, isMe && s.rankNumMe]}>{index + 1}</Text>
                  }
                </View>

                {/* Avatar + name */}
                <Avatar name={name} size={40} />
                <View style={s.info}>
                  <View style={s.infoTop}>
                    <Text style={[s.name, isMe && s.nameMe]} numberOfLines={1}>
                      {name}{isMe ? ' (you)' : ''}
                    </Text>
                    <Text style={[s.pts, isMe && s.ptsMe]}>{item.points} pts</Text>
                  </View>

                  {/* Progress bar showing % of leader's score */}
                  <View style={s.barBg}>
                    <View style={[
                      s.barFill,
                      { width: `${Math.max(4, pct * 100)}%` },
                      isTop3 && { backgroundColor: MEDAL_COLOR[index] },
                      isMe && !isTop3 && { backgroundColor: colors.accent },
                    ]} />
                  </View>

                  <Text style={s.subRow}>
                    {item.problem_count} solved{gap > 0 ? `  ·  ${gap} pts behind` : ''}
                  </Text>
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
  h1: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5, paddingHorizontal: space(4), paddingTop: space(4), paddingBottom: space(3) },
  toggle: {
    flexDirection: 'row', marginHorizontal: space(4), marginBottom: space(4),
    backgroundColor: colors.card, borderRadius: radius.lg, padding: 3, ...shadow.sm,
  },
  tab: { flex: 1, paddingVertical: space(2), alignItems: 'center', borderRadius: radius.md },
  tabActive: { backgroundColor: colors.accent },
  tabText: { color: colors.textDim, fontWeight: '600', fontSize: 14 },
  tabTextActive: { color: '#fff' },

  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card,
    borderRadius: radius.lg, padding: space(3), marginBottom: space(2),
    gap: space(3), ...shadow.sm,
  },
  rowMe: { borderWidth: 1.5, borderColor: colors.accent },

  rankWrap: { width: 32, alignItems: 'center' },
  medalEmoji: { fontSize: 22 },
  rankNum: { color: colors.textLight, fontWeight: '800', fontSize: 16 },
  rankNumMe: { color: colors.accent },

  info: { flex: 1 },
  infoTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space(2) },
  name: { color: colors.text, fontWeight: '700', fontSize: 14, flex: 1, marginRight: space(2) },
  nameMe: { color: colors.accent },
  pts: { color: colors.text, fontWeight: '800', fontSize: 15 },
  ptsMe: { color: colors.accent },

  barBg: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden', marginBottom: space(1) },
  barFill: { height: 6, backgroundColor: colors.textLight, borderRadius: 3 },

  subRow: { color: colors.textDim, fontSize: 11 },

  empty: { alignItems: 'center', paddingTop: space(20), gap: space(2) },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  emptySub: { color: colors.textDim, fontSize: 14 },
});
