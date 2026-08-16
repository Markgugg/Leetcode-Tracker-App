import { useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/stores/auth';
import { registerForPushNotifications } from '@/lib/push';
import { colors } from '@/theme';

const queryClient = new QueryClient();

export default function RootLayout() {
  const { session, loading, init } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const segment0 = segments[0];

  useEffect(() => { init(); }, []);

  useEffect(() => {
    if (loading) return;

    const inAuth = segment0 === '(auth)';
    const inTabs = segment0 === '(tabs)';

    if (!session) {
      if (!inAuth) router.replace('/sign-in');
      return;
    }

    // Registered user — set up push + check profile
    registerForPushNotifications(session.user.id).catch(() => {});

    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!data) {
        router.replace('/onboarding');
      } else if (inAuth || segment0 === undefined) {
        // Home is now Summary (§3.6); the old /feed route was deleted.
        router.replace('/(tabs)');
      }
    })();
  }, [session, loading, segment0]);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="index" />
        <Stack.Screen name="profile/[userId]" options={{ presentation: 'card' }} />
        <Stack.Screen name="group/create" options={{ presentation: 'card' }} />
        <Stack.Screen name="group/join" options={{ presentation: 'card' }} />
        {/* Full-screen flows — tab bar must not bleed through */}
        <Stack.Screen name="interview/index" options={{ presentation: 'card', gestureEnabled: false }} />
        <Stack.Screen name="interview/report" options={{ presentation: 'card', gestureEnabled: false }} />
      </Stack>
    </QueryClientProvider>
  );
}
