import { Tabs } from 'expo-router';
import { colors } from '@/theme';
import { TabBar } from '@/components/TabBar';

/**
 * Four tabs — Summary · Practice · Crew · You.
 *
 * Bar per the FINAL handoff spec (Clear-variant Liquid Glass + Glide lens).
 * Screen transitions are intentionally out of scope per that spec: tabs swap
 * content instantly.
 *
 * Screens need 120px bottom padding to clear the floating bar.
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Summary' }} />
      <Tabs.Screen name="practice" options={{ title: 'Practice' }} />
      <Tabs.Screen name="crew" options={{ title: 'Crew' }} />
      <Tabs.Screen name="you" options={{ title: 'You' }} />
    </Tabs>
  );
}
