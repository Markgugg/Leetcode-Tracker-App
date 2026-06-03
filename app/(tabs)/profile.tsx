import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert, ActivityIndicator, Dimensions, TextInput, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/stores/auth';
import { Avatar } from '@/components/Avatar';
import Svg, { Circle as SvgCircle, G, Text as SvgText } from 'react-native-svg';
import { colors, radius, space, shadow } from '@/theme';
import type { Streak, Profile } from '@/types/database';

const { width: SW } = Dimensions.get('window');
const PAD = space(4);

const TIERS = [
  { min: 0,   max: 10,  label: 'Homeless',             sub: 'bro doesnt even have a leetcode account',    color: '#DC2626', glow: 'rgba(220,38,38,0.15)'   },
  { min: 11,  max: 30,  label: 'Cooked',               sub: 'actually cooked. no debate',                 color: '#F85149', glow: 'rgba(248,81,73,0.15)'   },
  { min: 31,  max: 70,  label: 'Underwater Technician',sub: 'functioning but barely breathing',            color: '#FB923C', glow: 'rgba(251,146,60,0.15)'  },
  { min: 71,  max: 130, label: 'Fries in Bag',         sub: 'at least you showed up bro',                 color: '#F59E0B', glow: 'rgba(245,158,11,0.15)'  },
  { min: 131, max: 220, label: 'Chud',                 sub: 'mid but consistent. respect i guess',        color: '#84CC16', glow: 'rgba(132,204,22,0.15)'  },
  { min: 221, max: 350, label: 'Mtn Coder',            sub: 'grinding in the mountains no distractions',  color: '#22C55E', glow: 'rgba(34,197,94,0.15)'   },
  { min: 351, max: 500, label: 'Cracked',              sub: 'actually dangerous at this point',           color: '#06B6D4', glow: 'rgba(6,182,212,0.15)'   },
  { min: 501, max: 700, label: 'True CS Major',        sub: 'touched grass zero times this semester',     color: '#818CF8', glow: 'rgba(129,140,248,0.18)' },
  { min: 701, max: 950, label: 'FAANG Slayer',         sub: 'they are scared of you fr',                  color: '#C084FC', glow: 'rgba(192,132,252,0.18)' },
  { min: 951, max: Infinity, label: 'One Piece',       sub: 'the treasure was the algorithms all along',  color: '#EC4899', glow: 'rgba(236,72,153,0.22)'  },
] as const;

