import type { Route, Location, CrowdLevel, RouteStop, RouteStep, RouteFilterMode } from '../../types';
import { IZMIR_ROUTES } from '../../data/izmir-routes';
import { getStops, getStopRoutes } from '../../data/gtfsData';
import { analyzeSunExposure } from '../sun/sunAnalysis';
import { getNextArrivalMins } from '../firebase/scheduleService';

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

function walkCalc(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): { mins: number; meters: number } {
  const meters = Math.round(haversineKm({ lat: from.latitude, lon: from.longitude }, { lat: to.latitude, lon: to.longitude }) * 1000);
  return { meters, mins: Math.max(1, Math.round(meters / 84)) };
}

let lineStopsCache: Map<string, Array<{ name: string; latitude: number; longitude: number }>> | null = null;

function getLineStopsMap(): Map<string, Array<{ name: string; latitude: number; longitude: number }>> {
  if (lineStopsCache) return lineStopsCache;
  const sr = getStopRoutes();
  const stops = getStops();
  const byId = new Map(stops.map(s => [s.id, s]));
  lineStopsCache = new Map();
  for (const [stopId, lines] of Object.entries(sr)) {
    const s = byId.get(stopId);
    if (!s) continue;
    for (const line of lines) {
      if (!lineStopsCache.has(line)) lineStopsCache.set(line, []);
      lineStopsCache.get(line)!.push({ name: s.name, latitude: s.lat, longitude: s.lon });
    }
  }
  return lineStopsCache;
}

function intermediateStops(
  lineNum: string,
  board: { latitude: number; longitude: number },
  alight: { latitude: number; longitude: number }
): Array<{ name: string; latitude: number; longitude: number }> {
  const all = getLineStopsMap().get(lineNum) ?? [];
  const dx = alight.longitude - board.longitude;
  const dy = alight.latitude - board.latitude;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return [];
  return all
    .map(s => ({ ...s, t: ((s.longitude - board.longitude) * dx + (s.latitude - board.latitude) * dy) / len2 }))
    .filter(s => s.t > 0.05 && s.t < 0.95)
    .sort((a, b) => a.t - b.t)
    .slice(0, 30)
    .map(({ name, latitude, longitude }) => ({ name, latitude, longitude }));
}

function buildSteps(
  origin: Location,
  destination: Location,
  lineNum: string,
  board: RouteStop,
  alight: RouteStop,
  nextArrivalMins: number,
  transitDuration: number
): RouteStep[] {
  const toBoard = walkCalc(origin, board);
  const fromAlight = walkCalc(alight, destination);
  const now = new Date();
  const depMins = now.getHours() * 60 + now.getMinutes() + nextArrivalMins;
  const dh = Math.floor(depMins / 60) % 24;
  const dm = depMins % 60;
  const departureTime = `${String(dh).padStart(2, '0')}:${String(dm).padStart(2, '0')}`;
  return [
    { type: 'walk', durationMins: toBoard.mins, toStopName: board.name, distanceMeters: toBoard.meters },
    {
      type: 'transit',
      durationMins: Math.max(1, transitDuration - toBoard.mins - fromAlight.mins),
      lineNumber: lineNum,
      boardStop: { name: board.name, latitude: board.latitude, longitude: board.longitude },
      alightStop: { name: alight.name, latitude: alight.latitude, longitude: alight.longitude },
      intermediateStops: intermediateStops(lineNum, board, alight),
      departureTime,
    },
    { type: 'walk', durationMins: fromAlight.mins, toStopName: destination.name, distanceMeters: fromAlight.meters },
  ];
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
    const nextArrival = getNextArrivalMins(lineNum);
    const estimatedDuration = Math.round(distKm * 5 + 8 + idx * 2);
    results.push({
      id: `direct-${lineNum}`,
      lineNumber: lineNum,
      lineName: meta.lineName,
      estimatedDuration,
      transfers: [],
      nextArrival,
      crowdLevel: CROWD_CYCLE[idx % 4],
      sunAnalysis,
      boardingStop,
      alightingStop,
      steps: buildSteps(origin, destination, lineNum, boardingStop, alightingStop, nextArrival, estimatedDuration),
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
        const nextArrival = getNextArrivalMins(lineA);
        const estimatedDuration = Math.round(distKm * 5 + 22 + idx * 3);
        results.push({
          id: `transfer-${lineA}-${lineB}`,
          lineNumber: lineA,
          lineName: metaA.lineName,
          estimatedDuration,
          transfers: [{ lineNumber: lineB, stopName: 'Aktarma Durağı', waitTime: 5 }],
          nextArrival,
          crowdLevel: CROWD_CYCLE[(idx + 1) % 4],
          sunAnalysis,
          boardingStop,
          alightingStop,
          steps: buildSteps(origin, destination, lineA, boardingStop, alightingStop, nextArrival, estimatedDuration),
        });
        if (results.length >= 5) break outer;
      }
    }
  }

  if (results.length === 0) {
    IZMIR_ROUTES.slice(0, 4).forEach((r, i) => {
      const nextArrival = getNextArrivalMins(r.lineNumber);
      const estimatedDuration = Math.round(distKm * 5 + 10 + i * 5);
      const board = originStops[0];
      const alight = destStops[0];
      results.push({
        id: `fallback-${r.id}`,
        lineNumber: r.lineNumber,
        lineName: r.lineName,
        estimatedDuration,
        transfers: [],
        nextArrival,
        crowdLevel: CROWD_CYCLE[i % 4],
        sunAnalysis,
        boardingStop: board,
        alightingStop: alight,
        steps: board && alight ? buildSteps(origin, destination, r.lineNumber, board, alight, nextArrival, estimatedDuration) : undefined,
      });
    });
  }

  const h = new Date().getHours();
  const isNight = h >= 22 || h < 6;
  if (isNight) {
    const crowdW: Record<CrowdLevel, number> = { very_high: 3, high: 2, medium: 1, low: 0 };
    results.sort((a, b) => {
      const td = a.transfers.length - b.transfers.length;
      return td !== 0 ? td : crowdW[b.crowdLevel] - crowdW[a.crowdLevel];
    });
  }

  return results;
}

export function sortRoutes(routes: Route[], mode: RouteFilterMode, comfortMap?: Map<string, number>): Route[] {
  const arr = [...routes];
  switch (mode) {
    case 'fastest':
      return arr.sort((a, b) => a.estimatedDuration - b.estimatedDuration);
    case 'least_transfers':
      return arr.sort((a, b) => a.transfers.length - b.transfers.length);
    case 'comfortable':
    case 'cool':
      return arr.sort((a, b) => {
        const sa = comfortMap?.get(a.lineNumber) ?? 0;
        const sb = comfortMap?.get(b.lineNumber) ?? 0;
        return sb - sa;
      });
    case 'night_safe': {
      const crowdW: Record<CrowdLevel, number> = { very_high: 3, high: 2, medium: 1, low: 0 };
      return arr.sort((a, b) => {
        const td = a.transfers.length - b.transfers.length;
        return td !== 0 ? td : crowdW[b.crowdLevel] - crowdW[a.crowdLevel];
      });
    }
    default:
      return arr;
  }
}
