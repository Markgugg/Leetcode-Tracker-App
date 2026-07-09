import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/stores/auth';
import { useOnboarding } from '@/stores/onboarding';
import { OnboardingStep } from '@/components/OnboardingStep';
import { Avatar } from '@/components/Avatar';
import { colors, radius, space } from '@/theme';

const USERNAME_RE = /^[a-z0-9_]{2,20}$/;

type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

/** Onboarding step 1 of 4 — claim a handle. */
export default function ClaimHandle() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const ob = useOnboarding();
  const [username, setUsername] = useState(ob.username);
  const [displayName, setDisplayName] = useState(ob.displayName);
  const [availability, setAvailability] = useState<Availability>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Entering the flow suspends the root layout's auto-redirects.
  useEffect(() => {
    ob.set({ active: true });
  }, []);

  const checkAvailability = (raw: string) => {
    const val = raw.trim().toLowerCase();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val) { setAvailability('idle'); return; }
    if (!USERNAME_RE.test(val)) { setAvailability('invalid'); return; }
    setAvailability('checking');
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles').select('id').eq('username', val).maybeSingle();
      // Taken by someone else — our own row can't exist yet during onboarding.
      setAvailability(data && data.id !== session?.user.id ? 'taken' : 'available');
    }, 400);
  };

  const canContinue = availability === 'available';

  const next = () => {
    if (!canContinue) return;
    ob.set({ username: username.trim().toLowerCase(), displayName: displayName.trim() });
    router.push('/link-leetcode');
  };

  const backToSignIn = async () => {
    ob.reset();
    await signOut();
    router.replace('/welcome');
  };

  return (
    <OnboardingStep
      step={1}
      title="Claim your handle"
      subtitle="This is how your squad sees you."
      onBack={backToSignIn}
    >
      <View style={s.inputWrap}>
        <Text style={s.at}>@</Text>
        <TextInput
          style={s.input}
          placeholder="yourhandle"
          placeholderTextColor={colors.textLight}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          value={username}
          onChangeText={v => { setUsername(v); checkAvailability(v); }}
          returnKeyType="next"
        />
        {availability === 'checking' && <ActivityIndicator size="small" color={colors.accent} />}
        {availability === 'available' && <Ionicons name="checkmark-circle" size={20} color={colors.easy} />}
        {availability === 'taken' && <Ionicons name="close-circle" size={20} color={colors.hard} />}
      </View>
      {availability === 'taken' && <Text style={s.err}>That handle is taken.</Text>}
      {availability === 'invalid' && <Text style={s.err}>2–20 characters: lowercase letters, numbers, underscores.</Text>}

      <View style={[s.inputWrap, { marginTop: space(3) }]}>
        <TextInput
          style={s.input}
          placeholder="Display name (optional)"
          placeholderTextColor={colors.textLight}
          value={displayName}
          onChangeText={setDisplayName}
          returnKeyType="done"
          onSubmitEditing={next}
        />
      </View>

      {/* Live preview */}
      <View style={s.preview}>
        <Avatar name={displayName.trim() || username.trim() || '?'} size={36} />
        <View style={{ flex: 1 }}>
          <Text style={s.previewName}>{displayName.trim() || username.trim() || 'Your name'}</Text>
          <Text style={s.previewHandle}>@{username.trim().toLowerCase() || 'yourhandle'} · Bronze</Text>
        </View>
        <View style={s.previewTag}><Text style={s.previewTagText}>preview</Text></View>
      </View>

      <View style={{ flex: 1 }} />
      <Pressable style={[s.cta, !canContinue && s.ctaDisabled]} onPress={next} disabled={!canContinue}>
        <Text style={s.ctaText}>Continue</Text>
      </Pressable>
    </OnboardingStep>
  );
}

const s = StyleSheet.create({
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: space(2),
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: space(4),
  },
  at: { color: colors.textDim, fontSize: 16, fontWeight: '600' },
  input: { flex: 1, paddingVertical: space(4), color: colors.text, fontSize: 16 },
  err: { color: colors.hard, fontSize: 12, marginTop: space(2) },

  preview: {
    flexDirection: 'row', alignItems: 'center', gap: space(3),
    backgroundColor: colors.card, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border,
    padding: space(4), marginTop: space(5),
  },
  previewName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  previewHandle: { color: colors.textDim, fontSize: 12, marginTop: 1 },
  previewTag: {
    backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  previewTagText: { color: colors.textDim, fontSize: 10, fontWeight: '700' },

  cta: {
    backgroundColor: colors.accent, borderRadius: radius.lg, padding: space(4),
    alignItems: 'center', minHeight: 52, justifyContent: 'center',
  },
  ctaDisabled: { opacity: 0.45 },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
