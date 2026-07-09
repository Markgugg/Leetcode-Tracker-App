import { useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, StyleSheet, SafeAreaView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/stores/auth';
import { colors, radius, space, shadow } from '@/theme';

export default function JoinGroup() {
  // Deep link support: grind://group/join?code=ABC123 prefills the code.
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState((params.code ?? '').toUpperCase().slice(0, 6));
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';

  const { data: existingGroup, isLoading: checkingGroup } = useQuery({
    queryKey: ['my-group-check', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('group_members')
        .select('group_id, groups(name)')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();
      return data as { group_id: string; groups: { name: string } | null } | null;
    },
  });

  const join = async () => {
    if (code.length < 6) return Alert.alert('Enter the full 6-character code');
    setBusy(true);
    const { error } = await supabase.rpc('join_group_by_code', { p_code: code.toUpperCase() });
    setBusy(false);
    if (error) return Alert.alert('Could not join', error.message);
    router.replace('/(tabs)/group');
  };

  if (checkingGroup) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={[s.container, { alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (existingGroup) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={[s.container, { alignItems: 'center', justifyContent: 'center' }]}>
          <Pressable onPress={() => router.back()} style={[s.backBtn, { position: 'absolute', top: space(4), left: space(4) }]} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
          <Ionicons name="people" size={48} color={colors.accent} style={{ marginBottom: space(4) }} />
          <Text style={s.h1}>Already in a group</Text>
          <Text style={[s.sub, { textAlign: 'center' }]}>Leave "{existingGroup.groups?.name}" first to join a different one.</Text>
          <Pressable style={s.btn} onPress={() => router.replace('/(tabs)/group')}>
            <Text style={s.btnText}>Go to my group</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.container}>
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>

          <Text style={s.h1}>Join a group</Text>
          <Text style={s.sub}>Enter the 6-character invite code your friend shared.</Text>

          <View style={s.codeWrap}>
            <TextInput
              style={s.input}
              placeholder="ABC123"
              placeholderTextColor={colors.textLight}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              returnKeyType="done"
              onSubmitEditing={join}
            />
            {code.length > 0 && (
              <Text style={s.charCount}>{code.length}/6</Text>
            )}
          </View>

          <Pressable
            style={[s.btn, (busy || code.length < 6) && s.btnDisabled]}
            onPress={join}
            disabled={busy || code.length < 6}
          >
            {busy
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.btnText}>Join group</Text>
            }
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg, padding: space(6), paddingTop: space(8) },
  backBtn: { marginBottom: space(4), alignSelf: 'flex-start', padding: space(2) },
  h1: { color: colors.text, fontSize: 32, fontWeight: '800', marginBottom: space(2) },
  sub: { color: colors.textDim, fontSize: 15, marginBottom: space(8) },
  codeWrap: { position: 'relative' },
  input: {
    backgroundColor: colors.card, color: colors.text, fontSize: 32, letterSpacing: 10,
    textAlign: 'center', borderRadius: radius.lg, padding: space(5),
    borderWidth: 1, borderColor: colors.border, marginBottom: space(2), ...shadow.sm,
  },
  charCount: { color: colors.textLight, fontSize: 12, textAlign: 'right', marginBottom: space(4) },
  btn: {
    backgroundColor: colors.accent, borderRadius: radius.lg, padding: space(4),
    alignItems: 'center', minHeight: 52, justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
