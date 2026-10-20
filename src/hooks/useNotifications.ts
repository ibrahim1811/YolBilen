import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  registerForPushNotifications,
  savePushToken,
  addNotificationListener,
  addResponseListener,
} from '../services/notifications/notificationService';
import { useAppStore } from '../store/useAppStore';
import type { RootStackParamList } from '../types';

export function useNotifications() {
  const user = useAppStore((s) => s.user);
  const notificationPrefs = useAppStore((s) => s.notificationPrefs);
  const prefsRef = useRef(notificationPrefs);
  prefsRef.current = notificationPrefs;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const notifListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    if (!user || user.isGuest) return;

    registerForPushNotifications().then((token) => {
      if (token) savePushToken(user.uid, token);
    });

    notifListener.current = addNotificationListener((_notification) => {
      // ön planda bildirim — handler otomatik alert gösteriyor
    });

    responseListener.current = addResponseListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      const type = data?.type as string | undefined;

      if (type === 'arrival' && prefsRef.current.busArrivals) {
        // Otobüs varış bildirimi tıklandı — rota arama açılıyor
        try { (navigation as any).navigate('Tabs', { screen: 'Home' }); } catch {}
      } else if (type === 'alert' && prefsRef.current.lineAlerts) {
        // Hat uyarısı bildirimi tıklandı — topluluk açılıyor
        try { (navigation as any).navigate('Tabs', { screen: 'Community' }); } catch {}
      }
    });

    return () => {
      notifListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [user?.uid]);
}
