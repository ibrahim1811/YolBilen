import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from './config';
import type { LineStats, ComfortScore } from '../../types';

function calcScore(good: number, medium: number, bad: number): number {
  const total = good + medium + bad;
  if (total === 0) return 0;
  return Math.round(((good * 10 + medium * 5 + bad * 0) / total) * 10) / 10;
}

export function computeComfortScore(stats: LineStats): ComfortScore {
  const acScore = calcScore(stats.ac_good ?? 0, stats.ac_medium ?? 0, stats.ac_broken ?? 0);
  const comfortScore = calcScore(
    stats.comfort_comfortable ?? 0,
    stats.comfort_medium ?? 0,
    stats.comfort_uncomfortable ?? 0
  );
  const crowdScore = calcScore(
    stats.crowd_seated ?? 0,
    stats.crowd_standing ?? 0,
    stats.crowd_very_crowded ?? 0
  );

  const overall =
    Math.round((acScore * 0.3 + comfortScore * 0.4 + crowdScore * 0.3) * 10) / 10;

  return {
    lineNumber: stats.lineNumber,
    totalFeedbacks: stats.totalFeedbacks ?? 0,
    acScore,
    comfortScore,
    crowdScore,
    overall,
  };
}

export async function getLineComfortScore(lineNumber: string): Promise<ComfortScore | null> {
  const snap = await getDoc(doc(db, 'line_stats', lineNumber));
  if (!snap.exists()) return null;
  return computeComfortScore(snap.data() as LineStats);
}

export async function getAllLineScores(): Promise<ComfortScore[]> {
  const snap = await getDocs(collection(db, 'line_stats'));
  return snap.docs.map((d) => computeComfortScore(d.data() as LineStats));
}
