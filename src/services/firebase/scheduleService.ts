import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './config';

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

  return {};
}

export function getScheduleForDay(schedule: LineSchedule, serviceType: ServiceType) {
  const svc = schedule[serviceType];
  return {
    dir0: svc?.gidis ?? [],
    dir1: svc?.donus ?? [],
  };
}
