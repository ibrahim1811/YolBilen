import type { Stop, StopArrival } from '../../types';
import { getStops } from '../../data/gtfsData';
import { IZMIR_ROUTES } from '../../data/izmir-routes';

export function getMockArrivals(stop: Stop): StopArrival[] {
  return IZMIR_ROUTES.slice(0, 4).map((route, i) => ({
    lineNumber: route.lineNumber,
    lineName: route.lineName,
    minutesAway: [2, 5, 9, 14][i],
    direction: route.lineName.split(' - ')[1] ?? 'Son Durak',
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
