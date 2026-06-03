import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/Avatar';
import { colors, radius, space, shadow } from '@/theme';
import { useAuth } from '@/stores/auth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

function mmss(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function StatCompare({
  label, mine, theirs, win,
}: { label: string; mine: string; theirs: string; win: boolean }) {
  return (
    <View style={s.statRow}>
      <Text style={[s.statVal, win && { color: colors.success }]}>{mine}</Text>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statVal, s.statValRight]}>{theirs}</Text>
    </View>
  );
}

export default function BattleVictory() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const params = useLocalSearchParams<{
    won: string;
    myTests: string;
    oppTests: string;
    totalTests: string;
    elapsed: string;
    oppName: string;
  }>();

  const won = params.won === 'true';
  const myTests = parseInt(params.myTests ?? '0', 10);
  const oppTests = parseInt(params.oppTests ?? '0', 10);
  const elapsed = parseInt(params.elapsed ?? '0', 10);
  const oppName = params.oppName ?? 'Opponent';

  const { data: myProfile } = useQuery({
    queryKey: ['my-profile-battle', session?.user.id],
    enabled: !!session?.user.id,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('username, display_name').eq('id', session!.user.id).maybeSingle();
      return data;
    },
  });

  const myName = myProfile?.display_name ?? myProfile?.username ?? 'You';

  const heroColor = won ? colors.success : colors.hard;
  const eloChange = won ? `+${12 + Math.floor(Math.random() * 15)}` : `-${8 + Math.floor(Math.random() * 10)}`;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space(20) }}>

        {/* Close */}
        <View style={s.topBar}>
          <View style={{ width: 34 }} />
          <View style={{ flex: 1 }} />
          <Pressable style={s.closeBtn} onPress={() => router.push('/(tabs)/group')} hitSlop={12}>
            <Ionicons name="close" size={16} color={colors.textDim} />
          </Pressable>
        </View>

        {/* ── Hero ────────────────────────────────── */}
        <View style={s.heroSection}>
          <View style={[s.heroIcon, { backgroundColor: heroColor + '18', borderColor: heroColor + '40' }]}>
            <Ionicons
              name={won ? 'trophy' : 'sad-outline'}
              size={32} color={heroColor}
            />
          </View>
          <Text style={[s.heroTitle, { color: heroColor }]}>
            {won ? 'Victory' : 'Defeat'}
          </Text>
          <Text style={s.heroSub}>
            {won
              ? `You out-coded ${oppName} by ${mmss(Math.abs(elapsed - Math.round(elapsed * 1.2)))} seconds.`
              : `${oppName} edged you this time. Rematch?`
            }
          </Text>
        </View>

        {/* ── Avatars ──────────────────────────────── */}
        <View style={s.avatarRow}>
          <View style={s.avatarPlayer}>
            <View style={[s.avatarRing, { borderColor: heroColor, opacity: won ? 1 : 0.6 }]}>
              <Avatar name={myName} size={60} />
            </View>
            <Text style={s.avatarName}>{myName}</Text>
            <Text style={[s.avatarElo, { color: won ? colors.success : colors.hard }]}>{eloChange} ELO</Text>
          </View>

          <Text style={s.defText}>{won ? 'def.' : 'lost to'}</Text>

          <View style={[s.avatarPlayer, { opacity: won ? 0.55 : 1 }]}>
            <View style={[s.avatarRing, { borderColor: won ? colors.textLight : colors.success }]}>
              <Avatar name={oppName} size={60} />
            </View>
            <Text style={s.avatarName}>{oppName}</Text>
            <Text style={[s.avatarElo, { color: won ? colors.hard : colors.success }]}>
              {won ? eloChange.replace('+', '-') : eloChange.replace('-', '+')} ELO
            </Text>
          </View>
        </View>

        {/* ── Stat compare ─────────────────────────── */}
        <View style={[s.card, s.section]}>
          <View style={s.statHeader}>
            <Text style={s.statHeaderName}>{myName}</Text>
            <View style={{ flex: 1 }} />
            <Text style={s.statHeaderName}>{oppName}</Text>
          </View>
          <StatCompare label="tests passed" mine={`${myTests}/${params.totalTests}`} theirs={`${oppTests}/${params.totalTests}`} win={myTests >= oppTests} />
          <StatCompare label="time" mine={mmss(elapsed)} theirs={mmss(Math.round(elapsed * (won ? 1.15 : 0.87)))} win={won} />
          <View style={[s.statRow, { borderBottomWidth: 0 }]}>
            <Text style={[s.statVal, won && { color: colors.success }]}>{won ? 'W' : 'L'}</Text>
            <Text style={s.statLabel}>result</Text>
            <Text style={[s.statVal, s.statValRight, !won && { color: colors.success }]}>{won ? 'L' : 'W'}</Text>
          </View>
        </View>

        {/* ── Rank move ────────────────────────────── */}
        {won && (
          <View style={[s.rankCard, s.section]}>
            <View style={s.rankChange}>
              <Text style={s.rankBefore}>#4</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.accentText} />
              <Text style={s.rankAfter}>#2</Text>
            </View>
            <Text style={s.rankText}>
              Jumped <Text style={{ color: colors.text, fontWeight: '700' }}>2 spots</Text> in clan standings this week.
            </Text>
          </View>
        )}

        {/* ── CTAs ─────────────────────────────────── */}
        <View style={[s.ctaRow, s.section]}>
          <Pressable style={s.ctaSecondary} onPress={() => router.push('/(tabs)/group')}>
            <Text style={s.ctaSecondaryText}>Back to clan</Text>
          </Pressable>
          <Pressable
            style={s.ctaPrimary}
            onPress={() => router.replace('/battle/lobby')}
          >
            <Ionicons name="flash" size={15} color="#fff" />
            <Text style={s.ctaPrimaryText}>Rematch</Text>
          </Pressable>
        </View>

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PAD = space(4);

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: PAD, paddingBottom: space(2) },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },

  // Hero
  heroSection: { alignItems: 'center', paddingHorizontal: PAD, paddingBottom: space(5) },
  heroIcon: { width: 72, height: 72, borderRadius: 36, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: space(4) },
  heroTitle: { fontSize: 42, fontWeight: '900', letterSpacing: -1.5, lineHeight: 48 },
  heroSub: { color: colors.textDim, fontSize: 13, textAlign: 'center', marginTop: space(2), lineHeight: 18, paddingHorizontal: space(4) },

  // Avatars
  avatarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space(4), paddingHorizontal: PAD, marginBottom: space(5) },
  avatarPlayer: { flex: 1, alignItems: 'center', gap: space(2) },
  avatarRing: { borderWidth: 2.5, borderRadius: 999, padding: 3 },
  avatarName: { color: colors.text, fontWeight: '800', fontSize: 13 },
  avatarElo: { fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'] },
  defText: { color: colors.textLight, fontSize: 13, fontWeight: '700', fontStyle: 'italic' },

  // Stats
  section: { paddingHorizontal: PAD, marginBottom: space(4) },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: space(4), ...shadow.sm },
  statHeader: { flexDirection: 'row', marginBottom: space(2) },
  statHeaderName: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  statRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space(3), borderBottomWidth: 1, borderBottomColor: colors.border },
  statVal: { width: 72, color: colors.text, fontWeight: '800', fontSize: 14, fontVariant: ['tabular-nums'] },
  statValRight: { textAlign: 'right' },
  statLabel: { flex: 1, textAlign: 'center', color: colors.textDim, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Rank card
  rankCard: { flexDirection: 'row', alignItems: 'center', gap: space(4), backgroundColor: colors.accentLight, borderWidth: 1, borderColor: colors.accent + '50', borderRadius: radius.xl, padding: space(4) },
  rankChange: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  rankBefore: { color: colors.textDim, fontWeight: '900', fontSize: 18, fontVariant: ['tabular-nums'] },
  rankAfter: { color: colors.accentText, fontWeight: '900', fontSize: 22, fontVariant: ['tabular-nums'] },
  rankText: { flex: 1, color: colors.textDim, fontSize: 12, lineHeight: 17 },

  // CTAs
  ctaRow: { flexDirection: 'row', gap: space(3) },
  ctaSecondary: { flex: 1, paddingVertical: space(4), borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center' },
  ctaSecondaryText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  ctaPrimary: { flex: 1.4, paddingVertical: space(4), borderRadius: radius.lg, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space(2), shadowColor: colors.accent, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 5 },
  ctaPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
