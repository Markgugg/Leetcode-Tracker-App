import { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/stores/auth';
import { useOnboarding } from '@/stores/onboarding';
import { OnboardingStep } from '@/components/OnboardingStep';
import { colors, radius, space } from '@/theme';

const OPTIONS = [
  { goal: 3, label: 'Steady', sub: '~25 min, 3 days a week' },
  { goal: 5, label: 'Committed', sub: '~30 min, 5 days a week', badge: 'most common' },
  { goal: 7, label: 'Locked in', sub: 'Every single day' },
];

/** Onboarding step 3 of 4 — pick a weekly pace. Saves the profile row. */
export default function GoalCommitment() {
  const router = useRouter();
  const { session } = useAuth();
  const ob = useOnboarding();
  const [goal, setGoal] = useState(ob.goal);
  const [busy, setBusy] = useState(false);

  const commit = async () => {
    if (!session) return;
    setBusy(true);
    const { error } = await supabase.from('profiles').upsert({
      id: session.user.id,
      username: ob.username,
      display_name: ob.displayName || null,
      leetcode_username: ob.lcUsername || null,
      weekly_goal: goal,
    });
    setBusy(false);
    if (error) {
      if (error.message.includes('unique') || error.message.includes('duplicate')) {
        Alert.alert('Handle taken', 'Someone claimed that handle just now. Pick another.', [
          { text: 'OK', onPress: () => router.replace('/onboarding') },
        ]);
      } else {
        Alert.alert('Could not save', error.message);
      }
      return;
    }
    ob.set({ goal });
    // Kick off the history import in the background — the feed fills itself.
    if (ob.lcUsername) {
      supabase.functions.invoke('leetcode-sync').catch(() => {});
    }
    router.push('/notifications');
  };

  return (
    <OnboardingStep
      step={3}
      title="Set your pace"
      subtitle="Problems per week. Your streak and goal ring are built on this."
    >
      <View style={s.options}>
        {OPTIONS.map(o => {
          const sel = goal === o.goal;
          return (
            <Pressable
              key={o.goal}
              style={[s.opt, sel && s.optSel]}
              onPress={() => setGoal(o.goal)}
            >
              <Text style={[s.optNum, sel && { color: colors.accentText }]}>{o.goal}</Text>
              <View style={{ flex: 1 }}>
                <View style={s.optTitleRow}>
                  <Text style={s.optTitle}>{o.label}</Text>
                  {o.badge && (
                    <View style={s.badge}><Text style={s.badgeText}>{o.badge}</Text></View>
                  )}
                </View>
                <Text style={s.optSub}>{o.sub}</Text>
              </View>
              <View style={[s.radio, sel && s.radioOn]}>
                {sel && <View style={s.radioDot} />}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={s.warnCard}>
        <Text style={s.warnEmoji}>🔥</Text>
        <Text style={s.warnText}>
          Hit your weekly pace to grow your streak. Miss it and the streak decays — the crons are merciless.
        </Text>
      </View>

      <View style={{ flex: 1 }} />
      <Pressable style={[s.cta, busy && { opacity: 0.6 }]} onPress={commit} disabled={busy}>
        {busy
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={s.ctaText}>Commit to {goal} a week</Text>
        }
      </Pressable>
    </OnboardingStep>
  );
}

const s = StyleSheet.create({
  options: { gap: space(2) },
  opt: {
    flexDirection: 'row', alignItems: 'center', gap: space(3),
    backgroundColor: colors.card, borderRadius: radius.xl,
    borderWidth: 1.5, borderColor: colors.border,
    padding: space(4),
  },
  optSel: { borderColor: colors.accent, backgroundColor: 'rgba(99,102,241,0.09)' },
  optNum: { color: colors.textDim, fontSize: 24, fontWeight: '800', width: 32, textAlign: 'center' },
  optTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  optTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  badge: {
    backgroundColor: colors.accentLight, borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  badgeText: { color: colors.accentText, fontSize: 10, fontWeight: '700' },
  optSub: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioOn: { borderColor: colors.accent },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.accent },

  warnCard: {
    flexDirection: 'row', alignItems: 'center', gap: space(3),
    backgroundColor: 'rgba(255,138,61,0.07)', borderRadius: radius.lg,
    borderWidth: 1, borderColor: 'rgba(255,138,61,0.2)',
    padding: space(3), marginTop: space(4),
  },
  warnEmoji: { fontSize: 18 },
  warnText: { flex: 1, color: colors.textDim, fontSize: 12, lineHeight: 17 },

  cta: {
    backgroundColor: colors.accent, borderRadius: radius.lg, padding: space(4),
    alignItems: 'center', minHeight: 52, justifyContent: 'center',
  },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
