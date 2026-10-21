import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensureAndroidChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Genel',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#1A73E8',
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync('arrivals', {
    name: 'Otobüs Varışları',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 100],
    lightColor: '#34A853',
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync('alerts', {
    name: 'Hat Uyarıları',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#FBBC04',
  });
}

export async function ensureLocalNotificationPermission(): Promise<boolean> {
  await ensureAndroidChannels();
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null;

  try {
    if (!(await ensureLocalNotificationPermission())) return null;

    const token = (await Notifications.getExpoPushTokenAsync()).data;
    return token;
  } catch {
    return null;
  }
}

export async function savePushToken(userId: string, token: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', userId), {
      pushToken: token,
      pushTokenUpdatedAt: new Date(),
    });
  } catch {}
}

export async function scheduleLocalNotification(
  title: string,
  body: string,
  channelId: 'default' | 'arrivals' | 'alerts' = 'default',
  triggerSeconds = 0,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        data: { channelId, ...data },
        ...(Platform.OS === 'android' ? { channelId } : {}),
      },
      trigger: triggerSeconds > 0
        ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: triggerSeconds }
        : null,
    });
  } catch (e) {
    console.warn('[notification] bildirim planlanamadı:', e);
  }
}

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export function addNotificationListener(
  handler: (notification: Notifications.Notification) => void
): Notifications.Subscription {
  return Notifications.addNotificationReceivedListener(handler);
}

export function addResponseListener(
  handler: (response: Notifications.NotificationResponse) => void
): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener(handler);
}
