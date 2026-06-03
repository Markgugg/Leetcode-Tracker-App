import { useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, StyleSheet, Share, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/stores/auth';
import { colors, radius, space, shadow } from '@/theme';

function makeCode() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => a[Math.floor(Math.random() * a.length)]).join('');
}


export default function CreateGroup() {
  const [name, setName] = useState('');
  const [quota, setQuota] = useState('5');
  const [code, setCode] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [busy, setBusy] = useState(false);
  const { session } = useAuth();
  const router = useRouter();
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

  const create = async () => {
    if (!session) return Alert.alert('Not signed in');
    setBusy(true);
    const invite = makeCode();
    const finalName = name.trim() || 'Untitled crew';
    const { data: group, error } = await supabase
      .from('groups')
      .insert({
        name: finalName,
        invite_code: invite,
        weekly_quota: Math.max(1, parseInt(quota) || 5),
        created_by: session.user.id,
      })
      .select('id')
      .single();
    if (error) {
      setBusy(false);
      return Alert.alert('Could not create group', error.message);
    }
    const { error: memberError } = await supabase.from('group_members').insert({
      group_id: group.id,
      user_id: session.user.id,
      role: 'admin',
    });
    setBusy(false);
    if (memberError) return Alert.alert('Created but could not join', memberError.message);
    setGroupName(finalName);
    setCode(invite);
  };

  if (checkingGroup) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={s.center}><ActivityIndicator color={colors.accent} /></View>
      </SafeAreaView>
    );
  }

  if (existingGroup) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={s.center}>
          <Pressable onPress={() => router.back()} style={s.backBtnAbs} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
          <View style={s.alreadyIcon}>
            <Ionicons name="people" size={32} color={colors.accent} />
          </View>
          <Text style={s.alreadyTitle}>Already in a group</Text>
          <Text style={s.alreadySub}>You're in "{existingGroup.groups?.name}". Leave it first to create a new one.</Text>
          <Pressable style={s.btn} onPress={() => router.replace('/(tabs)/group')}>
            <Text style={s.btnText}>Go to my group</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (code) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={s.successWrap}>
          <View style={s.successIcon}>
            <Ionicons name="checkmark-circle" size={36} color={colors.accent} />
          </View>
          <Text style={s.h1}>Group created!</Text>
          <Text style={s.sub}>Share this code with your crew.</Text>
          <View style={s.codeCard}>
            <Text style={s.codeLabel}>INVITE CODE</Text>
            <Text style={s.code}>{code}</Text>
          </View>
          <Pressable
            style={s.btn}
            onPress={() => Share.share({ message: `Join my Grind crew "${groupName}"! Invite code: ${code}` })}
          >
            <Ionicons name="share-outline" size={18} color="#fff" />
            <Text style={s.btnText}>Share invite code</Text>
          </Pressable>
          <Pressable style={s.skip} onPress={() => router.replace('/(tabs)/group')}>
            <Text style={s.skipText}>Done</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.formContainer} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={s.h1}>New group</Text>
          <Text style={s.fieldLabel}>Group name</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. 'NEU FAANG prep'"
            placeholderTextColor={colors.textDim}
            value={name}
            onChangeText={setName}
            returnKeyType="next"
          />
          <Text style={s.fieldLabel}>Weekly goal</Text>
          <Text style={s.fieldHint}>Problems each member should solve per week</Text>
          <TextInput
            style={s.input}
            keyboardType="number-pad"
            value={quota}
            onChangeText={setQuota}
            placeholderTextColor={colors.textDim}
          />
          <Pressable style={[s.btn, busy && { opacity: 0.6 }]} onPress={create} disabled={busy}>
            {busy
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.btnText}>Create group</Text>
            }
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(8) },
  formContainer: { padding: space(6), paddingTop: space(4), flexGrow: 1 },

  backBtn: { marginBottom: space(5), alignSelf: 'flex-start', padding: space(2) },
  backBtnAbs: { position: 'absolute', top: space(4), left: space(4), padding: space(2) },

  alreadyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accentLight, alignItems: 'center', justifyContent: 'center', marginBottom: space(4) },
  alreadyTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: space(2) },
  alreadySub: { color: colors.textDim, fontSize: 14, textAlign: 'center', marginBottom: space(6), lineHeight: 20 },

  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(8) },
  successIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.accentLight, alignItems: 'center', justifyContent: 'center', marginBottom: space(5) },

  h1: { color: colors.text, fontSize: 28, fontWeight: '800', marginBottom: space(2), textAlign: 'center' },
  sub: { color: colors.textDim, fontSize: 15, marginBottom: space(6), textAlign: 'center' },

  codeCard: {
    backgroundColor: colors.card, borderRadius: radius.xl, padding: space(6),
    alignItems: 'center', marginBottom: space(6), width: '100%', ...shadow.sm,
    borderWidth: 2, borderColor: colors.accent + '30',
  },
  codeLabel: { color: colors.textLight, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: space(1) },
  code: { color: colors.accent, fontSize: 38, fontWeight: '900', letterSpacing: 10 },

  fieldLabel: { color: colors.text, fontWeight: '700', fontSize: 14, marginBottom: space(1), marginTop: space(4) },
  fieldHint: { color: colors.textDim, fontSize: 12, marginBottom: space(2) },
  input: {
    backgroundColor: colors.card, color: colors.text, borderRadius: radius.md, padding: space(4),
    borderWidth: 1, borderColor: colors.border, fontSize: 16,
  },
  btn: {
    backgroundColor: colors.accent, borderRadius: radius.lg, padding: space(4),
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: space(2), marginTop: space(6), minHeight: 52, width: '100%',
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  skip: { padding: space(4), alignItems: 'center' },
  skipText: { color: colors.textDim, fontSize: 15 },
});
