import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, Alert, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/stores/auth';
import { colors, radius, space, shadow } from '@/theme';

type LcStatus = 'idle' | 'checking' | 'valid' | 'invalid';

const LC_VERIFY_QUERY = `query verifyUser($username: String!) {
  matchedUser(username: $username) { username }
}`;

async function verifyLcUsername(username: string): Promise<boolean> {
  const res = await fetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Referer': `https://leetcode.com/${username}/`,
      'User-Agent': 'Mozilla/5.0 Grind/0.1',
    },
    body: JSON.stringify({ query: LC_VERIFY_QUERY, variables: { username } }),
  });
  if (!res.ok) throw new Error('LC unreachable');
  const json = await res.json();
  return json?.data?.matchedUser != null;
}

export default function Onboarding() {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [lcUsername, setLcUsername] = useState('');
  const [lcStatus, setLcStatus] = useState<LcStatus>('idle');
  const [busy, setBusy] = useState(false);
  const { session } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const checkLc = async () => {
    const trimmed = lcUsername.trim();
    if (!trimmed) return;
    setLcStatus('checking');
    try {
      const valid = await verifyLcUsername(trimmed);
      setLcStatus(valid ? 'valid' : 'invalid');
    } catch {
      setLcStatus('idle');
      Alert.alert('Could not verify', 'Check your connection and try again.');
    }
  };

  const save = async () => {
    if (!session) return;
    if (!username.trim()) return Alert.alert('Pick a username', 'You need a username to continue.');
    if (!/^[a-z0-9_]{2,20}$/.test(username.trim().toLowerCase())) {
      return Alert.alert('Invalid username', 'Use 2–20 characters: letters, numbers, underscores only.');
    }
    if (!lcUsername.trim()) return Alert.alert('LeetCode username required', 'Enter your LeetCode handle to enable auto-sync.');
    if (lcStatus !== 'valid') {
      return Alert.alert('Verify LeetCode', 'Tap "Verify" to confirm your LeetCode username first.');
    }
    setBusy(true);
    const { error } = await supabase.from('profiles').upsert({
      id: session.user.id,
      username: username.trim().toLowerCase(),
      display_name: displayName.trim() || null,
      leetcode_username: lcUsername.trim(),
    });
    setBusy(false);
    if (error) return Alert.alert('Could not save', error.message);
    router.replace('/feed');
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />
      <Pressable onPress={() => router.replace('/sign-in')} style={s.backBtn}>
        <Ionicons name="arrow-back" size={22} color={colors.textDim} />
      </Pressable>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + space(10) }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={s.header}>
            <View style={s.logoMark}>
              <Text style={s.logoLetter}>G</Text>
            </View>
            <Text style={s.h1}>Set up your profile</Text>
            <Text style={s.sub}>This is what your friends will see.</Text>
          </View>

          {/* Form */}
          <View style={s.form}>
            <View style={s.field}>
              <Text style={s.label}>Username <Text style={s.req}>*</Text></Text>
              <TextInput
                style={s.input}
                placeholder="yourhandle"
                placeholderTextColor={colors.textLight}
                autoCapitalize="none"
                autoCorrect={false}
                value={username}
                onChangeText={setUsername}
                returnKeyType="next"
              />
            </View>

            <View style={s.field}>
              <Text style={s.label}>Display name</Text>
              <TextInput
                style={s.input}
                placeholder="Mark G  (optional)"
                placeholderTextColor={colors.textLight}
                value={displayName}
                onChangeText={setDisplayName}
                returnKeyType="next"
              />
            </View>

            <View style={s.field}>
              <Text style={s.label}>LeetCode username <Text style={s.req}>*</Text></Text>
              <Text style={s.hint}>Used to auto-sync your solved problems</Text>
              <View style={s.lcRow}>
                <TextInput
                  style={[
                    s.input, s.lcInput,
                    lcStatus === 'valid' && { borderColor: colors.easy },
                    lcStatus === 'invalid' && { borderColor: colors.hard },
                  ]}
                  placeholder="your_lc_handle"
                  placeholderTextColor={colors.textLight}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={lcUsername}
                  onChangeText={v => { setLcUsername(v); setLcStatus('idle'); }}
                  returnKeyType="done"
                  onSubmitEditing={checkLc}
                />
                <Pressable
                  style={[
                    s.verifyBtn,
                    lcStatus === 'valid' && { backgroundColor: colors.easy },
                    (lcStatus === 'checking' || !lcUsername.trim()) && { opacity: 0.5 },
                  ]}
                  onPress={checkLc}
                  disabled={lcStatus === 'checking' || !lcUsername.trim()}
                >
                  {lcStatus === 'checking'
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.verifyText}>
                        {lcStatus === 'valid' ? '✓ Done' : lcStatus === 'invalid' ? '✗ Retry' : 'Verify'}
                      </Text>
                  }
                </Pressable>
              </View>
              {lcStatus === 'invalid' && (
                <Text style={s.lcError}>Username not found on LeetCode</Text>
              )}
            </View>

            <Pressable style={[s.btn, busy && { opacity: 0.6 }]} onPress={save} disabled={busy}>
              {busy
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.btnText}>Let's grind →</Text>
              }
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  backBtn: { padding: space(4), alignSelf: 'flex-start' },
  scroll: { paddingHorizontal: space(6) },
  header: { alignItems: 'center', paddingTop: space(10), paddingBottom: space(8) },
  logoMark: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: space(5),
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
  logoLetter: { color: '#fff', fontSize: 28, fontWeight: '900' },
  h1: {
    color: colors.text, fontSize: 28, fontWeight: '800',
    letterSpacing: -0.5, marginBottom: space(2), textAlign: 'center',
  },
  sub: { color: colors.textDim, fontSize: 14, textAlign: 'center' },
  form: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: space(5),
    ...shadow.sm,
  },
  field: { marginBottom: space(4) },
  label: {
    color: colors.textDim, fontSize: 11, fontWeight: '700',
    letterSpacing: 0.6, marginBottom: space(2), textTransform: 'uppercase',
  },
  req: { color: colors.hard },
  hint: { color: colors.textLight, fontSize: 11, marginBottom: space(2) },
  input: {
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    padding: space(4),
    color: colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lcRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  lcInput: { flex: 1 },
  verifyBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingHorizontal: space(4),
    height: 48,
    minWidth: 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  lcError: { color: colors.hard, fontSize: 11, marginTop: space(1) },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    padding: space(4),
    alignItems: 'center',
    marginTop: space(3),
    minHeight: 52,
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
