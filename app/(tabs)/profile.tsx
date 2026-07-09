import { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/stores/auth';
import { Avatar } from '@/components/Avatar';
import { GemBadge } from '@/ranks/GemBadge';
import { GemChip } from '@/ranks/GemChip';
import { rankForSolves, progressToNext, nextRank } from '@/ranks/ranks-data';
import { getTitle } from '@/ranks/titles';
import { useLcStats, safeLcUsername } from '@/lib/leetcode';
import { weekStartISO } from '@/lib/time';
import { colors, radius, space, shadow } from '@/theme';
import type { Streak, Profile } from '@/types/database';

const PAD = space(4);

export default function YouScreen() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const qc = useQueryClient();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ['profile', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', uid!).maybeSingle();
      return data as Profile | null;
    },
  });

  const { data: streak } = useQuery({
    queryKey: ['streak', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase.from('streaks').select('*').eq('user_id', uid!).maybeSingle();
      return data as Streak | null;
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

  const { data: weekStats } = useQuery({
    queryKey: ['week-stats', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase
        .from('solves').select('points, solved_at')
        .eq('user_id', uid!)
        .gte('solved_at', weekStartISO());
      const today = new Date().toDateString();
      return {
        count: data?.length ?? 0,
        pts: data?.reduce((s, r) => s + r.points, 0) ?? 0,
        todayCount: data?.filter(r => new Date(r.solved_at).toDateString() === today).length ?? 0,
      };
    },
  });

  const lcUsername = safeLcUsername(profile?.leetcode_username);
  const { data: lcStats } = useLcStats(lcUsername);

  const triggerSync = async () => {
    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke('leetcode-sync');
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['alltime-stats'] });
      qc.invalidateQueries({ queryKey: ['week-stats'] });
      qc.invalidateQueries({ queryKey: ['insights'] });
      qc.invalidateQueries({ queryKey: ['squad-position'] });
    } catch (e: any) {
      Alert.alert('Sync failed', e?.message ?? 'Could not reach sync service. Make sure the edge function is deployed.');
    } finally {
      setSyncing(false);
    }
  };

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to change your profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
    const path = `${uid}/${Date.now()}.${ext}`;
    setUploading(true);
    try {
      const arraybuffer = await fetch(asset.uri).then(r => r.arrayBuffer());
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, arraybuffer, { upsert: true, contentType: mime });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      // append timestamp to bust RN image cache
      const bustUrl = `${publicUrl}?t=${Date.now()}`;
      const { error: dbErr } = await supabase
        .from('profiles')
        .update({ avatar_url: bustUrl })
        .eq('id', uid!);
      if (dbErr) throw dbErr;
      await qc.invalidateQueries({ queryKey: ['profile', uid] });
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Unknown error');
    } finally {
      setUploading(false);
    }
  };

  const name = profile?.display_name ?? profile?.username ?? 'You';
  const displaySolved = lcStats?.total ?? allTimeStats?.count ?? 0;
  const title = getTitle(displaySolved);

  const gemRank = rankForSolves(displaySolved);
  const gemNext = nextRank(gemRank.key);
  const gemPct = progressToNext(displaySolved, gemRank.key);

  const lastSynced = profile?.leetcode_last_synced_at
    ? new Date(profile.leetcode_last_synced_at).toLocaleDateString()
    : null;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space(20) }}>

        {/* ── Nav row ──────────────────────────────── */}
        <View style={s.navRow}>
          <Text style={s.h1}>You</Text>
          <Pressable style={s.gearBtn} onPress={() => router.push('/settings')} hitSlop={8}>
            <Ionicons name="settings-outline" size={20} color={colors.textDim} />
          </Pressable>
        </View>

        {/* ── Hero ─────────────────────────────────── */}
        <View style={s.section}>
          <View style={[s.heroCard, { borderColor: gemRank.glow + '35' }]}>
            <Pressable onPress={pickAvatar} disabled={uploading} style={[s.avatarRing, { borderColor: gemRank.glow }]}>
              <Avatar name={name} size={80} url={profile?.avatar_url} />
              <View style={[s.avatarEditBadge, { backgroundColor: colors.accent }]}>
                {uploading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="camera" size={12} color="#fff" />
                }
              </View>
            </Pressable>

            <Text style={s.heroName}>{name}</Text>
            <Text style={s.heroUsername}>
              @{profile?.username ?? '—'}
              {!profile?.serious_mode && <Text style={s.heroTitle}> · {title.label}</Text>}
            </Text>

            <View style={[s.rankPill, { backgroundColor: gemRank.glow + '18', borderColor: gemRank.glow + '60' }]}>
              <GemChip tier={gemRank} size={18} />
              <Text style={[s.rankPillLabel, { color: gemRank.glow }]}>{gemRank.name}</Text>
            </View>

            <View style={s.heroStats}>
              <HeroStat value={String(displaySolved)} label="Solved" />
              <View style={s.statDivider} />
              <HeroStat value={String(streak?.current_days ?? 0)} label="Day streak" suffix="🔥" />
              <View style={s.statDivider} />
              <HeroStat value={String(allTimeStats?.pts ?? 0)} label="Points" />
            </View>
          </View>
        </View>

        {/* ── Gem rank progress ─────────────────────── */}
        <View style={s.section}>
          <Pressable
            style={[s.card, { borderColor: gemRank.glow + '30', alignItems: 'center', paddingVertical: space(5) }]}
            onPress={() => router.push('/rank')}
          >
            <View style={{ shadowColor: gemRank.glow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 8 }}>
              <GemBadge tier={gemRank} size={140} />
            </View>
            <Text style={[s.rankLabel, { color: gemRank.glow, marginTop: space(2) }]}>{gemRank.name}</Text>
            <Text style={s.rankSub}>{displaySolved} solved</Text>

            {gemNext && (
              <View style={[s.gemProgressCard, { borderColor: gemRank.glow + '25' }]}>
                <View style={s.gemProgressRow}>
                  <GemChip tier={gemRank} size={32} />
                  <View style={s.gemProgressTrack}>
                    <View style={[s.gemProgressFill, {
                      width: `${Math.round(gemPct * 100)}%`,
                      backgroundColor: gemRank.glow,
                    }]} />
                  </View>
                  <GemChip tier={gemNext} size={32} />
                </View>
                <Text style={s.gemProgressLabel}>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>{gemNext.thr - displaySolved}</Text>
                  {' solves to '}
                  <Text style={{ color: gemNext.glow, fontWeight: '700' }}>{gemNext.name}</Text>
                </Text>
              </View>
            )}
            <Text style={s.ladderLink}>View the full ladder ›</Text>
          </Pressable>
        </View>

        {/* ── This week ─────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>THIS WEEK</Text>
          <View style={s.row2}>
            <View style={s.weekCard}>
              <Ionicons name="checkmark-circle" size={22} color={colors.success} />
              <Text style={s.weekNum}>{weekStats?.count ?? 0}<Text style={s.weekGoal}>/{profile?.weekly_goal ?? 5}</Text></Text>
              <Text style={s.weekLabel}>Goal</Text>
            </View>
            <View style={s.weekCard}>
              <Ionicons name="star" size={22} color="#D97706" />
              <Text style={[s.weekNum, { color: '#D97706' }]}>{weekStats?.pts ?? 0}</Text>
              <Text style={s.weekLabel}>Points</Text>
            </View>
            <View style={s.weekCard}>
              <Text style={{ fontSize: 20 }}>📅</Text>
              <Text style={[s.weekNum, { color: '#818CF8' }]}>{streak?.current_weeks ?? 0}</Text>
              <Text style={s.weekLabel}>Wk streak</Text>
            </View>
          </View>
        </View>

        {/* ── Connections & drill-ins ───────────────── */}
        <View style={s.section}>
          <View style={s.listCard}>
            <Pressable style={s.listRow} onPress={() => router.push('/rank')}>
              <View style={[s.listIcon, { backgroundColor: gemRank.glow + '18' }]}>
                <Ionicons name="diamond-outline" size={15} color={gemRank.glow} />
              </View>
              <Text style={s.listLabel}>Rank ladder</Text>
              <Text style={s.listValue}>{gemRank.name}</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textLight} />
            </Pressable>
            <View style={s.listDivider} />
            <View style={s.listRow}>
              <View style={[s.listIcon, { backgroundColor: colors.easy + '18' }]}>
                <Ionicons name="code-slash" size={15} color={colors.easy} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.listLabel}>LeetCode{lcUsername ? ` · ${lcUsername}` : ''}</Text>
                {lastSynced && <Text style={s.listSub}>Last synced {lastSynced}</Text>}
              </View>
              {lcUsername ? (
                <Pressable style={s.syncBtn} onPress={triggerSync} disabled={syncing}>
                  {syncing
                    ? <ActivityIndicator size="small" color={colors.accent} />
                    : <Text style={s.syncBtnText}>Sync now</Text>
                  }
                </Pressable>
              ) : (
                <Pressable style={s.syncBtn} onPress={() => router.push('/settings')}>
                  <Text style={s.syncBtnText}>Connect</Text>
                </Pressable>
              )}
            </View>
            <View style={s.listDivider} />
            <Pressable style={s.listRow} onPress={() => router.push('/settings')}>
              <View style={[s.listIcon, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                <Ionicons name="settings-outline" size={15} color={colors.textDim} />
              </View>
              <Text style={s.listLabel}>Settings</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textLight} />
            </Pressable>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HeroStat({ value, label, suffix }: { value: string; label: string; suffix?: string }) {
  return (
    <View style={s.heroStatItem}>
      <Text style={s.heroStatNum}>{value}{suffix}</Text>
      <Text style={s.heroStatLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  navRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: PAD, paddingTop: space(4), paddingBottom: space(3),
  },
  h1: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  gearBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },

  section: { paddingHorizontal: PAD, marginBottom: space(4) },
  sectionLabel: {
    color: colors.textDim, fontSize: 11, fontWeight: '700',
    letterSpacing: 0.8, marginBottom: space(3), textTransform: 'uppercase',
  },

  heroCard: {
    backgroundColor: colors.card, borderRadius: radius.xl,
    borderWidth: 1, alignItems: 'center',
    paddingVertical: space(6), paddingHorizontal: space(4), ...shadow.sm,
  },
  avatarRing: {
    borderWidth: 2.5, borderRadius: 999, marginBottom: space(3), padding: 3,
  },
  avatarEditBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.card,
  },
  heroName: { color: colors.text, fontSize: 21, fontWeight: '800', letterSpacing: -0.3 },
  heroUsername: { color: colors.textDim, fontSize: 13, marginTop: 2, marginBottom: space(3) },
  heroTitle: { color: colors.textLight },
  rankPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 10, borderWidth: 1,
    paddingHorizontal: space(4), paddingVertical: space(2),
    marginBottom: space(5),
  },
  rankPillLabel: { fontSize: 13, fontWeight: '800', letterSpacing: -0.2 },
  heroStats: {
    flexDirection: 'row', alignItems: 'center', width: '100%',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)',
    paddingTop: space(4),
  },
  heroStatItem: { flex: 1, alignItems: 'center' },
  heroStatNum: { color: colors.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  heroStatLabel: { color: colors.textDim, fontSize: 11, marginTop: 3 },
  statDivider: { width: 1, height: 30, backgroundColor: 'rgba(230,237,243,0.12)' },

  card: {
    backgroundColor: colors.card, borderRadius: radius.xl,
    padding: space(4), ...shadow.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  rankLabel: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  rankSub: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  gemProgressCard: {
    width: '100%', marginTop: space(4),
    backgroundColor: colors.bg, borderWidth: 1, borderRadius: radius.lg,
    padding: space(3), gap: space(2),
  },
  gemProgressRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  gemProgressTrack: { flex: 1, height: 7, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' },
  gemProgressFill: { height: 7, borderRadius: 4 },
  gemProgressLabel: { color: colors.textDim, fontSize: 12, textAlign: 'center' },
  ladderLink: { color: colors.accentText, fontSize: 12, fontWeight: '700', marginTop: space(3) },

  row2: { flexDirection: 'row', gap: space(3) },
  weekCard: {
    flex: 1, backgroundColor: colors.card, borderRadius: radius.xl,
    padding: space(4), alignItems: 'center', gap: space(1), ...shadow.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  weekNum: { color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  weekGoal: { color: colors.textDim, fontSize: 15, fontWeight: '600' },
  weekLabel: { color: colors.textDim, fontSize: 12, fontWeight: '600' },

  listCard: {
    backgroundColor: colors.card, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.sm,
  },
  listRow: {
    flexDirection: 'row', alignItems: 'center', gap: space(3),
    paddingHorizontal: space(4), paddingVertical: space(4),
  },
  listIcon: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  listLabel: { color: colors.text, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  listSub: { color: colors.textLight, fontSize: 11, marginTop: 1 },
  listValue: { color: colors.textDim, fontSize: 13, marginLeft: 'auto' },
  listDivider: { height: 1, backgroundColor: colors.border, marginHorizontal: space(4) },
  syncBtn: {
    backgroundColor: colors.accentLight, borderRadius: radius.md,
    paddingHorizontal: space(3), paddingVertical: space(2),
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.25)',
    minWidth: 76, alignItems: 'center',
  },
  syncBtnText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
});
