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
import Svg, { Path } from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/stores/auth';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import { colors, pressed, radius, tabular, type } from '@/theme';

/**
 * "Join with a code" — the second action row in §3.4, restyled onto the §1
 * tokens. The invite-code box borrows the dashed accent treatment from the
 * invite sheet (§3.11).
 *
 * The "already in a group" wall is gone: multi-crew is supported (migration
 * 0023), so joining a second crew is legal.
 */

export default function JoinGroup() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = code.length === 6;

  const join = async () => {
    if (!session) return setError('You need an account before you can join a crew.');
    if (!ready || busy) return;
    setBusy(true);
    setError(null);

    const { data, error: err } = await supabase.rpc('join_group_by_code', {
      p_code: code.toUpperCase(),
    });
    if (err) {
      setBusy(false);
      return setError(err.message);
    }

    if (typeof data === 'string') {
      await supabase.rpc('set_active_group', { p_group_id: data });
    }
    setBusy(false);
    router.replace('/(tabs)/crew');
  };

  return (
    <View style={s.root}>
      <AmbientBackdrop />
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[s.flex, { paddingTop: insets.top + 6 }]}>
          <View style={s.header}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              style={({ pressed: p }) => [s.backBtn, p && pressed]}>
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
          </View>

          <ScrollView
            contentContainerStyle={s.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <Text style={s.title}>Join with a code</Text>
            <Text style={s.body}>Six characters from a friend.</Text>

            <View style={s.codeBox}>
              <TextInput
                style={s.codeInput}
                value={code}
                onChangeText={(t) => {
                  setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
                  setError(null);
                }}
                placeholder="GRND4K"
                placeholderTextColor="rgba(123,97,255,0.35)"
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                maxLength={6}
                returnKeyType="done"
                onSubmitEditing={join}
              />
            </View>
            <Text style={s.counter}>{code.length}/6</Text>

            {error ? <Text style={s.error}>{error}</Text> : null}
          </ScrollView>

          <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
            <Pressable
              onPress={join}
              disabled={!ready || busy}
              style={({ pressed: p }) => [
                s.pillBtn,
                ready ? s.pillBtnOn : s.pillBtnOff,
                p && ready && pressed,
              ]}>
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[type.buttonLabel, ready ? s.labelOn : s.labelOff]}>Join Crew</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: { paddingHorizontal: 22, paddingBottom: 18 },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.controlAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { paddingHorizontal: 22, paddingBottom: 24 },
  title: { ...type.onboardingTitle, color: colors.text },
  body: { ...type.body, color: colors.textSecondary, marginTop: 10 },

  codeBox: {
    marginTop: 28,
    borderRadius: radius.input,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(123,97,255,0.50)',
  },
  codeInput: {
    height: 88,
    textAlign: 'center',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 4,
    color: colors.accentText,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  counter: {
    ...type.caption,
    ...tabular,
    color: colors.textQuaternary,
    textAlign: 'right',
    marginTop: 8,
  },
  error: { ...type.bodySecondary, color: colors.hard, marginTop: 12 },

  footer: { paddingHorizontal: 22, paddingTop: 8 },
  pillBtn: { height: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  pillBtnOn: { backgroundColor: colors.accent },
  pillBtnOff: { backgroundColor: colors.controlAlt },
  labelOn: { color: '#FFFFFF' },
  labelOff: { color: 'rgba(235,235,245,0.4)' },
});
