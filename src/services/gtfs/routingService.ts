import type { Route, Location, CrowdLevel, RouteStop } from '../../types';
import { IZMIR_ROUTES } from '../../data/izmir-routes';
import { getStops, getStopRoutes } from '../../data/gtfsData';
import { analyzeSunExposure } from '../sun/sunAnalysis';

const CROWD_CYCLE: CrowdLevel[] = ['low', 'medium', 'high', 'very_high'];

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

function locToPoint(loc: Location) {
  return { lat: loc.latitude, lon: loc.longitude };
}

function nearestStops(loc: Location, k = 8): RouteStop[] {
  const pt = locToPoint(loc);
  return getStops()
    .map(s => ({ id: s.id, name: s.name, latitude: s.lat, longitude: s.lon, dist: haversineKm(pt, s) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, k);
}

function routesForStops(stops: RouteStop[]): Map<string, RouteStop> {
  const sr = getStopRoutes();
  const map = new Map<string, RouteStop>();
  for (const stop of stops) {
    for (const line of sr[stop.id] ?? []) {
      if (!map.has(line)) map.set(line, stop);
    }
  }
  return map;
}

function routeMeta(lineNumber: string) {
  return IZMIR_ROUTES.find(r => r.lineNumber === lineNumber);
}

export function findRoutes(origin: Location, destination: Location): Route[] {
  const sunAnalysis = analyzeSunExposure({ from: origin, to: destination, departureTime: new Date() });
  const distKm = haversineKm(locToPoint(origin), locToPoint(destination));

  const originStops = nearestStops(origin, 8);
  const destStops = nearestStops(destination, 8);
  const originRoutes = routesForStops(originStops);
  const destRoutes = routesForStops(destStops);

  const results: Route[] = [];

  for (const [lineNum, boardingStop] of originRoutes.entries()) {
    if (!destRoutes.has(lineNum)) continue;
    const alightingStop = destRoutes.get(lineNum)!;
    const meta = routeMeta(lineNum);
    if (!meta) continue;
    const idx = results.length;
    results.push({
      id: `direct-${lineNum}`,
      lineNumber: lineNum,
      lineName: meta.lineName,
      estimatedDuration: Math.round(distKm * 3 + 5 + idx * 2),
      transfers: [],
      nextArrival: 1 + (idx * 4) % 18,
      crowdLevel: CROWD_CYCLE[idx % 4],
      sunAnalysis,
      boardingStop,
      alightingStop,
    });
    if (results.length >= 5) break;
  }

  if (results.length < 3) {
    const originArr = [...originRoutes.entries()];
    const destArr = [...destRoutes.entries()];
    outer: for (const [lineA, boardingStop] of originArr) {
      for (const [lineB, alightingStop] of destArr) {
        if (lineA === lineB) continue;
        const metaA = routeMeta(lineA);
        const metaB = routeMeta(lineB);
        if (!metaA || !metaB) continue;
        const idx = results.length;
        results.push({
          id: `transfer-${lineA}-${lineB}`,
          lineNumber: lineA,
          lineName: metaA.lineName,
          estimatedDuration: Math.round(distKm * 3 + 15 + idx * 3),
          transfers: [{ lineNumber: lineB, stopName: 'Aktarma Durağı', waitTime: 5 }],
          nextArrival: 2 + (idx * 5) % 20,
          crowdLevel: CROWD_CYCLE[(idx + 1) % 4],
          sunAnalysis,
          boardingStop,
          alightingStop,
        });
        if (results.length >= 5) break outer;
      }
    }
  }

  if (results.length === 0) {
    IZMIR_ROUTES.slice(0, 4).forEach((r, i) => {
      results.push({
        id: `fallback-${r.id}`,
        lineNumber: r.lineNumber,
        lineName: r.lineName,
        estimatedDuration: Math.round(distKm * 3 + 10 + i * 5),
        transfers: [],
        nextArrival: 3 + i * 4,
        crowdLevel: CROWD_CYCLE[i % 4],
        sunAnalysis,
        boardingStop: originStops[0],
        alightingStop: destStops[0],
      });
    });
  }

  return results;
}
