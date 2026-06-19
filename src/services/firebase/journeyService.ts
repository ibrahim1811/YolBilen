import {
  collection, addDoc, getDocs, query, where, orderBy, limit, Timestamp,
} from 'firebase/firestore';
import { db } from './config';
import type { JourneyRecord } from '../../types';

export async function saveJourney(journey: Omit<JourneyRecord, 'id'>): Promise<void> {
  await addDoc(collection(db, 'journeys'), {
    ...journey,
    timestamp: Timestamp.fromDate(journey.timestamp),
  });
}

export async function getUserJourneys(userId: string, limitCount = 100): Promise<JourneyRecord[]> {
  try {
    const q = query(
      collection(db, 'journeys'),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => {
      const data = d.data();
      return { id: d.id, ...data, timestamp: (data.timestamp as Timestamp).toDate() } as JourneyRecord;
    });
  } catch {
    const q = query(collection(db, 'journeys'), where('userId', '==', userId), limit(limitCount));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => {
        const data = d.data();
        return { id: d.id, ...data, timestamp: (data.timestamp as Timestamp).toDate() } as JourneyRecord;
      })
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
}

export interface JourneyStats {
  total: number;
  totalKm: number;
  uniqueLines: number;
  topLine: string | null;
  topLineName: string | null;
}

export function computeStats(journeys: JourneyRecord[]): JourneyStats {
  const totalKm = Math.round(journeys.reduce((s, j) => s + (j.distanceKm ?? 0), 0) * 10) / 10;
  const lineCount = new Map<string, { name: string; count: number }>();
  for (const j of journeys) {
    const cur = lineCount.get(j.lineNumber);
    lineCount.set(j.lineNumber, { name: j.lineName, count: (cur?.count ?? 0) + 1 });
  }
  const top = [...lineCount.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  return { total: journeys.length, totalKm, uniqueLines: lineCount.size, topLine: top?.[0] ?? null, topLineName: top?.[1].name ?? null };
}

export function detectRoutine(journeys: JourneyRecord[]): JourneyRecord | null {
  const now = new Date();
  const dow = now.getDay();
  const hour = now.getHours();
  if (dow === 0 || dow === 6 || hour < 6 || hour > 10) return null;
  const morning = journeys.filter(j => j.dayOfWeek === dow && j.hourOfDay >= 6 && j.hourOfDay <= 10);
  if (morning.length < 2) return null;
  const routeMap = new Map<string, { j: JourneyRecord; count: number }>();
  for (const j of morning) {
    const key = `${j.lineNumber}|${j.originName}|${j.destinationName}`;
    routeMap.set(key, { j, count: (routeMap.get(key)?.count ?? 0) + 1 });
  }
  const top = [...routeMap.values()].sort((a, b) => b.count - a.count)[0];
  return (top && top.count >= 2) ? top.j : null;
}
