import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLineScheduleFromFirestore, type LineSchedule } from '../firebase/scheduleService';
import { ensureLocalNotificationPermission } from './notificationService';

const STORAGE_KEY = 'last_bus_alerts:v1';
const DAYS_AHEAD = 7;
const ID_PREFIX = 'lastbus:';

export const LAST_BUS_MINUTE_OPTIONS = [5, 10, 15, 20, 30, 45, 60] as const;

export interface LastBusAlert {
  lineNumber: string;
  lineName: string;
  dir: 0 | 1;
  dirLabel: string;
  minutesBefore: number;
}

function alertKey(a: Pick<LastBusAlert, 'lineNumber' | 'dir'>) {
  return `${a.lineNumber}:${a.dir}`;
}

function serviceTypeOf(date: Date): keyof LineSchedule {
  const day = date.getDay();
  if (day === 0) return 'sunday';
  if (day === 6) return 'saturday';
  return 'weekday';
}

// Gece yarısından sonraki kalkışlar (03:00 öncesi) önceki servis gününe aittir.
export function lastDepartureMins(schedule: LineSchedule, date: Date, dir: 0 | 1): number | null {
  const svc = schedule[serviceTypeOf(date)];
  const times = dir === 0 ? svc?.gidis : svc?.donus;
  if (!times || times.length === 0) return null;
  return Math.max(...times.map(t => (t < 180 ? t + 1440 : t)));
}

export function formatMins(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export async function getLastBusAlerts(): Promise<LastBusAlert[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as LastBusAlert[];
  } catch (e) {
    console.warn('[lastBus] kayıtlı uyarılar okunamadı, sıfırlanıyor:', e);
    await AsyncStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

async function cancelScheduledFor(key?: string) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter(n => n.identifier.startsWith(key ? `${ID_PREFIX}${key}:` : ID_PREFIX))
      .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );
}

// Önümüzdeki 7 günün bildirimlerini kurar; kaç tane kurulduğunu döner.
async function scheduleAlert(a: LastBusAlert): Promise<number> {
  const schedule = await getLineScheduleFromFirestore(a.lineNumber);
  const now = new Date();
  let count = 0;
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const last = lastDepartureMins(schedule, day, a.dir);
    if (last === null) continue;
    const fireAt = new Date(day.getTime() + (last - a.minutesBefore) * 60_000);
    if (fireAt <= now) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: `${ID_PREFIX}${alertKey(a)}:${i}`,
      content: {
        title: `Son ${a.lineNumber} otobüsü ${a.minutesBefore} dk sonra!`,
        body: `${a.dirLabel} yönündeki son sefer ${formatMins(last)}'de kalkıyor.`,
        sound: 'default',
        data: { type: 'last_bus', lineNumber: a.lineNumber },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt, channelId: 'alerts' },
    });
    count++;
  }
  return count;
}

export async function saveLastBusAlert(a: LastBusAlert): Promise<number> {
  if (!(await ensureLocalNotificationPermission())) throw new Error('notifications/permission-denied');
  const alerts = (await getLastBusAlerts()).filter(x => alertKey(x) !== alertKey(a));
  alerts.push(a);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
  await cancelScheduledFor(alertKey(a));
  return scheduleAlert(a);
}

export async function removeLastBusAlert(lineNumber: string, dir: 0 | 1): Promise<void> {
  const key = alertKey({ lineNumber, dir });
  const alerts = (await getLastBusAlerts()).filter(x => alertKey(x) !== key);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
  await cancelScheduledFor(key);
}

// Uygulama her açıldığında 7 günlük pencere ileri kaydırılır.
export async function rescheduleAllLastBusAlerts(): Promise<void> {
  const alerts = await getLastBusAlerts();
  if (alerts.length === 0) return;
  await cancelScheduledFor();
  for (const a of alerts) {
    try {
      await scheduleAlert(a);
    } catch (e) {
      console.warn(`[lastBus] ${a.lineNumber} uyarısı yeniden kurulamadı:`, e);
    }
  }
}
