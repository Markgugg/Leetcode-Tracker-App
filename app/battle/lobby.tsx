import {
  View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/stores/auth';
import { Avatar } from '@/components/Avatar';
import { colors, radius, space, shadow } from '@/theme';

// ─── Problems ─────────────────────────────────────────────────────────────────

const BATTLE_PROBLEMS = [
  { title: 'Valid Parentheses',   difficulty: 'easy'   as const, tests: 10 },
  { title: 'Two Sum',             difficulty: 'easy'   as const, tests: 8  },
  { title: 'Climbing Stairs',     difficulty: 'easy'   as const, tests: 8  },
  { title: 'Maximum Subarray',    difficulty: 'medium' as const, tests: 12 },
  { title: 'Merge Intervals',     difficulty: 'medium' as const, tests: 12 },
  { title: 'Number of Islands',   difficulty: 'medium' as const, tests: 14 },
];

type Member = { user_id: string; username: string; display_name: string | null; weekPoints: number };

const DIFF_COLOR = { easy: colors.easy, medium: colors.medium, hard: colors.hard };

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function BattleLobby() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';

  const [selected, setSelected] = useState<Member | null>(null);

  const { data: members, isLoading } = useQuery({
    queryKey: ['battle-members', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: membership } = await supabase
        .from('group_members').select('group_id').eq('user_id', userId).limit(1).maybeSingle();
      if (!membership) return [];

      const { data: gm } = await supabase
        .from('group_members')
        .select('user_id, profiles(username, display_name)')
        .eq('group_id', membership.group_id);

      const since = new Date();
      since.setDate(since.getDate() - since.getDay() + 1);
      since.setHours(0, 0, 0, 0);
      const ids = (gm ?? []).map((m: any) => m.user_id).filter((id: string) => id !== userId);
      const { data: solves } = ids.length
        ? await supabase.from('solves').select('user_id, points').in('user_id', ids).gte('solved_at', since.toISOString())
        : { data: [] };

      const pts = new Map<string, number>();
      for (const r of solves ?? []) pts.set(r.user_id, (pts.get(r.user_id) ?? 0) + r.points);

      return ((gm ?? []) as any[])
        .filter((m: any) => m.user_id !== userId)
        .map((m: any) => ({
          user_id: m.user_id,
          username: m.profiles?.username ?? '—',
          display_name: m.profiles?.display_name ?? null,
          weekPoints: pts.get(m.user_id) ?? 0,
        })) as Member[];
    },
  });

  const myName = session?.user.email?.split('@')[0] ?? 'You';
  const opponent = selected ?? members?.[0] ?? null;
  const oppName = opponent ? (opponent.display_name ?? opponent.username) : '?';

  const launch = () => {
    if (!opponent) return;
    const problem = BATTLE_PROBLEMS[Math.floor(Math.random() * BATTLE_PROBLEMS.length)];
    router.push({
      pathname: '/battle/live',
      params: {
        opponentJson: JSON.stringify(opponent),
        problemJson: JSON.stringify(problem),
      },
    });
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>

      {/* Header */}
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={20} color={colors.textDim} />
        </Pressable>
        <View style={s.headerCenter}>
          <Ionicons name="flash" size={15} color={colors.hard} />
          <Text style={s.headerTitle}>Code Duel</Text>
        </View>
        <View style={{ width: 34 }} />
      </View>

      {/* VS hero */}
      <View style={s.vsRow}>
        <View style={s.vsPlayer}>
          <View style={[s.avatarRing, { borderColor: colors.accent }]}>
            <Avatar name={myName} size={62} />
          </View>
          <Text style={s.vsName}>You</Text>
          <Text style={s.vsElo}>1572 ELO</Text>
        </View>
        <Text style={s.vsText}>VS</Text>
        <View style={s.vsPlayer}>
          <View style={[s.avatarRing, { borderColor: colors.hard }]}>
            <Avatar name={oppName} size={62} />
          </View>
          <Text style={s.vsName} numberOfLines={1}>{oppName}</Text>
          <Text style={[s.vsElo, { color: colors.hard }]}>
            {opponent?.weekPoints ?? 0} pts
          </Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>

        {/* Opponent picker */}
        {isLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: space(6) }} />
        ) : (members?.length ?? 0) === 0 ? (
          <View style={s.emptyOpps}>
            <Text style={s.emptyOppsText}>No clan members to challenge yet.</Text>
          </View>
        ) : (
          <>
            <Text style={s.sectionLabel}>CHOOSE YOUR OPPONENT</Text>
            {members!.map(m => {
              const sel = m.user_id === (selected?.user_id ?? members![0]?.user_id);
              const name = m.display_name ?? m.username;
              return (
                <Pressable
                  key={m.user_id}
                  style={[s.memberRow, sel && s.memberRowSel]}
                  onPress={() => setSelected(m)}
                >
                  <Avatar name={name} size={42} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.memberName}>{name}</Text>
                    <Text style={s.memberSub}>{m.weekPoints} pts this week</Text>
                  </View>
                  {sel && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
                </Pressable>
              );
            })}
          </>
        )}

        {/* Match details */}
        <Text style={[s.sectionLabel, { marginTop: space(5) }]}>THE MATCH</Text>
        <View style={s.matchCard}>
          <View style={s.matchRow}>
            <View style={s.matchIconWrap}>
              <Ionicons name="flash" size={16} color={colors.accentText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.matchTitle}>Same problem, both at once</Text>
              <Text style={s.matchSub}>Random pick · revealed at the buzzer</Text>
            </View>
            <View style={[s.diffPill, { backgroundColor: colors.medium + '1F' }]}>
              <Text style={[s.diffLabel, { color: colors.medium }]}>Medium</Text>
            </View>
          </View>
          <View style={s.matchRule}>
            <Ionicons name="checkmark" size={13} color={colors.success} />
            <Text style={s.matchRuleText}>
              Winner = most test cases passed. Ties break on time.
            </Text>
          </View>
        </View>

      </ScrollView>

      {/* CTA */}
      <View style={[s.ctaWrap, { paddingBottom: insets.bottom + space(4) }]}>
        <Pressable
          style={[s.challengeBtn, !opponent && { opacity: 0.5 }]}
          onPress={launch}
          disabled={!opponent}
        >
          <Ionicons name="flash" size={18} color="#fff" />
          <Text style={s.challengeBtnText}>Send challenge</Text>
        </Pressable>
        <Text style={s.challengeHint}>Posts to clan chat · they tap to accept</Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PAD = space(4);

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: PAD, paddingBottom: space(3) },
  backBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space(2) },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },

  // VS
  vsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space(4), paddingHorizontal: PAD, paddingBottom: space(5) },
  vsPlayer: { flex: 1, alignItems: 'center', gap: space(2) },
  avatarRing: { borderWidth: 2.5, borderRadius: 999, padding: 3 },
  vsName: { color: colors.text, fontWeight: '800', fontSize: 14 },
  vsElo: { color: colors.accentText, fontSize: 11, fontWeight: '700' },
  vsText: { fontSize: 28, fontWeight: '900', fontStyle: 'italic', color: colors.hard, letterSpacing: -1 },

  scrollContent: { paddingHorizontal: PAD, paddingBottom: space(4) },
  sectionLabel: { color: colors.textDim, fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: space(3) },

  // Members
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), padding: space(3), backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, marginBottom: space(2) },
  memberRowSel: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  memberName: { color: colors.text, fontWeight: '700', fontSize: 14 },
  memberSub: { color: colors.textDim, fontSize: 11, marginTop: 2 },

  emptyOpps: { paddingVertical: space(8), alignItems: 'center' },
  emptyOppsText: { color: colors.textDim, fontSize: 14 },

  // Match card
  matchCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: space(4), gap: space(3), ...shadow.sm },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  matchIconWrap: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.accentLight, borderWidth: 1, borderColor: colors.accent + '30', alignItems: 'center', justifyContent: 'center' },
  matchTitle: { color: colors.text, fontWeight: '700', fontSize: 13 },
  matchSub: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  diffPill: { paddingHorizontal: space(2), paddingVertical: 3, borderRadius: 6 },
  diffLabel: { fontSize: 11, fontWeight: '700' },
  matchRule: { flexDirection: 'row', alignItems: 'center', gap: space(2), backgroundColor: 'rgba(255,255,255,0.02)', borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: space(3) },
  matchRuleText: { color: colors.text, fontSize: 12, flex: 1 },

  // CTA
  ctaWrap: { paddingHorizontal: PAD, paddingTop: space(3), borderTopWidth: 1, borderTopColor: colors.border },
  challengeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space(2), backgroundColor: colors.hard, borderRadius: radius.lg, paddingVertical: space(4), shadowColor: colors.hard, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 5 },
  challengeBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  challengeHint: { color: colors.textLight, fontSize: 11, textAlign: 'center', marginTop: space(2) },
});
