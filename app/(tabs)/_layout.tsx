import { Tabs } from 'expo-router';
import { Easing } from 'react-native';
import { colors } from '@/theme';
import { TabBar, TRAVEL_MS } from '@/components/TabBar';

/**
 * Four tabs — Summary · Practice · Crew · You (§3.10), bar per specimen F.
 *
 * The tab-change effect is the full-screen cross-fade below: both scenes
 * render simultaneously for the whole 460ms — the incoming one arriving from
 * scale 1.035 while it fades in, the outgoing one receding as its progress
 * unwinds through the same curve. The duration is shared with the bar's pill
 * travel (TRAVEL_MS) so the two motions read as one gesture.
 *
 * The spec's animated per-scene blur is intentionally dropped: the navigator's
 * scene interpolator can only drive style props, and the spec's own degrade
 * path says scale + opacity still read where a plain fade would not.
 *
 * Screens need 120px bottom padding to clear the floating bar.
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      /* Inactive scenes must stay attached: react-native-screens detaches a
         blurred scene mid-fade, and on revisit the interpolated opacity is
         not re-evaluated — the screen comes back stuck at 0 (fully black).
         Four resident scenes is a price worth paying. */
      detachInactiveScreens={false}
      screenOptions={{
        headerShown: false,
        freezeOnBlur: false,
        sceneStyle: { backgroundColor: colors.bg },
        animation: 'fade',
        transitionSpec: {
          animation: 'timing',
          config: {
            duration: TRAVEL_MS,
            easing: Easing.bezier(0.22, 1, 0.36, 1),
          },
        },
        /* progress is position-like: 0 = focused, ±1 = a screen away. */
        sceneStyleInterpolator: ({ current }) => ({
          sceneStyle: {
            opacity: current.progress.interpolate({
              inputRange: [-1, 0, 1],
              outputRange: [0, 1, 0],
            }),
            transform: [
              {
                scale: current.progress.interpolate({
                  inputRange: [-1, 0, 1],
                  outputRange: [1.035, 1, 1.035],
                }),
              },
            ],
          },
        }),
      }}>
      <Tabs.Screen name="index" options={{ title: 'Summary' }} />
      <Tabs.Screen name="practice" options={{ title: 'Practice' }} />
      <Tabs.Screen name="crew" options={{ title: 'Crew' }} />
      <Tabs.Screen name="you" options={{ title: 'You' }} />
    </Tabs>
  );
}
