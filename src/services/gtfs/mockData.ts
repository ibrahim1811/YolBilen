import type { Route, Location } from '../../types';
import { analyzeSunExposure } from '../sun/sunAnalysis';
import { IZMIR_ROUTES } from '../../data/izmir-routes';

const mockStops: Location[] = [
  { name: 'Konak',            latitude: 38.4192, longitude: 27.1287 },
  { name: 'Alsancak',         latitude: 38.4328, longitude: 27.1392 },
  { name: 'Karşıyaka',        latitude: 38.4560, longitude: 27.1150 },
  { name: 'Bornova',          latitude: 38.4686, longitude: 27.2197 },
  { name: 'Buca',             latitude: 38.3833, longitude: 27.1833 },
  { name: 'Gaziemir',         latitude: 38.3192, longitude: 27.1408 },
  { name: 'Çiğli',            latitude: 38.4897, longitude: 27.0744 },
  { name: 'Balçova',          latitude: 38.3906, longitude: 27.0506 },
  { name: 'Narlıdere',        latitude: 38.3894, longitude: 26.9986 },
  { name: 'Mavişehir',        latitude: 38.4714, longitude: 27.0750 },
  { name: 'Üçyol',            latitude: 38.4094, longitude: 27.1228 },
  { name: 'Halkapınar',       latitude: 38.4406, longitude: 27.1622 },
  { name: 'Fahrettin Altay',  latitude: 38.4103, longitude: 27.0700 },
  { name: 'Bostanlı',         latitude: 38.4625, longitude: 27.1094 },
  { name: 'Bayraklı',         latitude: 38.4611, longitude: 27.1531 },
];

const CROWD_LEVELS = ['low', 'medium', 'high', 'very_high'] as const;

export function getMockRoutes(origin: Location, destination: Location): Route[] {
  const sunAnalysis = analyzeSunExposure({
    from: origin,
    to: destination,
    departureTime: new Date(),
  });

  return IZMIR_ROUTES.slice(0, 8).map((r, i) => ({
    id: `route-${r.id}`,
    lineNumber: r.lineNumber,
    lineName: r.lineName,
    estimatedDuration: 15 + (i * 7) % 45,
    transfers: [],
    nextArrival: 1 + (i * 3) % 15,
    crowdLevel: CROWD_LEVELS[i % 4],
    sunAnalysis,
  }));
}

export { mockStops };
