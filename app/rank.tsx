import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/stores/auth';
import { GemBadge } from '@/ranks/GemBadge';
import { GemChip } from '@/ranks/GemChip';
import { RANKS, rankForSolves, progressToNext, nextRank } from '@/ranks/ranks-data';
import { useLcStats, safeLcUsername } from '@/lib/leetcode';
import { colors, radius, space, shadow } from '@/theme';
import type { Profile } from '@/types/database';

const PAD = space(4);

/** The full gem ladder — drill-in from the You tab. */
export default function RankLadder() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: profile } = useQuery({
    queryKey: ['profile', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', uid!).maybeSingle();
      return data as Profile | null;
    },
  });

  const { data: allTimeStats } = useQuery({
    queryKey: ['alltime-stats', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase.from('solves').select('points').eq('user_id', uid!);
      return { count: data?.length ?? 0, pts: data?.reduce((s, r) => s + r.points, 0) ?? 0 };
    },
  });

  const lcUsername = safeLcUsername(profile?.leetcode_username);
  const { data: lcStats } = useLcStats(lcUsername);

  const solved = lcStats?.total ?? allTimeStats?.count ?? 0;
  const current = rankForSolves(solved);
  const next = nextRank(current.key);
  const pct = progressToNext(solved, current.key);
  const currentIdx = RANKS.findIndex(r => r.key === current.key);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + space(10) }}>

        <View style={s.navRow}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={s.navTitle}>The Ladder</Text>
          <View style={{ width: 38 }} />
        </View>

        {/* Current rank hero */}
        <View style={s.hero}>
          <View style={{ shadowColor: current.glow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 8 }}>
            <GemBadge tier={current} size={150} />
          </View>
          <Text style={[s.heroRank, { color: current.glow }]}>{current.name}</Text>
          <Text style={s.heroSub}>{solved} solved</Text>
          {next && (
            <View style={s.progressWrap}>
              <View style={s.progressTrack}>
                <View style={[s.progressFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: current.glow }]} />
              </View>
              <Text style={s.progressLabel}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>{next.thr - solved}</Text>
                {' solves to '}
                <Text style={{ color: next.glow, fontWeight: '700' }}>{next.name}</Text>
              </Text>
            </View>
          )}
        </View>

        {/* Full ladder */}
        <View style={s.section}>
          <View style={s.listCard}>
            {RANKS.map((r, i) => {
              const isCurrent = r.key === current.key;
              const passed = i < currentIdx;
              return (
                <View
                  key={r.key}
                  style={[
                    s.tierRow,
                    isCurrent && { backgroundColor: r.glow + '18' },
                    i < RANKS.length - 1 && s.tierRowBorder,
                  ]}
                >
                  <GemChip tier={r} size={34} />
                  <View style={s.tierRowInfo}>
                    <Text style={[s.tierRowLabel, { color: isCurrent ? r.glow : passed ? colors.textDim : colors.text }]}>
                      {r.name}
                    </Text>
                    <Text style={s.tierRowRange}>{r.thr}+ solves</Text>
                  </View>
                  {isCurrent
                    ? <View style={[s.youTag, { backgroundColor: r.glow }]}><Text style={s.youTagText}>you</Text></View>
                    : passed
                      ? <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                      : null
                  }
                </View>
              );
            })}
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  navRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: PAD, paddingVertical: space(2),
  },
  backBtn: { padding: space(2) },
  navTitle: { color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },

  hero: { alignItems: 'center', paddingVertical: space(6), paddingHorizontal: PAD },
  heroRank: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5, marginTop: space(3) },
  heroSub: { color: colors.textDim, fontSize: 13, marginTop: 2, marginBottom: space(4) },
  progressWrap: { width: '100%', gap: space(2) },
  progressTrack: { height: 7, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 7, borderRadius: 4 },
  progressLabel: { color: colors.textDim, fontSize: 12, textAlign: 'center' },

  section: { paddingHorizontal: PAD },
  listCard: {
    backgroundColor: colors.card, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.sm,
  },
  tierRow: {
    flexDirection: 'row', alignItems: 'center', gap: space(3),
    paddingHorizontal: space(4), paddingVertical: space(3),
  },
  tierRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  tierRowInfo: { flex: 1 },
  tierRowLabel: { fontSize: 13, fontWeight: '700' },
  tierRowRange: { color: colors.textLight, fontSize: 11, fontWeight: '600' },
  youTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, marginLeft: space(2) },
  youTagText: { color: '#000', fontSize: 10, fontWeight: '800' },
});
