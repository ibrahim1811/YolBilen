import type { Stop, StopArrival } from '../../types';
import { getStops, getAllLines } from '../../data/gtfsData';
import { normalizeSearch } from '../../utils/searchText';

export function getMockArrivals(stop: Stop): StopArrival[] {
  return getAllLines().slice(0, 4).map((route, i) => ({
    lineNumber: route.lineNum,
    lineName: route.name,
    minutesAway: [2, 5, 9, 14][i],
    direction: route.name.split(' - ')[1] ?? 'Son Durak',
  }));
}

let _normalizedNames: string[] | null = null;

export function searchStops(query: string): Stop[] {
  const q = normalizeSearch(query);
  if (!q) return [];
  const stops = getStops();
  if (!_normalizedNames) _normalizedNames = stops.map(s => normalizeSearch(s.name));
  const names = _normalizedNames;
  return stops
    .filter((s, i) => names[i].includes(q) || s.id.includes(q))
    .slice(0, 30)
    .map(s => ({ id: s.id, name: s.name, latitude: s.lat, longitude: s.lon, lines: [] }));
}

export function getMockStops(): Stop[] {
  return getStops()
    .slice(0, 100)
    .map(s => ({ id: s.id, name: s.name, latitude: s.lat, longitude: s.lon, lines: [] }));
}