function getTier(solved: number) {
  return TIERS.find(t => solved >= t.min && solved <= t.max) ?? TIERS[0];
}

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const uid = session?.user.id;
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [expandedTier, setExpandedTier] = useState<number | null>(null);
  const [accountModal, setAccountModal] = useState<'email' | 'password' | 'username' | null>(null);
  const [inputVal, setInputVal] = useState('');
  const [inputVal2, setInputVal2] = useState('');
  const [accountBusy, setAccountBusy] = useState(false);

  const email = session?.user.email ?? '';

  const confirmSignOut = () => {
    Alert.alert(
      'Sign out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: signOut },
      ],
    );
  };

  const changeUsername = async () => {
    const val = inputVal.trim().toLowerCase();
    if (!/^[a-z0-9_]{2,20}$/.test(val)) return Alert.alert('Invalid', 'Use 2–20 chars: letters, numbers, underscores.');
    setAccountBusy(true);
    const { error } = await supabase.from('profiles').update({ username: val }).eq('id', uid!);
    setAccountBusy(false);
    if (error) return Alert.alert('Error', error.message.includes('unique') ? 'Username taken.' : error.message);
    await qc.invalidateQueries({ queryKey: ['profile', uid] });
    setAccountModal(null);
  };

  const sendPasswordReset = async () => {
    setAccountBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setAccountBusy(false);
    if (error) return Alert.alert('Error', error.message);
    Alert.alert('Email sent', `Password reset link sent to ${email}`);
  };

  const changeEmail = async () => {
    const newEmail = inputVal.trim();
    if (!newEmail || !newEmail.includes('@')) return Alert.alert('Enter a valid email');
    setAccountBusy(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    setAccountBusy(false);
    if (error) return Alert.alert('Error', error.message);
    setAccountModal(null);
    Alert.alert('Confirm change', `Confirmation link sent to ${newEmail}. Check both inboxes.`);
  };

  const changePassword = async () => {
    if (inputVal.length < 6) return Alert.alert('Password must be at least 6 characters');
    if (inputVal !== inputVal2) return Alert.alert('Passwords do not match');
    setAccountBusy(true);
    const { error } = await supabase.auth.updateUser({ password: inputVal });
    setAccountBusy(false);
    if (error) return Alert.alert('Error', error.message);
    setAccountModal(null);
    Alert.alert('Done', 'Password updated.');
  };

  const triggerSync = async () => {
    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke('leetcode-sync');
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['leaderboard'] });
      qc.invalidateQueries({ queryKey: ['alltime-stats'] });
      qc.invalidateQueries({ queryKey: ['week-stats'] });
      qc.invalidateQueries({ queryKey: ['insights'] });
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

  const { data: weekStats } = useQuery({
    queryKey: ['week-stats', uid],
    enabled: !!uid,
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - since.getDay() + 1);
      since.setHours(0, 0, 0, 0);
      const { data } = await supabase.from('solves').select('points').eq('user_id', uid!).gte('solved_at', since.toISOString());
      return { count: data?.length ?? 0, pts: data?.reduce((s, r) => s + r.points, 0) ?? 0 };
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

  const lcUsername = profile?.leetcode_username;
  const safeUsername = /^[a-zA-Z0-9_-]{1,40}$/.test(lcUsername ?? '') ? lcUsername : null;

  const { data: lcStats } = useQuery({
    queryKey: ['lc-stats', safeUsername],
    enabled: !!safeUsername,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const res = await fetch('https://leetcode.com/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Referer': `https://leetcode.com/${safeUsername}/`, 'User-Agent': 'Mozilla/5.0 Grind/0.1' },
        body: JSON.stringify({
          query: `query userStats($username: String!) { matchedUser(username: $username) { submitStatsGlobal { acSubmissionNum { difficulty count } } } }`,
          variables: { username: safeUsername },
        }),
      });
      if (!res.ok) return null;
      const json = await res.json();
      const nums: { difficulty: string; count: number }[] = json?.data?.matchedUser?.submitStatsGlobal?.acSubmissionNum ?? [];
      const get = (d: string) => nums.find(n => n.difficulty === d)?.count ?? 0;
      return { total: get('All'), easy: get('Easy'), medium: get('Medium'), hard: get('Hard') };
    },
  });

  const name = profile?.display_name ?? profile?.username ?? 'You';
  const displaySolved = lcStats?.total ?? allTimeStats?.count ?? 0;
  const tier = getTier(displaySolved);
  const tierIdx = TIERS.findIndex(t => t.label === tier.label);
  const nextTier = tierIdx < TIERS.length - 1 ? TIERS[tierIdx + 1] : null;
  const tierProgress = tier.max === Infinity ? 1 : (displaySolved - tier.min) / (tier.max - tier.min);
  const toNext = nextTier ? nextTier.min - displaySolved : 0;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space(20) }}>

        {/* ── Hero ─────────────────────────────────── */}
        <View style={[s.hero, { borderTopColor: tier.color + '80' }]}>
          <View style={[s.heroBg, { backgroundColor: tier.glow }]} />

          <Pressable onPress={pickAvatar} disabled={uploading} style={[s.avatarRing, { borderColor: tier.color }]}>
            <Avatar name={name} size={88} url={profile?.avatar_url} />
            <View style={[s.avatarEditBadge, { backgroundColor: tier.color }]}>
              {uploading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="camera" size={12} color="#fff" />
              }
            </View>
          </Pressable>

          <Text style={s.heroName}>{name}</Text>
          <Pressable onPress={() => { setInputVal(profile?.username ?? ''); setAccountModal('username'); }} style={s.heroUsernameRow}>
            <Text style={s.heroUsername}>@{profile?.username ?? '—'}</Text>
            <Ionicons name="pencil-outline" size={11} color="rgba(230,237,243,0.35)" />
          </Pressable>

          {safeUsername && (
            <View style={s.lcBadge}>
              <Ionicons name="code-slash" size={11} color={colors.accent} />
              <Text style={s.lcBadgeText}>{safeUsername}</Text>
            </View>
          )}

          {/* Tier pill */}
          <View style={[s.tierPill, { backgroundColor: tier.glow, borderColor: tier.color + '60' }]}>
            <View style={[s.tierPillDot, { backgroundColor: tier.color }]} />
            <Text style={[s.tierPillLabel, { color: tier.color }]}>{tier.label}</Text>
          </View>

          {/* Hero stats */}
          <View style={s.heroStats}>
            <HeroStat value={String(displaySolved)} label="Solved" />
            <View style={s.statDivider} />
            <HeroStat value={String(allTimeStats?.pts ?? 0)} label="Points" />
            <View style={s.statDivider} />
            <HeroStat value={String(streak?.current_days ?? 0)} label="Streak" suffix="🔥" />
          </View>
        </View>

        {/* ── Rank progress card ───────────────────── */}
        <View style={s.section}>
          <View style={[s.card, { borderColor: tier.color + '30' }]}>
            <View style={s.rankHeader}>
              <View>
                <Text style={s.cardLabel}>CURRENT RANK</Text>
                <Text style={[s.rankLabel, { color: tier.color }]}>{tier.label}</Text>
                <Text style={s.rankSub}>{tier.sub}</Text>
              </View>
              <View style={s.rankSolvedBox}>
                <Text style={[s.rankSolvedNum, { color: tier.color }]}>{displaySolved}</Text>
                <Text style={s.rankSolvedText}>solved</Text>
              </View>
            </View>

            {/* Progress bar */}
            <View style={s.progressWrap}>
              <View style={[s.progressTrack, { backgroundColor: colors.border }]}>
                <View style={[s.progressFill, { width: `${Math.round(tierProgress * 100)}%`, backgroundColor: tier.color }]} />
              </View>
              <View style={s.progressLabels}>
                <Text style={[s.progressMin, { color: tier.color + 'AA' }]}>{tier.min}</Text>
                {tier.max !== Infinity && <Text style={s.progressMax}>{tier.max}</Text>}
              </View>
            </View>

            {nextTier && toNext > 0 && (
              <View style={s.nextTierRow}>
                <Ionicons name="arrow-up-circle-outline" size={13} color={nextTier.color} />
                <Text style={s.nextTierText}>
                  <Text style={{ color: nextTier.color, fontWeight: '700' }}>{toNext}</Text> more to reach{' '}
                  <Text style={{ color: nextTier.color, fontWeight: '700' }}>{nextTier.label}</Text>
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ── LeetCode stats ───────────────────────── */}
        {lcStats && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>LEETCODE · {safeUsername}</Text>
            <View style={s.card}>
              <View style={s.lcTotalRow}>
                <View>
                  <Text style={s.lcTotalNum}>{lcStats.total}</Text>
                  <Text style={s.lcTotalSub}>problems solved</Text>
                </View>
                <View style={s.lcDiffPills}>
                  <DiffPill label="Easy" color={colors.easy} count={lcStats.easy} />
                  <DiffPill label="Med" color={colors.medium} count={lcStats.medium} />
                  <DiffPill label="Hard" color={colors.hard} count={lcStats.hard} />
                </View>
              </View>
              <View style={s.arcRow}>
                {([
                  { label: 'Easy',   color: colors.easy,   count: lcStats.easy,   target: 150 },
                  { label: 'Medium', color: colors.medium, count: lcStats.medium, target: 200 },
                  { label: 'Hard',   color: colors.hard,   count: lcStats.hard,   target: 75  },
                ] as const).map(({ label, color, count, target }) => (
                  <DiffArc key={label} label={label} color={color} count={count} target={target} />
                ))}
              </View>
            </View>
          </View>
        )}

        {/* ── Streaks ──────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>STREAKS</Text>
          <View style={s.row2}>
            <View style={[s.streakCard, { borderColor: 'rgba(249,115,22,0.25)', backgroundColor: 'rgba(249,115,22,0.07)' }]}>
              <Text style={s.streakIcon}>🔥</Text>
              <Text style={s.streakNum}>{streak?.current_days ?? 0}</Text>
              <Text style={s.streakLabel}>Day streak</Text>
              <Text style={s.streakBest}>Best {streak?.longest_days ?? 0}d</Text>
            </View>
            <View style={[s.streakCard, { borderColor: 'rgba(99,102,241,0.25)', backgroundColor: 'rgba(99,102,241,0.07)' }]}>
              <Text style={s.streakIcon}>📅</Text>
              <Text style={s.streakNum}>{streak?.current_weeks ?? 0}</Text>
              <Text style={s.streakLabel}>Week streak</Text>
              <Text style={s.streakBest}>Best {streak?.longest_weeks ?? 0}w</Text>
              {(streak?.freezes_available ?? 0) > 0 && (
                <View style={s.freezeBadge}>
                  <Text style={s.freezeText}>❄️ {streak!.freezes_available} freeze</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ── This week ────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>THIS WEEK</Text>
          <View style={s.row2}>
            <View style={s.weekCard}>
              <Ionicons name="checkmark-circle" size={22} color={colors.success} />
              <Text style={s.weekNum}>{weekStats?.count ?? 0}</Text>
              <Text style={s.weekLabel}>Problems</Text>
            </View>
            <View style={s.weekCard}>
              <Ionicons name="star" size={22} color="#D97706" />
              <Text style={[s.weekNum, { color: '#D97706' }]}>{weekStats?.pts ?? 0}</Text>
              <Text style={s.weekLabel}>Points</Text>
            </View>
          </View>
        </View>

        {/* ── Sync ─────────────────────────────────── */}
        {safeUsername && (
          <View style={s.section}>
            <Pressable style={[s.syncBtn, syncing && { opacity: 0.6 }]} onPress={triggerSync} disabled={syncing}>
              {syncing
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="sync" size={17} color="#fff" />
              }
              <Text style={s.syncBtnText}>{syncing ? 'Syncing LeetCode…' : 'Sync LeetCode Now'}</Text>
            </Pressable>
            {profile?.leetcode_last_synced_at && (
              <Text style={s.syncHint}>
                Last synced {new Date(profile.leetcode_last_synced_at).toLocaleDateString()}
              </Text>
            )}
          </View>
        )}

        {/* ── Tier list ─────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>RANK TIERS</Text>
          <View style={s.tierListCard}>
            {TIERS.map((t, i) => {
              const active = displaySolved >= t.min && displaySolved <= t.max;
              const expanded = expandedTier === i;
              const nextT = TIERS[i + 1];
              const toNextT = nextT ? nextT.min - displaySolved : 0;
              return (
                <Pressable
                  key={i}
                  onPress={() => setExpandedTier(expanded ? null : i)}
                  style={[s.tierRow, active && { backgroundColor: t.glow }, i < TIERS.length - 1 && s.tierRowBorder]}
                >
                  <View style={[s.tierDot, { backgroundColor: active ? t.color : colors.border }]} />
                  <View style={s.tierRowInfo}>
                    <Text style={[s.tierRowLabel, { color: active || expanded ? t.color : colors.textDim }]}>{t.label}</Text>
                    {(active || expanded) && (
                      <>
                        <Text style={[s.tierRowSub, { color: t.color + 'AA' }]}>{t.sub}</Text>
                        {active && nextT && toNextT > 0 && (
                          <Text style={s.tierRowNext}>{toNextT} more to {nextT.label}</Text>
                        )}
                      </>
                    )}
                  </View>
                  <Text style={[s.tierRowRange, (active || expanded) && { color: t.color }]}>
                    {t.max === Infinity ? `${t.min}+` : `${t.min}–${t.max}`}
                  </Text>
                  {active
                    ? <View style={[s.youTag, { backgroundColor: t.color }]}><Text style={s.youTagText}>you</Text></View>
                    : <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={12} color={colors.textLight} />
                  }
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── Account ──────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>ACCOUNT</Text>
          <View style={s.accountCard}>
            <View style={s.accountRow}>
              <Ionicons name="mail-outline" size={16} color={colors.textDim} />
              <View style={{ flex: 1 }}>
                <Text style={s.accountRowLabel}>Email</Text>
                <Text style={s.accountRowVal}>{email}</Text>
              </View>
              <Pressable onPress={() => { setInputVal(''); setAccountModal('email'); }} style={s.accountBtn}>
                <Text style={s.accountBtnText}>Change</Text>
              </Pressable>
            </View>
            <View style={s.accountDivider} />
            <View style={s.accountRow}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.textDim} />
              <View style={{ flex: 1 }}>
                <Text style={s.accountRowLabel}>Password</Text>
                <Text style={s.accountRowVal}>••••••••</Text>
              </View>
              <Pressable onPress={() => { setInputVal(''); setInputVal2(''); setAccountModal('password'); }} style={s.accountBtn}>
                <Text style={s.accountBtnText}>Change</Text>
              </Pressable>
            </View>
            <View style={s.accountDivider} />
            <Pressable style={s.accountRow} onPress={sendPasswordReset} disabled={accountBusy}>
              <Ionicons name="key-outline" size={16} color={colors.textDim} />
              <Text style={[s.accountRowLabel, { flex: 1 }]}>Send password reset email</Text>
              {accountBusy
                ? <ActivityIndicator size="small" color={colors.accent} />
                : <Ionicons name="chevron-forward" size={14} color={colors.textLight} />
              }
            </Pressable>
          </View>

          <Pressable style={s.signOutRow} onPress={confirmSignOut}>
            <Ionicons name="log-out-outline" size={18} color={colors.hard} />
            <Text style={s.signOutText}>Sign out</Text>
          </Pressable>
        </View>

      </ScrollView>

      {/* ── Account modal ─────────────────────────── */}
      <Modal visible={accountModal !== null} transparent animationType="slide" onRequestClose={() => setAccountModal(null)}>
        <Pressable style={s.modalOverlay} onPress={() => setAccountModal(null)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalSheet}>
          <View style={s.modalHandle} />
          <Text style={s.modalTitle}>
            {accountModal === 'email' ? 'Change Email' : accountModal === 'username' ? 'Change Username' : 'Change Password'}
          </Text>

          {accountModal === 'email' && (
            <>
              <Text style={s.modalLabel}>New email address</Text>
              <TextInput
                style={s.modalInput}
                placeholder="new@email.com"
                placeholderTextColor={colors.textLight}
                keyboardType="email-address"
                autoCapitalize="none"
                value={inputVal}
                onChangeText={setInputVal}
                autoFocus
              />
              <Pressable style={[s.modalSubmit, accountBusy && { opacity: 0.6 }]} onPress={changeEmail} disabled={accountBusy}>
                {accountBusy ? <ActivityIndicator color="#fff" /> : <Text style={s.modalSubmitText}>Send confirmation</Text>}
              </Pressable>
            </>
          )}

          {accountModal === 'password' && (
            <>
              <Text style={s.modalLabel}>New password</Text>
              <TextInput
                style={s.modalInput}
                placeholder="At least 6 characters"
                placeholderTextColor={colors.textLight}
                secureTextEntry
                value={inputVal}
                onChangeText={setInputVal}
                autoFocus
              />
              <Text style={s.modalLabel}>Confirm password</Text>
              <TextInput
                style={s.modalInput}
                placeholder="Repeat password"
                placeholderTextColor={colors.textLight}
                secureTextEntry
                value={inputVal2}
                onChangeText={setInputVal2}
              />
              <Pressable style={[s.modalSubmit, accountBusy && { opacity: 0.6 }]} onPress={changePassword} disabled={accountBusy}>
                {accountBusy ? <ActivityIndicator color="#fff" /> : <Text style={s.modalSubmitText}>Update password</Text>}
              </Pressable>
            </>
          )}

          {accountModal === 'username' && (
            <>
              <Text style={s.modalLabel}>New username</Text>
              <TextInput
                style={s.modalInput}
                placeholder="yourhandle"
                placeholderTextColor={colors.textLight}
                autoCapitalize="none"
                autoCorrect={false}
                value={inputVal}
                onChangeText={setInputVal}
                autoFocus
              />
              <Text style={{ color: colors.textLight, fontSize: 11, marginBottom: space(4), marginTop: -space(2) }}>
                2–20 chars · letters, numbers, underscores
              </Text>
              <Pressable style={[s.modalSubmit, accountBusy && { opacity: 0.6 }]} onPress={changeUsername} disabled={accountBusy}>
                {accountBusy ? <ActivityIndicator color="#fff" /> : <Text style={s.modalSubmitText}>Save username</Text>}
              </Pressable>
            </>
          )}
        </KeyboardAvoidingView>
      </Modal>
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

