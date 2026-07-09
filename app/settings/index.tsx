import { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, Alert, ActivityIndicator,
  TextInput, Modal, KeyboardAvoidingView, Platform, Switch, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/stores/auth';
import { verifyLcUsername } from '@/lib/leetcode';
import { colors, radius, space, shadow } from '@/theme';
import type { Profile, NotificationPrefs } from '@/types/database';

const PAD = space(4);

// TODO: replace with hosted policy pages before App Store submission.
const PRIVACY_URL = 'https://github.com/Markgugg/Leetcode-Tracker-App/blob/main/PRIVACY.md';
const TERMS_URL = 'https://github.com/Markgugg/Leetcode-Tracker-App/blob/main/TERMS.md';
const SUPPORT_EMAIL = 'guggmark7@gmail.com';

const DEFAULT_PREFS: NotificationPrefs = {
  squad_solves: true,
  hard_only: false,
  streak_warnings: true,
  rank_changes: true,
};

type ModalKind = 'email' | 'password' | 'username' | 'leetcode' | 'delete' | null;

export default function Settings() {
  const { session, signOut } = useAuth();
  const uid = session?.user.id;
  const email = session?.user.email ?? '';
  const qc = useQueryClient();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [modal, setModal] = useState<ModalKind>(null);
  const [inputVal, setInputVal] = useState('');
  const [inputVal2, setInputVal2] = useState('');
  const [busy, setBusy] = useState(false);
  const [lcStatus, setLcStatus] = useState<'idle' | 'checking' | 'invalid'>('idle');

  const { data: profile } = useQuery({
    queryKey: ['profile', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', uid!).maybeSingle();
      return data as Profile | null;
    },
  });

  const prefs: NotificationPrefs = { ...DEFAULT_PREFS, ...(profile?.notification_prefs ?? {}) };

  const updateProfile = async (patch: Partial<Profile>) => {
    const { error } = await supabase.from('profiles').update(patch).eq('id', uid!);
    if (error) { Alert.alert('Error', error.message); return false; }
    await qc.invalidateQueries({ queryKey: ['profile', uid] });
    return true;
  };

  const setPref = (key: keyof NotificationPrefs, value: boolean) => {
    // Optimistic write — a toggle should never show a spinner.
    qc.setQueryData(['profile', uid], (p: Profile | null | undefined) =>
      p ? { ...p, notification_prefs: { ...prefs, [key]: value } } : p);
    supabase.from('profiles')
      .update({ notification_prefs: { ...prefs, [key]: value } })
      .eq('id', uid!)
      .then(({ error }) => {
        if (error) qc.invalidateQueries({ queryKey: ['profile', uid] });
      });
  };

  // ── Account actions (moved here from the old Me tab) ─────────────────────

  const changeUsername = async () => {
    const val = inputVal.trim().toLowerCase();
    if (!/^[a-z0-9_]{2,20}$/.test(val)) return Alert.alert('Invalid', 'Use 2–20 chars: letters, numbers, underscores.');
    setBusy(true);
    const { error } = await supabase.from('profiles').update({ username: val }).eq('id', uid!);
    setBusy(false);
    if (error) return Alert.alert('Error', error.message.includes('unique') ? 'Username taken.' : error.message);
    await qc.invalidateQueries({ queryKey: ['profile', uid] });
    setModal(null);
  };

  const changeEmail = async () => {
    const newEmail = inputVal.trim();
    if (!newEmail || !newEmail.includes('@')) return Alert.alert('Enter a valid email');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    setBusy(false);
    if (error) return Alert.alert('Error', error.message);
    setModal(null);
    Alert.alert('Confirm change', `Confirmation link sent to ${newEmail}. Check both inboxes.`);
  };

  const changePassword = async () => {
    if (inputVal.length < 6) return Alert.alert('Password must be at least 6 characters');
    if (inputVal !== inputVal2) return Alert.alert('Passwords do not match');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: inputVal });
    setBusy(false);
    if (error) return Alert.alert('Error', error.message);
    setModal(null);
    Alert.alert('Done', 'Password updated.');
  };

  const sendPasswordReset = async () => {
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setBusy(false);
    if (error) return Alert.alert('Error', error.message);
    Alert.alert('Email sent', `Password reset link sent to ${email}`);
  };

  const changeLeetCode = async () => {
    const val = inputVal.trim();
    if (!val) {
      // Empty input = disconnect
      if (await updateProfile({ leetcode_username: null } as Partial<Profile>)) setModal(null);
      return;
    }
    setLcStatus('checking');
    try {
      const valid = await verifyLcUsername(val);
      if (!valid) { setLcStatus('invalid'); return; }
    } catch {
      setLcStatus('idle');
      return Alert.alert('Could not verify', 'Check your connection and try again.');
    }
    setLcStatus('idle');
    if (await updateProfile({ leetcode_username: val } as Partial<Profile>)) {
      supabase.functions.invoke('leetcode-sync').catch(() => {});
      setModal(null);
    }
  };

  const confirmSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

  const deleteAccount = async () => {
    if (inputVal.trim().toLowerCase() !== (profile?.username ?? '').toLowerCase()) {
      return Alert.alert('Handle doesn\'t match', 'Type your exact handle to confirm deletion.');
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-account');
      if (error || data?.error) throw new Error(error?.message ?? data?.error);
      setModal(null);
      await signOut();
    } catch (e: any) {
      Alert.alert(
        'Could not delete account',
        e?.message ?? 'The deletion service is unreachable. Make sure the delete-account edge function is deployed.',
      );
    } finally {
      setBusy(false);
    }
  };

  const openModal = (kind: ModalKind, initial = '') => {
    setInputVal(initial);
    setInputVal2('');
    setLcStatus('idle');
    setModal(kind);
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.navRow}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={s.navTitle}>Settings</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + space(10) }}>

        {/* ── Account ─────────────────────────────── */}
        <Section label="ACCOUNT">
          <Row icon="mail-outline" label="Email" value={email} onPress={() => openModal('email')} />
          <Divider />
          <Row icon="at-outline" label="Username" value={profile?.username ?? '—'} onPress={() => openModal('username', profile?.username ?? '')} />
          <Divider />
          <Row icon="lock-closed-outline" label="Password" value="••••••••" onPress={() => openModal('password')} />
          <Divider />
          <Row
            icon="key-outline"
            label="Send password reset email"
            onPress={sendPasswordReset}
            trailing={busy && modal === null ? <ActivityIndicator size="small" color={colors.accent} /> : undefined}
          />
        </Section>

        {/* ── Connected accounts ──────────────────── */}
        <Section label="CONNECTED ACCOUNTS">
          <Row
            icon="code-slash-outline"
            label="LeetCode"
            value={profile?.leetcode_username ?? 'Not connected'}
            sub={profile?.leetcode_last_synced_at
              ? `Last synced ${new Date(profile.leetcode_last_synced_at).toLocaleDateString()}`
              : undefined}
            onPress={() => openModal('leetcode', profile?.leetcode_username ?? '')}
          />
        </Section>

        {/* ── Notifications ───────────────────────── */}
        <Section label="NOTIFICATIONS">
          <ToggleRow label="Squad solves" sub="When a squadmate solves a problem" value={prefs.squad_solves} onChange={v => setPref('squad_solves', v)} />
          <Divider />
          <ToggleRow label="Hard solves only" sub="Quiet mode: only notify for hards" value={prefs.hard_only} onChange={v => setPref('hard_only', v)} disabled={!prefs.squad_solves} />
          <Divider />
          <ToggleRow label="Streak warnings" sub="Sunday reminder if your goal is at risk" value={prefs.streak_warnings} onChange={v => setPref('streak_warnings', v)} />
          <Divider />
          <ToggleRow label="Rank changes" sub="When you rank up or lose the crown" value={prefs.rank_changes} onChange={v => setPref('rank_changes', v)} />
        </Section>

        {/* ── Appearance ──────────────────────────── */}
        <Section label="APPEARANCE">
          <ToggleRow
            label="Serious mode"
            sub={'Hides meme titles like "Cooked" — recruiter-safe'}
            value={!!profile?.serious_mode}
            onChange={v => {
              qc.setQueryData(['profile', uid], (p: Profile | null | undefined) => p ? { ...p, serious_mode: v } : p);
              supabase.from('profiles').update({ serious_mode: v }).eq('id', uid!).then(({ error }) => {
                if (error) qc.invalidateQueries({ queryKey: ['profile', uid] });
              });
            }}
          />
        </Section>

        {/* ── About ───────────────────────────────── */}
        <Section label="ABOUT">
          <Row icon="help-circle-outline" label="Help & feedback" onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Grind%20feedback`)} />
          <Divider />
          <Row icon="shield-checkmark-outline" label="Privacy policy" onPress={() => Linking.openURL(PRIVACY_URL)} />
          <Divider />
          <Row icon="document-text-outline" label="Terms of service" onPress={() => Linking.openURL(TERMS_URL)} />
        </Section>

        {/* ── Danger zone ─────────────────────────── */}
        <Section label=" ">
          <Row icon="log-out-outline" label="Sign out" labelColor={colors.hard} onPress={confirmSignOut} hideChevron />
          <Divider />
          <Row icon="trash-outline" label="Delete account…" labelColor={colors.hard} onPress={() => openModal('delete')} hideChevron />
        </Section>

      </ScrollView>

      {/* ── Modals ─────────────────────────────────── */}
      <Modal visible={modal !== null} transparent animationType="slide" onRequestClose={() => setModal(null)}>
        <Pressable style={s.modalOverlay} onPress={() => setModal(null)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalSheet}>
          <View style={s.modalHandle} />

          {modal === 'email' && (
            <>
              <Text style={s.modalTitle}>Change Email</Text>
              <Text style={s.modalLabel}>New email address</Text>
              <TextInput
                style={s.modalInput} placeholder="new@email.com" placeholderTextColor={colors.textLight}
                keyboardType="email-address" autoCapitalize="none" value={inputVal} onChangeText={setInputVal} autoFocus
              />
              <SubmitBtn busy={busy} label="Send confirmation" onPress={changeEmail} />
            </>
          )}

          {modal === 'username' && (
            <>
              <Text style={s.modalTitle}>Change Username</Text>
              <Text style={s.modalLabel}>New username</Text>
              <TextInput
                style={s.modalInput} placeholder="yourhandle" placeholderTextColor={colors.textLight}
                autoCapitalize="none" autoCorrect={false} value={inputVal} onChangeText={setInputVal} autoFocus
              />
              <Text style={s.modalHint}>2–20 chars · letters, numbers, underscores</Text>
              <SubmitBtn busy={busy} label="Save username" onPress={changeUsername} />
            </>
          )}

          {modal === 'password' && (
            <>
              <Text style={s.modalTitle}>Change Password</Text>
              <Text style={s.modalLabel}>New password</Text>
              <TextInput
                style={s.modalInput} placeholder="At least 6 characters" placeholderTextColor={colors.textLight}
                secureTextEntry value={inputVal} onChangeText={setInputVal} autoFocus
              />
              <Text style={s.modalLabel}>Confirm password</Text>
              <TextInput
                style={s.modalInput} placeholder="Repeat password" placeholderTextColor={colors.textLight}
                secureTextEntry value={inputVal2} onChangeText={setInputVal2}
              />
              <SubmitBtn busy={busy} label="Update password" onPress={changePassword} />
            </>
          )}

          {modal === 'leetcode' && (
            <>
              <Text style={s.modalTitle}>LeetCode Connection</Text>
              <Text style={s.modalLabel}>LeetCode username</Text>
              <TextInput
                style={[s.modalInput, lcStatus === 'invalid' && { borderColor: colors.hard }]}
                placeholder="your_lc_handle" placeholderTextColor={colors.textLight}
                autoCapitalize="none" autoCorrect={false}
                value={inputVal} onChangeText={v => { setInputVal(v); setLcStatus('idle'); }} autoFocus
              />
              {lcStatus === 'invalid' && <Text style={s.modalErr}>Username not found on LeetCode</Text>}
              <Text style={s.modalHint}>Leave empty to disconnect. Changing it re-syncs your history.</Text>
              <SubmitBtn
                busy={lcStatus === 'checking'}
                label={inputVal.trim() ? 'Verify & save' : 'Disconnect'}
                onPress={changeLeetCode}
                destructive={!inputVal.trim()}
              />
            </>
          )}

          {modal === 'delete' && (
            <>
              <Text style={s.modalTitle}>Delete account</Text>
              <Text style={s.modalBody}>
                This permanently deletes your profile, solves, streaks, squad memberships, and messages.
                There is no undo. Your LeetCode account is not affected.
              </Text>
              <Text style={s.modalLabel}>Type @{profile?.username ?? 'yourhandle'} to confirm</Text>
              <TextInput
                style={[s.modalInput, { borderColor: colors.hard + '60' }]}
                placeholder={profile?.username ?? ''} placeholderTextColor={colors.textLight}
                autoCapitalize="none" autoCorrect={false} value={inputVal} onChangeText={setInputVal} autoFocus
              />
              <SubmitBtn
                busy={busy}
                label="Permanently delete my account"
                onPress={deleteAccount}
                destructive
                disabled={inputVal.trim().toLowerCase() !== (profile?.username ?? '').toLowerCase()}
              />
            </>
          )}
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── List primitives ──────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>{label}</Text>
      <View style={s.sectionCard}>{children}</View>
    </View>
  );
}

function Divider() {
  return <View style={s.divider} />;
}

function Row({
  icon, label, value, sub, onPress, labelColor, hideChevron, trailing,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value?: string;
  sub?: string;
  onPress?: () => void;
  labelColor?: string;
  hideChevron?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <Pressable style={s.row} onPress={onPress} disabled={!onPress}>
      <Ionicons name={icon} size={17} color={labelColor ?? colors.textDim} />
      <View style={{ flex: 1 }}>
        <Text style={[s.rowLabel, labelColor ? { color: labelColor } : null]}>{label}</Text>
        {sub && <Text style={s.rowSub}>{sub}</Text>}
      </View>
      {value !== undefined && <Text style={s.rowValue} numberOfLines={1}>{value}</Text>}
      {trailing}
      {onPress && !hideChevron && <Ionicons name="chevron-forward" size={14} color={colors.textLight} />}
    </Pressable>
  );
}

function ToggleRow({
  label, sub, value, onChange, disabled,
}: {
  label: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={[s.row, disabled && { opacity: 0.45 }]}>
      <View style={{ flex: 1 }}>
        <Text style={s.rowLabel}>{label}</Text>
        {sub && <Text style={s.rowSub}>{sub}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: colors.border, true: colors.accent }}
        thumbColor="#fff"
      />
    </View>
  );
}

function SubmitBtn({
  busy, label, onPress, destructive, disabled,
}: {
  busy: boolean;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[
        s.modalSubmit,
        destructive && { backgroundColor: colors.hard },
        (busy || disabled) && { opacity: 0.5 },
      ]}
      onPress={onPress}
      disabled={busy || disabled}
    >
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.modalSubmitText}>{label}</Text>}
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  navRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: PAD, paddingVertical: space(2),
  },
  backBtn: { padding: space(2) },
  navTitle: { color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },

  section: { paddingHorizontal: PAD, marginTop: space(5) },
  sectionLabel: {
    color: colors.textDim, fontSize: 11, fontWeight: '700',
    letterSpacing: 0.8, marginBottom: space(2), textTransform: 'uppercase',
  },
  sectionCard: {
    backgroundColor: colors.card, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.sm,
  },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: space(4) },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: space(3),
    paddingHorizontal: space(4), paddingVertical: space(3.5),
    minHeight: 52,
  },
  rowLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
  rowSub: { color: colors.textLight, fontSize: 11, marginTop: 1 },
  rowValue: { color: colors.textDim, fontSize: 13, maxWidth: 150 },

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
  modalBody: { color: colors.textDim, fontSize: 13, lineHeight: 19, marginBottom: space(4), marginTop: -space(2) },
  modalLabel: {
    color: colors.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 0.5,
    textTransform: 'uppercase', marginBottom: space(2),
  },
  modalInput: {
    backgroundColor: colors.bg, borderRadius: radius.lg, padding: space(4),
    color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border,
    marginBottom: space(4),
  },
  modalHint: { color: colors.textLight, fontSize: 11, marginBottom: space(4), marginTop: -space(2) },
  modalErr: { color: colors.hard, fontSize: 11, marginBottom: space(3), marginTop: -space(2) },
  modalSubmit: {
    backgroundColor: colors.accent, borderRadius: radius.lg, padding: space(4),
    alignItems: 'center', marginTop: space(2),
  },
  modalSubmitText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
