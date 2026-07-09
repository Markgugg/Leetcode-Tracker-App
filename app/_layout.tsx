import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/stores/auth';
import { useOnboarding } from '@/stores/onboarding';
import { registerPushIfGranted } from '@/lib/push';

const queryClient = new QueryClient();

export default function RootLayout() {
  const { session, loading, init } = useAuth();
  const onboardingActive = useOnboarding(s => s.active);
  const router = useRouter();
  const segments = useSegments();
  const segment0 = segments[0];

  useEffect(() => { init(); }, []);

  useEffect(() => {
    if (loading) return;

    // The multi-step onboarding flow owns its own navigation; auto-redirects
    // here would yank the user back to step 1 on every route change.
    if (onboardingActive) return;

    const inAuth = segment0 === '(auth)';

    if (!session) {
      if (!inAuth) router.replace('/welcome');
      return;
    }

    // Silent token refresh only — the permission dialog is never triggered here.
    // First-time permission requests happen on the onboarding priming screen.
    registerPushIfGranted(session.user.id).catch(() => {});

    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!data) {
        router.replace('/onboarding');
      } else if (inAuth || segment0 === undefined) {
        router.replace('/today');
      }
    })();
  }, [session, loading, segment0, onboardingActive]);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0D1117' } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="index" />
        <Stack.Screen name="profile/[userId]" options={{ presentation: 'card' }} />
        <Stack.Screen name="group/create" options={{ presentation: 'card' }} />
        <Stack.Screen name="group/join" options={{ presentation: 'card' }} />
        <Stack.Screen name="settings/index" options={{ presentation: 'card' }} />
        <Stack.Screen name="rank" options={{ presentation: 'card' }} />
        {/* Full-screen flows — tab bar must not bleed through */}
        <Stack.Screen name="interview/index" options={{ presentation: 'card', gestureEnabled: false }} />
        <Stack.Screen name="interview/report" options={{ presentation: 'card', gestureEnabled: false }} />
      </Stack>
    </QueryClientProvider>
  );
}
