import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './config';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const BUNDLED_SCHEDULES: Record<string, any> = require('../../data/schedules.json');

export interface LineSchedule {
  weekday?: { gidis: number[]; donus: number[] };
  saturday?: { gidis: number[]; donus: number[] };
  sunday?: { gidis: number[]; donus: number[] };
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

function toMins(t: string | number): number {
  if (typeof t === 'number') return t;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function convertSvc(svc: any): { gidis: number[]; donus: number[] } | undefined {
  if (!svc) return undefined;
  const raw0: (string | number)[] = svc.gidis ?? svc['0'] ?? [];
  const raw1: (string | number)[] = svc.donus ?? svc['1'] ?? [];
  return { gidis: raw0.map(toMins), donus: raw1.map(toMins) };
}

function bundledFallback(lineNumber: string): LineSchedule | null {
  try {
    const key = lineNumber.replace(/^0+/, '');
    const raw = BUNDLED_SCHEDULES[key] ?? BUNDLED_SCHEDULES[lineNumber];
    if (!raw) return null;
    return {
      weekday: convertSvc(raw.weekday),
      saturday: convertSvc(raw.saturday),
      sunday: convertSvc(raw.sunday),
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
      const schedule: LineSchedule = {
        weekday: convertSvc(rest.weekday),
        saturday: convertSvc(rest.saturday),
        sunday: convertSvc(rest.sunday),
      };
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
    dir0: svc?.gidis ?? [] as number[],
    dir1: svc?.donus ?? [] as number[],
  };
}

function todayServiceType(): ServiceType {
  const day = new Date().getDay();
  if (day === 0) return 'sunday';
  if (day === 6) return 'saturday';
  return 'weekday';
}

function minsUntil(depMins: number, nowMins: number): number {
  if (!isFinite(depMins)) return Infinity;
  return depMins >= nowMins ? depMins - nowMins : depMins + 1440 - nowMins;
}

export function getNextArrivalMins(lineNumber: string): number {
  const schedule = bundledFallback(lineNumber);
  const svcType = todayServiceType();
  const times = [
    ...(schedule?.[svcType]?.gidis ?? []),
    ...(schedule?.[svcType]?.donus ?? []),
  ];
  if (times.length === 0) return 15;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const result = Math.min(...times.map(t => minsUntil(t, nowMins)));
  return isFinite(result) && result <= 90 ? result : 999;
}

// stopPositionT: 0 = gidiş terminali, 1 = dönüş terminali
// routeDurationMins: hattın uçtan uca tahmini süresi
export function getNextArrivalMinsForStop(
  lineNumber: string,
  stopPositionT: number,
  routeDurationMins: number
): number {
  const schedule = bundledFallback(lineNumber);
  const svcType = todayServiceType();
  const gidisTimes = schedule?.[svcType]?.gidis ?? [];
  const donusTimes = schedule?.[svcType]?.donus ?? [];
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  function earliest(times: number[], offsetMins: number): number {
    if (times.length === 0) return Infinity;
    const mins = times.map(dep => minsUntil(dep, nowMins - offsetMins) + offsetMins);
    return Math.min(...mins);
  }

  const gidisOffset = Math.round(stopPositionT * routeDurationMins);
  const donusOffset = Math.round((1 - stopPositionT) * routeDurationMins);

  const best = Math.min(
    earliest(gidisTimes, gidisOffset),
    earliest(donusTimes, donusOffset)
  );
  return isFinite(best) && best <= 90 ? best : 999;
}

export function minsToArrivalLabel(mins: number): string {
  if (mins <= 1) return 'Şimdi';
  if (mins > 90) return 'Yarın';
  if (mins < 60) return `~${mins} dk`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `~${h} sa ${m > 0 ? m + ' dk' : ''}`.trim();
}
