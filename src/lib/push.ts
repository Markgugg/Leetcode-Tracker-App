import * as Notifications from 'expo-notifications';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

function pushSupported(): boolean {
  // Remote push notifications are not supported in Expo Go (SDK 53+).
  if (isExpoGo) return false;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  return !!projectId && projectId !== 'your-eas-project-id';
}

async function storeToken(userId: string): Promise<string | null> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await supabase.from('push_tokens').upsert({
    expo_token: token,
    user_id: userId,
    platform: Platform.OS,
    updated_at: new Date().toISOString(),
  });
  return token;
}

/**
 * Silent refresh for users who already granted permission (called at launch).
 * NEVER triggers the iOS permission dialog — that only happens via
 * requestAndRegisterPush, after the onboarding priming screen.
 */
export async function registerPushIfGranted(userId: string): Promise<string | null> {
  if (!pushSupported()) return null;
  const existing = await Notifications.getPermissionsAsync() as any;
  const granted: boolean = existing.granted ?? existing.status === 'granted';
  if (!granted) return null;
  return storeToken(userId);
}

/**
 * Explicit opt-in: shows the system permission dialog (one shot per install),
 * then registers the token. Call only from a priming surface the user tapped.
 */
export async function requestAndRegisterPush(userId: string): Promise<string | null> {
  if (!pushSupported()) return null;
  const existing = await Notifications.getPermissionsAsync() as any;
  let granted: boolean = existing.granted ?? existing.status === 'granted';
  if (!granted) {
    const r = await Notifications.requestPermissionsAsync() as any;
    granted = r.granted ?? r.status === 'granted';
  }
  if (!granted) return null;
  return storeToken(userId);
}
