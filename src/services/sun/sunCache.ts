import type { SunAnalysis } from '../../types';
import { analyzeSunExposureAlongRoute } from './sunAnalysis';

const _cache = new Map<string, SunAnalysis>();

function cacheKey(routeKey: string, hour: number, month: number): string {
  return `${routeKey}_${hour}_${month}`;
}

// routeKey durak çiftini de içermeli (örn. "42_0_1001_1050") — aksi halde aynı
// hat+yöndeki farklı biniş/iniş çiftleri birbirinin güneş sonucunu çalar.
export function getCachedSunAnalysis(
  routeKey: string,
  waypoints: Array<{ latitude: number; longitude: number }>,
  date: Date
): SunAnalysis {
  const hour = date.getHours();
  const month = date.getMonth();
  const key = cacheKey(routeKey, hour, month);
  if (_cache.has(key)) return _cache.get(key)!;
  const result = analyzeSunExposureAlongRoute(waypoints, date);
  _cache.set(key, result);
  return result;
}

export function clearSunCache(): void {
  _cache.clear();
}
