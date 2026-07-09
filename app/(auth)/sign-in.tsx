import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, Alert, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { colors, radius, space, shadow } from '@/theme';

// Native module — unavailable in Expo Go; the button simply doesn't render there.
let AppleAuthentication: typeof import('expo-apple-authentication') | null = null;
try {
  AppleAuthentication = require('expo-apple-authentication');
} catch {}

export default function SignIn() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'in' | 'up'>(params.mode === 'up' ? 'up' : 'in');
  const [busy, setBusy] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS !== 'ios' || !AppleAuthentication) return;
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);

  // Route to onboarding or the app depending on whether a profile row exists.
  const routeAfterAuth = async (userId: string) => {
    const { data } = await supabase
      .from('profiles').select('id').eq('id', userId).maybeSingle();
    router.replace(data ? '/today' : '/onboarding');
  };

  const submit = async () => {
    if (!email || !password) return Alert.alert('Fill in both fields');
    setBusy(true);
    const fn = mode === 'in' ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { data, error } = await fn.call(supabase.auth, { email, password });
    setBusy(false);
    if (error) return Alert.alert('Error', error.message);
    if (data.session?.user) await routeAfterAuth(data.session.user.id);
  };

  const signInWithApple = async () => {
    if (!AppleAuthentication) return;
    setAppleBusy(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('No identity token returned');
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) throw error;
      if (data.session?.user) await routeAfterAuth(data.session.user.id);
    } catch (e: any) {
      // User-cancelled sheets should fail silently.
      if (e?.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Apple Sign-In failed', e?.message ?? 'Try again or use email.');
      }
    } finally {
      setAppleBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" />

      {/* Hero */}
      <View style={[s.hero, { paddingTop: insets.top + space(6) }]}>
        <View style={s.logoMark}>
          <Text style={s.logoLetter}>G</Text>
        </View>
        <Text style={s.appName}>Grind</Text>
        <Text style={s.tagline}>Lock in with your crew.</Text>
      </View>

      {/* Sheet */}
      <View style={[s.sheet, { paddingBottom: insets.bottom + space(6) }]}>
        <Text style={s.sheetTitle}>
          {mode === 'in' ? 'Welcome back' : 'Create your account'}
        </Text>

        {appleAvailable && (
          <>
            <Pressable style={s.appleBtn} onPress={signInWithApple} disabled={appleBusy}>
              {appleBusy
                ? <ActivityIndicator color="#000" size="small" />
                : <>
                    <Ionicons name="logo-apple" size={19} color="#000" />
                    <Text style={s.appleBtnText}>
                      {mode === 'in' ? 'Sign in with Apple' : 'Sign up with Apple'}
                    </Text>
                  </>
              }
            </Pressable>
            <View style={s.orRow}>
              <View style={s.orLine} />
              <Text style={s.orText}>or use email</Text>
              <View style={s.orLine} />
            </View>
          </>
        )}

        <Text style={s.label}>Email</Text>
        <TextInput
          style={s.input}
          placeholder="you@email.com"
          placeholderTextColor={colors.textLight}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          returnKeyType="next"
        />

        <Text style={s.label}>Password</Text>
        <View style={s.pwWrap}>
          <TextInput
            style={s.pwInput}
            placeholder="••••••••"
            placeholderTextColor={colors.textLight}
            secureTextEntry={!showPw}
            value={password}
            onChangeText={setPassword}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          <Pressable onPress={() => setShowPw(v => !v)} style={s.pwToggle}>
            <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textDim} />
          </Pressable>
        </View>

        <Pressable style={[s.btn, busy && s.btnBusy]} onPress={submit} disabled={busy}>
          {busy
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.btnText}>{mode === 'in' ? 'Sign in' : 'Create account'}</Text>
          }
        </Pressable>

        <Pressable onPress={() => setMode(mode === 'in' ? 'up' : 'in')} style={s.toggle}>
          <Text style={s.toggleText}>
            {mode === 'in' ? 'No account? ' : 'Already have an account? '}
            <Text style={s.toggleLink}>{mode === 'in' ? 'Sign up' : 'Sign in'}</Text>
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hero: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: space(6),
  },
  logoMark: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: space(4),
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  logoLetter: { color: '#fff', fontSize: 32, fontWeight: '900' },
  appName: {
    color: colors.text, fontSize: 40, fontWeight: '900',
    letterSpacing: -1.5, marginBottom: space(2),
  },
  tagline: { color: colors.textDim, fontSize: 15 },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: space(6), paddingTop: space(7),
    ...shadow.md,
  },
  sheetTitle: {
    color: colors.text, fontSize: 22, fontWeight: '800',
    marginBottom: space(5), letterSpacing: -0.3,
  },

  appleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space(2),
    backgroundColor: '#fff', borderRadius: radius.lg, minHeight: 50,
  },
  appleBtnText: { color: '#000', fontWeight: '700', fontSize: 16 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), marginVertical: space(4) },
  orLine: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: { color: colors.textLight, fontSize: 12, fontWeight: '600' },

  label: {
    color: colors.textDim, fontSize: 12, fontWeight: '700',
    letterSpacing: 0.5, marginBottom: space(2), textTransform: 'uppercase',
  },
  input: {
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    padding: space(4),
    color: colors.text,
    fontSize: 16,
    marginBottom: space(5),
    borderWidth: 1,
    borderColor: colors.border,
  },
  pwWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.bg, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: space(5),
  },
  pwInput: {
    flex: 1, padding: space(4), color: colors.text, fontSize: 16,
  },
  pwToggle: { paddingHorizontal: space(3) },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    padding: space(4),
    alignItems: 'center',
    marginTop: space(2),
    minHeight: 52,
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  btnBusy: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  toggle: { alignItems: 'center', marginTop: space(5) },
  toggleText: { color: colors.textDim, fontSize: 14 },
  toggleLink: { color: colors.accent, fontWeight: '700' },
});
