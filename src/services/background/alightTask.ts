import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { scheduleLocalNotification } from '../notifications/notificationService';

const ALIGHT_TASK = 'yolbul-alight-tracking';
const TARGET_KEY = 'alight_target';
const ALIGHT_NOTIFY_M = 500;
const ARRIVED_M = 80;

interface AlightTarget {
  name: string;
  latitude: number;
  longitude: number;
  notified: boolean;
}

function distMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

// Uygulama arka planda başlatıldığında da tanımlı olması için modül yüklenirken (global scope) tanımlanır.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(ALIGHT_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[alightTask] konum hatası:', error.message);
    return;
  }
  const loc = data?.locations?.[data.locations.length - 1];
  if (!loc) return;
  const raw = await AsyncStorage.getItem(TARGET_KEY);
  if (!raw) {
    await stopAlightTracking();
    return;
  }
  const target: AlightTarget = JSON.parse(raw);
  const d = distMeters(loc.coords.latitude, loc.coords.longitude, target.latitude, target.longitude);

  if (!target.notified && d < ALIGHT_NOTIFY_M) {
    await scheduleLocalNotification(
      'İnme zamanı yaklaşıyor!',
      `${target.name} durağına ~${Math.round(d)} m kaldı. İnmeye hazırlanın!`,
      'arrivals'
    );
    await AsyncStorage.setItem(TARGET_KEY, JSON.stringify({ ...target, notified: true }));
  }
  if (d < ARRIVED_M) await stopAlightTracking();
});

export type AlightTrackingResult = 'started' | 'foreground_only' | 'denied';

// Arka plan izni yoksa 'foreground_only' döner; ekran açıkken mevcut takip çalışmaya devam eder.
export async function startAlightTracking(target: { name: string; latitude: number; longitude: number }): Promise<AlightTrackingResult> {
  const fg = await Location.getForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'denied';
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') return 'foreground_only';

  await AsyncStorage.setItem(TARGET_KEY, JSON.stringify({ ...target, notified: false } satisfies AlightTarget));
  await Location.startLocationUpdatesAsync(ALIGHT_TASK, {
    accuracy: Location.Accuracy.High,
    distanceInterval: 25,
    timeInterval: 5000,
    activityType: Location.ActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Yolbul inme durağını takip ediyor',
      notificationBody: `${target.name} durağına yaklaşınca haber vereceğiz.`,
      notificationColor: '#1A73E8',
      killServiceOnDestroy: true,
    },
  });
  return 'started';
}

export async function stopAlightTracking(): Promise<void> {
  await AsyncStorage.removeItem(TARGET_KEY);
  if (await Location.hasStartedLocationUpdatesAsync(ALIGHT_TASK)) {
    await Location.stopLocationUpdatesAsync(ALIGHT_TASK);
  }
}

