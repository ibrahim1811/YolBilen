import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './config';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const BUNDLED_SCHEDULES: Record<string, any> = require('../../data/schedules.json');

export interface LineSchedule {
  weekday?: { gidis: string[]; donus: string[] };
  saturday?: { gidis: string[]; donus: string[] };
  sunday?: { gidis: string[]; donus: string[] };
}

type ServiceType = 'weekday' | 'saturday' | 'sunday';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 gün

function cacheKey(lineNumber: string) {
  return `sched:${lineNumber}`;
}

async function getCached(lineNumber: string): Promise<LineSchedule | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(lineNumber));
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    return data as LineSchedule;
  } catch {
    return null;
  }
}

async function setCache(lineNumber: string, data: LineSchedule) {
  try {
    await AsyncStorage.setItem(cacheKey(lineNumber), JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

function bundledFallback(lineNumber: string): LineSchedule | null {
  try {
    const key = lineNumber.replace(/^0+/, '');
    const raw = BUNDLED_SCHEDULES[key] ?? BUNDLED_SCHEDULES[lineNumber];
    if (!raw) return null;
    const convert = (svc: any) => svc ? { gidis: svc['0'] ?? [], donus: svc['1'] ?? [] } : undefined;
    return {
      weekday: convert(raw.weekday),
      saturday: convert(raw.saturday),
      sunday: convert(raw.sunday),
    };
  } catch {
    return null;
  }
}

export async function getLineScheduleFromFirestore(lineNumber: string): Promise<LineSchedule> {
  const cached = await getCached(lineNumber);
  if (cached) return cached;

  try {
    const snap = await getDoc(doc(db, 'schedules', lineNumber));
    if (snap.exists()) {
      const { updatedAt, ...rest } = snap.data() as any;
      const schedule = rest as LineSchedule;
      await setCache(lineNumber, schedule);
      return schedule;
    }
  } catch {}

  const fallback = bundledFallback(lineNumber);
  if (fallback) {
    await setCache(lineNumber, fallback);
    return fallback;
  }
  return {};
}

export function getScheduleForDay(schedule: LineSchedule, serviceType: ServiceType) {
  const svc = schedule[serviceType];
  return {
    dir0: svc?.gidis ?? [],
    dir1: svc?.donus ?? [],
  };
}

function todayServiceType(): ServiceType {
  const day = new Date().getDay();
  if (day === 0) return 'sunday';
  if (day === 6) return 'saturday';
  return 'weekday';
}

function minsUntil(hhmm: string, nowMins: number): number {
  const [h, m] = hhmm.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return Infinity;
  const t = h * 60 + m;
  return t >= nowMins ? t - nowMins : t + 1440 - nowMins;
}

export function getNextArrivalMins(lineNumber: string): number {
  const schedule = bundledFallback(lineNumber);
  const svcType = todayServiceType();
  const times = schedule?.[svcType]?.gidis ?? [];
  if (times.length === 0) return 15;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const result = Math.min(...times.map(t => minsUntil(t, nowMins)));
  return isFinite(result) ? result : 15;
}
