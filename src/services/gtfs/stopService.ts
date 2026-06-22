import type { Stop, StopArrival } from '../../types';
import { getStops, getAllLines } from '../../data/gtfsData';

export function getMockArrivals(stop: Stop): StopArrival[] {
  return getAllLines().slice(0, 4).map((route, i) => ({
    lineNumber: route.lineNum,
    lineName: route.name,
    minutesAway: [2, 5, 9, 14][i],
    direction: route.name.split(' - ')[1] ?? 'Son Durak',
  }));
}

export function searchStops(query: string): Stop[] {
  const q = query.toLowerCase();
  return getStops()
    .filter(s => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q))
    .slice(0, 30)
    .map(s => ({ id: s.id, name: s.name, latitude: s.lat, longitude: s.lon, lines: [] }));
}

export function getMockStops(): Stop[] {
  return getStops()
    .slice(0, 100)
    .map(s => ({ id: s.id, name: s.name, latitude: s.lat, longitude: s.lon, lines: [] }));
}
