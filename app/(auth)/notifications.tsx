import { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/stores/auth';
import { useOnboarding } from '@/stores/onboarding';
import { OnboardingStep } from '@/components/OnboardingStep';
import { requestAndRegisterPush } from '@/lib/push';
import { colors, radius, space } from '@/theme';

const SAMPLES = [
  { title: 'ronak solved a Hard 💀', body: 'Trapping Rain Water · +60 pts · 2m ago' },
  { title: 'Streak at risk', body: '2 solves left this week. Sunday, 6pm.' },
  { title: "You're #1 this week 👑", body: 'dhruv is 45 pts behind and closing.' },
];

/** Onboarding step 4 of 4 — notification priming BEFORE the iOS dialog.
 *  The system prompt only fires from the explicit button below, never at launch. */
export default function NotificationPriming() {
  const router = useRouter();
  const { session } = useAuth();
  const ob = useOnboarding();
  const [busy, setBusy] = useState(false);

  const finish = () => {
    ob.reset(); // also clears `active`, re-arming the root layout's redirects
    router.replace('/today');
  };

  const enable = async () => {
    if (!session) return finish();
    setBusy(true);
    try {
      await requestAndRegisterPush(session.user.id);
    } catch {
      // Denied or unavailable — the app works without it.
    } finally {
      setBusy(false);
      finish();
    }
  };

  return (
    <OnboardingStep
      step={4}
      title="Don't grind alone"
      subtitle="Notifications are how your squad keeps you honest."
    >
      <View style={s.samples}>
        {SAMPLES.map((n, i) => (
          <View key={i} style={[s.notif, i === 2 && { opacity: 0.7 }]}>
            <View style={s.notifIcon}><Text style={s.notifIconText}>G</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.notifTitle}>{n.title}</Text>
              <Text style={s.notifBody}>{n.body}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={s.explainer}>
        Solves, streak warnings, and rank changes.{'\n'}No spam — tune each one in Settings.
      </Text>

      <View style={{ flex: 1 }} />
      <Pressable style={[s.cta, busy && { opacity: 0.6 }]} onPress={enable} disabled={busy}>
        {busy
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={s.ctaText}>Turn on notifications</Text>
        }
      </Pressable>
      <Pressable style={s.skip} onPress={finish} disabled={busy}>
        <Text style={s.skipText}>Not now</Text>
      </Pressable>
    </OnboardingStep>
  );
}

const s = StyleSheet.create({
  samples: { gap: space(2) },
  notif: {
    flexDirection: 'row', alignItems: 'flex-start', gap: space(3),
    backgroundColor: colors.cardAlt, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    padding: space(3),
  },
  notifIcon: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  notifIconText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  notifTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  notifBody: { color: colors.textDim, fontSize: 12, marginTop: 1 },

  explainer: {
    color: colors.textLight, fontSize: 12, textAlign: 'center',
    lineHeight: 18, marginTop: space(5),
  },

  cta: {
    backgroundColor: colors.accent, borderRadius: radius.lg, padding: space(4),
    alignItems: 'center', minHeight: 52, justifyContent: 'center',
  },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  skip: { alignItems: 'center', paddingVertical: space(3) },
  skipText: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
});
