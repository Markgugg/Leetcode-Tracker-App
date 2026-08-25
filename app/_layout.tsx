import { useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/stores/auth';
import { registerForPushNotifications } from '@/lib/push';
import { colors } from '@/theme';

const queryClient = new QueryClient();

// Where a tapped push should land, by payload shape.
function routeForNotification(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  if (data.solve_id) return '/(tabs)/crew';
  if (data.type === 'streak_warning') return '/(tabs)';
  return null;
}

export default function RootLayout() {
  const { session, loading, init } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const segment0 = segments[0];
  // Push tapped before auth/profile checks settle — navigate once they have.
  const pendingPushRoute = useRef<string | null>(null);

  useEffect(() => { init(); }, []);

  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then((resp) => {
      const route = routeForNotification(resp?.notification.request.content.data);
      if (route) pendingPushRoute.current = route;
    });
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const route = routeForNotification(resp.notification.request.content.data);
      if (!route) return;
      if (useAuth.getState().session) router.push(route as any);
      else pendingPushRoute.current = route;
    });
    return () => sub.remove();
  }, []);

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
      } else if (pendingPushRoute.current) {
        const route = pendingPushRoute.current;
        pendingPushRoute.current = null;
        router.replace(route as any);
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
