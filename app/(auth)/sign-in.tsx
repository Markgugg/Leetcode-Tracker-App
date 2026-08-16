import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import { GlassCard } from '@/components/GlassCard';
import { Ring } from '@/components/Ring';
import { colors, duration, pressed, radius, ringSizes, type } from '@/theme';

/**
 * §3.1 Welcome — replaces the hero half of the old sign-in screen.
 *
 * The password wall now lives *after* the LeetCode import: "Get Started" goes
 * to step 1 of onboarding and only asks for credentials at the end.
 * "I already have an account" flips this screen into the sign-in form.
 */

type Mode = 'welcome' | 'signin';

export default function SignIn() {
  const [mode, setMode] = useState<Mode>('welcome');

  return (
    <View style={s.root}>
      <AmbientBackdrop />
      {mode === 'welcome' ? (
        <Welcome onSignIn={() => setMode('signin')} />
      ) : (
        <SignInForm onBack={() => setMode('welcome')} />
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Welcome                                                             */
/* ------------------------------------------------------------------ */

function Welcome({ onSignIn }: { onSignIn: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[s.welcomeRoot, { paddingTop: insets.top }]}>
      <Animated.View style={s.hero} entering={FadeInDown.duration(duration.fadeUp)}>
        {/* Decorative, static — 85% / 70% / 62% */}
        <Ring
          volume={{ value: 85, goal: 100 }}
          difficulty={{ value: 70, goal: 100 }}
          streak={{ value: 62, goal: 100 }}
          size={ringSizes.welcome}
          stagger={90}
        />

        <Text style={s.heroTitle}>Close your{'\n'}rings.</Text>
        <Text style={s.heroSub}>
          Volume, difficulty, consistency.{'\n'}Three rings, one habit, your crew watching.
        </Text>
      </Animated.View>

      <View style={[s.footer, { paddingBottom: insets.bottom + 40 }]}>
        <Pressable
          onPress={() => router.push('/onboarding')}
          style={({ pressed: p }) => [s.primaryBtn, p && pressed]}>
          <Text style={s.primaryLabel}>Get Started</Text>
        </Pressable>
        <Pressable onPress={onSignIn} style={({ pressed: p }) => [s.textBtn, p && pressed]}>
          <Text style={s.textBtnLabel}>I already have an account</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Sign in                                                             */
/* ------------------------------------------------------------------ */

function SignInForm({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = email.trim().length > 0 && password.length > 0;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    // No Alert.alert — §3.12: validation becomes inline state.
    if (err) setError(err.message);
  };

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[
          s.signInScroll,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Pressable onPress={onBack} style={({ pressed: p }) => [s.backBtn, p && pressed]} hitSlop={10}>
          <Svg width={16} height={16} viewBox="0 0 24 24">
            <Path
              d="M15 5l-7 7 7 7"
              stroke={colors.text}
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </Pressable>

        <Text style={s.signInTitle}>Welcome back</Text>
        <Text style={s.signInBody}>Your rings are where you left them.</Text>

        <GlassCard variant="small" radius={radius.input} padding={0} style={s.field}>
          <TextInput
            style={s.input}
            placeholder="you@email.com"
            placeholderTextColor={colors.textPlaceholder}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            value={email}
            onChangeText={(t) => { setEmail(t); setError(null); }}
            returnKeyType="next"
          />
        </GlassCard>

        <GlassCard variant="small" radius={radius.input} padding={0} style={s.field}>
          <TextInput
            style={s.input}
            placeholder="Password"
            placeholderTextColor={colors.textPlaceholder}
            secureTextEntry
            textContentType="password"
            value={password}
            onChangeText={(t) => { setPassword(t); setError(null); }}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
        </GlassCard>

        {error ? (
          <Animated.Text entering={FadeIn.duration(200)} style={s.error}>
            {error}
          </Animated.Text>
        ) : null}

        <View style={s.flex} />

        <Pressable
          onPress={submit}
          disabled={!ready || busy}
          style={({ pressed: p }) => [
            s.primaryBtn,
            !ready && s.primaryBtnDisabled,
            p && ready && pressed,
          ]}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[s.primaryLabel, !ready && s.primaryLabelDisabled]}>Sign in</Text>
          )}
        </Pressable>

        <Pressable onPress={onBack} style={({ pressed: p }) => [s.textBtn, p && pressed]}>
          <Text style={s.textBtnLabel}>New here? Start onboarding</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ------------------------------------------------------------------ */

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },

  /* Welcome */
  welcomeRoot: { flex: 1 },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 34,
  },
  heroTitle: {
    ...type.heroDisplay,
    color: colors.text,
    textAlign: 'center',
    marginTop: 44,
  },
  heroSub: {
    fontSize: 17,
    fontWeight: '400',
    lineHeight: 25.5,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 14,
  },
  footer: { paddingHorizontal: 22 },

  /* Buttons */
  primaryBtn: {
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(120,120,128,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: { backgroundColor: colors.controlAlt },
  primaryLabel: { ...type.buttonLabel, color: colors.accentText },
  primaryLabelDisabled: { color: 'rgba(235,235,245,0.4)' },
  textBtn: { height: 54, alignItems: 'center', justifyContent: 'center' },
  textBtnLabel: { fontSize: 16, fontWeight: '400', color: colors.accentText },

  /* Sign in */
  signInScroll: { flexGrow: 1, paddingHorizontal: 22 },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.controlAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
  },
  signInTitle: { ...type.onboardingTitle, color: colors.text },
  signInBody: { ...type.body, color: colors.textSecondary, marginTop: 10, marginBottom: 26 },
  field: { marginBottom: 12 },
  input: {
    minHeight: 60,
    paddingHorizontal: 18,
    paddingVertical: 18,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  error: { ...type.bodySecondary, color: colors.hard, marginTop: 2, marginBottom: 4 },
});
