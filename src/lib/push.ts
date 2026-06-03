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

export async function registerForPushNotifications(userId: string): Promise<string | null> {
  // Remote push notifications are not supported in Expo Go (SDK 53+).
  if (isExpoGo) return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId || projectId === 'your-eas-project-id') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const existing = await Notifications.getPermissionsAsync() as any;
  let granted: boolean = existing.granted ?? existing.status === 'granted';
  if (!granted) {
    const r = await Notifications.requestPermissionsAsync() as any;
    granted = r.granted ?? r.status === 'granted';
  }
  if (!granted) return null;

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  await supabase.from('push_tokens').upsert({
    expo_token: token,
    user_id: userId,
    platform: Platform.OS,
    updated_at: new Date().toISOString(),
  });

  return token;
}
