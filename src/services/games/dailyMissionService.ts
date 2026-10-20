import type { DailyMissionDef } from '../../types';

export const MISSION_POOL: DailyMissionDef[] = [
  { id: 'play_1', label: 'Bir oyun oyna', target: 1, metric: 'playCount' },
  { id: 'play_3', label: 'Üç oyun oyna', target: 3, metric: 'playCount' },
  { id: 'score_500', label: 'Toplamda 500 puan yap', target: 500, metric: 'totalScore' },
  { id: 'score_1500', label: 'Toplamda 1500 puan yap', target: 1500, metric: 'totalScore' },
  { id: 'distinct_2', label: '2 farklı oyun dene', target: 2, metric: 'distinctGames' },
  { id: 'distinct_3', label: '3 farklı oyun dene', target: 3, metric: 'distinctGames' },
  { id: 'journey_1', label: 'Bir yolculuk başlat', target: 1, metric: 'journeyStarted' },
];

export function todayDateSeed(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function seededShuffle<T>(items: T[], seed: string): T[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    hash = (hash * 1103515245 + 12345) >>> 0;
    const j = hash % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function pickDailyMissions(dateSeed: string, count: number = 3): string[] {
  return seededShuffle(MISSION_POOL, dateSeed)
    .slice(0, count)
    .map((m) => m.id);
}

export function getMissionDef(id: string): DailyMissionDef | undefined {
  return MISSION_POOL.find((m) => m.id === id);
}
