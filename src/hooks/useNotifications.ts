import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useNavigation } from '@react-navigation/native';
import {
  registerForPushNotifications,
  savePushToken,
  addNotificationListener,
  addResponseListener,
} from '../services/notifications/notificationService';
import { useAppStore } from '../store/useAppStore';

export function useNotifications() {
  const user = useAppStore((s) => s.user);
  const notifListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    if (!user || user.isGuest) return;

    registerForPushNotifications().then((token) => {
      if (token) savePushToken(user.uid, token);
    });

    notifListener.current = addNotificationListener((notification) => {
      // Ön planda bildirim geldiğinde — handler zaten alert gösteriyor
      console.log('Bildirim alındı:', notification.request.content.title);
    });

    responseListener.current = addResponseListener((response) => {
      // Kullanıcı bildirimi tıkladığında yapılacaklar
      const data = response.notification.request.content.data;
      console.log('Bildirim tıklandı:', data);
    });

    return () => {
      notifListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [user?.uid]);
}