function DiffPill({ label, color, count }: { label: string; color: string; count: number }) {
  return (
    <View style={[s.diffPill, { backgroundColor: color + '18', borderColor: color + '40' }]}>
      <Text style={[s.diffPillCount, { color }]}>{count}</Text>
      <Text style={[s.diffPillLabel, { color: color + 'AA' }]}>{label}</Text>
    </View>
  );
}

function DiffArc({ label, color, count, target }: { label: string; color: string; count: number; target: number }) {
  const SIZE = 96;
  const cx = SIZE / 2, cy = SIZE / 2;
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(count / target, 1);
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Svg width={SIZE} height={SIZE}>
        <G rotation="-90" origin={`${cx},${cy}`}>
          <SvgCircle cx={cx} cy={cy} r={r} fill="none" stroke={colors.border} strokeWidth={6} />
          <SvgCircle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={6}
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
        </G>
        <SvgText x={cx} y={cy + 6} textAnchor="middle" fontSize={17} fontWeight="800" fill={color}>{count}</SvgText>
      </Svg>
      <Text style={{ color: colors.textLight, fontSize: 10, marginTop: 1 }}>/{target}</Text>
      <Text style={{ color, fontSize: 12, fontWeight: '700', marginTop: 2 }}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  // Hero
  hero: {
    paddingTop: space(8), paddingBottom: space(7), paddingHorizontal: space(6),
    alignItems: 'center', borderTopWidth: 3,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
    marginBottom: space(4), overflow: 'hidden',
  },
  heroBg: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.4,
  },
  avatarRing: {
    borderWidth: 2.5, borderRadius: 999, marginBottom: space(4), padding: 3,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 14,
  },
  avatarEditBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.bg,
  },
  heroName: { color: '#E6EDF3', fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  heroUsernameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2, marginBottom: space(2) },
  heroUsername: { color: 'rgba(230,237,243,0.5)', fontSize: 13 },
  lcBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(99,102,241,0.12)', borderRadius: 8,
    paddingHorizontal: space(3), paddingVertical: 4, marginBottom: space(4),
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.25)',
  },
  lcBadgeText: { color: '#A5B4FC', fontSize: 11, fontWeight: '700' },
  tierPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 10, borderWidth: 1,
    paddingHorizontal: space(4), paddingVertical: space(2),
    marginBottom: space(6),
  },
  tierPillDot: { width: 7, height: 7, borderRadius: 4 },
  tierPillLabel: { fontSize: 13, fontWeight: '800', letterSpacing: -0.2 },
  heroStats: {
    flexDirection: 'row', alignItems: 'center', width: '100%',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)',
    paddingTop: space(5),
  },
  heroStatItem: { flex: 1, alignItems: 'center' },
  heroStatNum: { color: '#E6EDF3', fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  heroStatLabel: { color: 'rgba(230,237,243,0.5)', fontSize: 11, marginTop: 3 },
  statDivider: { width: 1, height: 32, backgroundColor: 'rgba(230,237,243,0.12)' },

  // Cards / sections
  section: { paddingHorizontal: PAD, marginBottom: space(5) },
  sectionLabel: {
    color: colors.textDim, fontSize: 11, fontWeight: '700',
    letterSpacing: 0.8, marginBottom: space(3), textTransform: 'uppercase',
  },
  card: {
    backgroundColor: colors.card, borderRadius: radius.xl,
    padding: space(4), ...shadow.sm,
    borderWidth: 1, borderColor: colors.border,
    gap: space(3),
  },
  cardLabel: {
    color: colors.textDim, fontSize: 10, fontWeight: '700',
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: space(1),
  },

  // Rank card
  rankHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  rankLabel: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  rankSub: { color: colors.textDim, fontSize: 12, marginTop: 2, maxWidth: SW * 0.55 },
  rankSolvedBox: { alignItems: 'flex-end' },
  rankSolvedNum: { fontSize: 36, fontWeight: '900', letterSpacing: -1 },
  rankSolvedText: { color: colors.textLight, fontSize: 11, marginTop: -2 },
  progressWrap: { gap: space(1) },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  progressMin: { fontSize: 10, fontWeight: '600' },
  progressMax: { color: colors.textLight, fontSize: 10 },
  nextTierRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  nextTierText: { color: colors.textDim, fontSize: 12 },

  // LC stats
  lcTotalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lcTotalNum: { color: colors.text, fontSize: 44, fontWeight: '900', letterSpacing: -2, lineHeight: 50 },
  lcTotalSub: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  lcDiffPills: { gap: space(2) },
  diffPill: {
    flexDirection: 'row', alignItems: 'center', gap: space(2),
    paddingHorizontal: space(3), paddingVertical: space(1),
    borderRadius: radius.md, borderWidth: 1,
  },
  diffPillCount: { fontSize: 13, fontWeight: '800' },
  diffPillLabel: { fontSize: 11, fontWeight: '600' },
  arcRow: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: space(2) },

  // Streaks
  row2: { flexDirection: 'row', gap: space(3) },
  streakCard: {
    flex: 1, borderRadius: radius.xl, padding: space(4),
    alignItems: 'center', borderWidth: 1.5, ...shadow.sm,
  },
  streakIcon: { fontSize: 24, marginBottom: space(1) },
  streakNum: { color: colors.text, fontSize: 34, fontWeight: '900', lineHeight: 40 },
  streakLabel: { color: colors.textDim, fontSize: 12, fontWeight: '600', marginTop: 2 },
  streakBest: { color: colors.textLight, fontSize: 11, marginTop: space(1) },
  freezeBadge: {
    marginTop: space(2), backgroundColor: colors.accentLight,
    paddingHorizontal: space(2), paddingVertical: 3, borderRadius: radius.md,
  },
  freezeText: { color: colors.accent, fontSize: 11, fontWeight: '700' },

  // Week cards
  weekCard: {
    flex: 1, backgroundColor: colors.card, borderRadius: radius.xl,
    padding: space(4), alignItems: 'center', gap: space(1), ...shadow.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  weekNum: { color: colors.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  weekLabel: { color: colors.textDim, fontSize: 12, fontWeight: '600' },

  // Sync
  syncBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: space(2), backgroundColor: colors.accent, borderRadius: radius.xl,
    paddingVertical: space(4),
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  syncBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  syncHint: { color: colors.textLight, fontSize: 11, textAlign: 'center', marginTop: space(2) },

  // Tier list
  tierListCard: {
    backgroundColor: colors.card, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  tierRow: {
    flexDirection: 'row', alignItems: 'center', gap: space(3),
    paddingHorizontal: space(4), paddingVertical: space(3),
  },
  tierRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  tierDot: { width: 8, height: 8, borderRadius: 4 },
  tierRowInfo: { flex: 1 },
  tierRowLabel: { fontSize: 13, fontWeight: '700' },
  tierRowSub: { fontSize: 11, marginTop: 1 },
  tierRowNext: { fontSize: 10, color: colors.textLight, marginTop: 2 },
  tierRowRange: { color: colors.textLight, fontSize: 11, fontWeight: '600' },
  youTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, marginLeft: space(2) },
  youTagText: { color: '#000', fontSize: 10, fontWeight: '800' },

  // Account
  accountCard: {
    backgroundColor: colors.card, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.sm,
  },
  accountRow: {
    flexDirection: 'row', alignItems: 'center', gap: space(3),
    paddingHorizontal: space(4), paddingVertical: space(4),
  },
  accountDivider: { height: 1, backgroundColor: colors.border, marginHorizontal: space(4) },
  accountRowLabel: { color: colors.textDim, fontSize: 11, fontWeight: '600', marginBottom: 2 },
  accountRowVal: { color: colors.text, fontSize: 14, fontWeight: '500' },
  signOutRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: space(2), marginTop: space(3), paddingVertical: space(4),
    backgroundColor: 'rgba(248,81,73,0.08)', borderRadius: radius.xl,
    borderWidth: 1, borderColor: 'rgba(248,81,73,0.2)',
  },
  signOutText: { color: colors.hard, fontSize: 15, fontWeight: '700' },
  accountBtn: {
    backgroundColor: colors.accentLight, borderRadius: radius.md,
    paddingHorizontal: space(3), paddingVertical: space(1),
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.25)',
  },
  accountBtnText: { color: colors.accent, fontSize: 12, fontWeight: '700' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: space(6), paddingBottom: space(10), ...shadow.md,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: space(5),
  },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: space(5) },
  modalLabel: {
    color: colors.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 0.5,
    textTransform: 'uppercase', marginBottom: space(2),
  },
  modalInput: {
    backgroundColor: colors.bg, borderRadius: radius.lg, padding: space(4),
    color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border,
    marginBottom: space(4),
  },
  modalSubmit: {
    backgroundColor: colors.accent, borderRadius: radius.lg, padding: space(4),
    alignItems: 'center', marginTop: space(2),
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  modalSubmitText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
