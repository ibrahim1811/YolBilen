import type { SunAnalysis } from '../../types';
import { analyzeSunExposureAlongRoute } from './sunAnalysis';

const _cache = new Map<string, SunAnalysis>();

function cacheKey(lineNum: string, dir: 0 | 1, hour: number, month: number): string {
  return `${lineNum}_${dir}_${hour}_${month}`;
}

export function getCachedSunAnalysis(
  lineNum: string,
  dir: 0 | 1,
  waypoints: Array<{ latitude: number; longitude: number }>,
  date: Date
): SunAnalysis {
  const hour = date.getHours();
  const month = date.getMonth();
  const key = cacheKey(lineNum, dir, hour, month);
  if (_cache.has(key)) return _cache.get(key)!;
  const result = analyzeSunExposureAlongRoute(waypoints, date);
  _cache.set(key, result);
  return result;
}

export function clearSunCache(): void {
  _cache.clear();
}
