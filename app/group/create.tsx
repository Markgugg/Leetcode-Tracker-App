import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/stores/auth';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import { GlassCard } from '@/components/GlassCard';
import { colors, duration, pressed, radius, type } from '@/theme';

/**
 * "Start a crew" — the destination of the first action row in §3.4, restyled
 * onto the §1 tokens.
 *
 * Two behaviour changes that follow from the redesign:
 *  - No "already in a group" wall. Multi-crew is supported now (migration 0023
 *    drops the single-group trigger), so creating a second crew is legal.
 *  - `weekly_quota` is not asked for. Progress runs on the *personal* ring goal
 *    set in onboarding; the column keeps its default and is vestigial.
 */

function makeCode() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => a[Math.floor(Math.random() * a.length)]).join('');
}

export default function CreateGroup() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  const [name, setName] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [createdName, setCreatedName] = useState('');

  const ready = name.trim().length >= 2;

  const create = async () => {
    if (!session) return setError('You need an account before you can start a crew.');
    if (!ready || busy) return;
    setBusy(true);
    setError(null);

    const invite = makeCode();
    const finalName = name.trim();

    const { data: group, error: groupErr } = await supabase
      .from('groups')
      .insert({ name: finalName, invite_code: invite, created_by: session.user.id })
      .select('id')
      .single();

    if (groupErr || !group) {
      setBusy(false);
      return setError(groupErr?.message ?? 'Could not create the crew.');
    }

    const { error: memberErr } = await supabase
      .from('group_members')
      .insert({ group_id: group.id, user_id: session.user.id, role: 'admin' });

    if (memberErr) {
      setBusy(false);
      return setError(memberErr.message);
    }

    // Discovery is best-effort: if migration 0024 has not been applied yet the
    // crew is simply not listed, rather than the whole create failing.
    if (isOpen) {
      await supabase.from('groups').update({ is_open: true }).eq('id', group.id);
    }
    await supabase.rpc('set_active_group', { p_group_id: group.id });

    setBusy(false);
    setCreatedName(finalName);
    setCode(invite);
  };

  /* ---- success ----------------------------------------------------- */

  if (code) {
    return (
      <View style={s.root}>
        <AmbientBackdrop />
        <Animated.View
          entering={FadeIn.duration(duration.fadeUp)}
          style={[s.successWrap, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
          <Text style={s.title}>Crew created</Text>
          <Text style={s.body}>Share this code. Everyone who joins shows up in your standings.</Text>

          <View style={s.codeBox}>
            <Text style={s.codeLabel}>INVITE CODE</Text>
            <Text style={s.code}>{code}</Text>
          </View>

          <View style={s.flex} />

          <Pressable
            onPress={() =>
              Share.share({ message: `Join my LeetAI crew "${createdName}" — invite code ${code}` })
            }
            style={({ pressed: p }) => [s.pillBtn, s.pillBtnOn, p && pressed]}>
            <Text style={[type.buttonLabel, s.labelOn]}>Share Invite Code</Text>
          </Pressable>
          <Pressable
            onPress={() => router.replace('/(tabs)/crew')}
            style={({ pressed: p }) => [s.textBtn, p && pressed]}>
            <Text style={s.textBtnLabel}>Done</Text>
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  /* ---- form -------------------------------------------------------- */

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
            <Text style={s.title}>Start a crew</Text>
            <Text style={s.body}>Invite up to 12 friends. Everyone keeps their own ring goals.</Text>

            <GlassCard variant="small" radius={radius.input} padding={0} style={s.field}>
              <TextInput
                style={s.input}
                value={name}
                onChangeText={(t) => {
                  setName(t);
                  setError(null);
                }}
                placeholder="Crew name"
                placeholderTextColor={colors.textPlaceholder}
                returnKeyType="done"
                onSubmitEditing={create}
              />
            </GlassCard>

            <GlassCard
              variant="small"
              radius={24}
              padding={18}
              style={s.field}
              onPress={() => setIsOpen((v) => !v)}>
              <View style={s.toggleRow}>
                <View style={s.flex}>
                  <Text style={s.toggleTitle}>Open crew</Text>
                  <Text style={s.toggleSub}>
                    Show up in "open crews near your level" so strangers can join.
                  </Text>
                </View>
                <View style={[s.checkbox, isOpen && s.checkboxOn]}>
                  {isOpen ? (
                    <Svg width={14} height={14} viewBox="0 0 24 24">
                      <Path
                        d="M5 12.5l4.5 4.5L19 7"
                        stroke="#0A1400"
                        strokeWidth={3.2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    </Svg>
                  ) : null}
                </View>
              </View>
            </GlassCard>

            {error ? <Text style={s.error}>{error}</Text> : null}
          </ScrollView>

          <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
            <Pressable
              onPress={create}
              disabled={!ready || busy}
              style={({ pressed: p }) => [
                s.pillBtn,
                ready ? s.pillBtnOn : s.pillBtnOff,
                p && ready && pressed,
              ]}>
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[type.buttonLabel, ready ? s.labelOn : s.labelOff]}>Create Crew</Text>
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
  field: { marginTop: 16 },
  input: {
    minHeight: 60,
    paddingHorizontal: 18,
    paddingVertical: 18,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  toggleTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
  toggleSub: { ...type.bodySecondary, color: colors.textSecondary, marginTop: 2 },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: colors.textTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.difficulty, borderColor: colors.difficulty },
  error: { ...type.bodySecondary, color: colors.hard, marginTop: 12 },

  footer: { paddingHorizontal: 22, paddingTop: 8 },
  pillBtn: { height: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  pillBtnOn: { backgroundColor: colors.accent },
  pillBtnOff: { backgroundColor: colors.controlAlt },
  labelOn: { color: '#FFFFFF' },
  labelOff: { color: 'rgba(235,235,245,0.4)' },
  textBtn: { height: 54, alignItems: 'center', justifyContent: 'center' },
  textBtnLabel: { fontSize: 16, fontWeight: '400', color: colors.accentText },

  successWrap: { flex: 1, paddingHorizontal: 22 },
  codeBox: {
    marginTop: 28,
    borderRadius: radius.input,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(123,97,255,0.50)',
    paddingVertical: 26,
    alignItems: 'center',
  },
  codeLabel: {
    ...type.microLabel,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  code: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 4,
    color: colors.accentText,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
