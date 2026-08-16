import { Tabs } from 'expo-router';
import { colors } from '@/theme';
import { TabBar } from '@/components/TabBar';

/**
 * Four tabs — Summary · Practice · Crew · You (§3.10).
 *
 * The bar itself is the custom floating glass bar in `src/components/TabBar`,
 * which renders only the four routes listed in its TABS table. That means no
 * `href: null` screens: any legacy route file still sitting in this folder is
 * reachable by URL but never leaks into the bar.
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
