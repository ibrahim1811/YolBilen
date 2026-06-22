import type { Route, Location, CrowdLevel, RouteStop, RouteStep, RouteFilterMode } from '../../types';
import { IZMIR_ROUTES } from '../../data/izmir-routes';
import { getStops, getStopRouteDirs, getOrderedStopsForDir } from '../../data/gtfsData';
import { analyzeSunExposureAlongRoute } from '../sun/sunAnalysis';
import { getNextArrivalMins } from '../firebase/scheduleService';
import { getApproachingBuses, nearestIztekStopId, minsFromRemainingStops } from '../iztek/iztekService';

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

function intermediateStops(
  lineNum: string,
  board: { latitude: number; longitude: number },
  alight: { latitude: number; longitude: number }
): Array<{ name: string; latitude: number; longitude: number }> {
  const d0 = getOrderedStopsForDir(lineNum, 0);
  const d1 = getOrderedStopsForDir(lineNum, 1);
  const seen0ids = new Set(d0.map((s: { id: string }) => s.id));
  const all = [...d0, ...d1.filter((s: { id: string }) => !seen0ids.has(s.id))];
  const dx = alight.longitude - board.longitude;
  const dy = alight.latitude - board.latitude;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return [];
  const seen = new Set<string>();
  return all
    .map(s => ({
      name: s.name,
      latitude: s.lat,
      longitude: s.lon,
      t: ((s.lon - board.longitude) * dx + (s.lat - board.latitude) * dy) / len2,
    }))
    .filter(s => s.t > 0.05 && s.t < 0.95)
    .sort((a, b) => a.t - b.t)
    .slice(0, 40)
    .filter(s => { const k = s.name.trim(); return seen.has(k) ? false : (seen.add(k), true); })
    .map(({ name, latitude, longitude }) => ({ name, latitude, longitude }));
}

function calcTransitDetails(
  board: { latitude: number; longitude: number },
  alight: { latitude: number; longitude: number },
  midStops: Array<{ latitude: number; longitude: number }>
): { distanceMeters: number; durationMins: number } {
  const chain = [board, ...midStops, alight];
  let totalMeters = 0;
  for (let i = 0; i < chain.length - 1; i++) {
    totalMeters += Math.round(
      haversineKm({ lat: chain[i].latitude, lon: chain[i].longitude }, { lat: chain[i + 1].latitude, lon: chain[i + 1].longitude }) * 1000
    );
  }
  // ~22 km/h ortalama şehir içi hız + durak başına ~0.5 dk bekleme
  const durationMins = Math.max(2, Math.round((totalMeters / 1000 / 22) * 60) + midStops.length);
  return { distanceMeters: totalMeters, durationMins };
}

function buildSteps(
  origin: Location,
  destination: Location,
  lineNum: string,
  board: RouteStop,
  alight: RouteStop,
  nextArrivalMins: number
): RouteStep[] {
  const toBoard = walkCalc(origin, board);
  const fromAlight = walkCalc(alight, destination);
  const midStops = intermediateStops(lineNum, board, alight);
  const { distanceMeters: transitDist, durationMins: transitDur } = calcTransitDetails(board, alight, midStops);
  const now = new Date();
  const depMins = now.getHours() * 60 + now.getMinutes() + nextArrivalMins;
  const dh = Math.floor(depMins / 60) % 24;
  const dm = depMins % 60;
  const departureTime = `${String(dh).padStart(2, '0')}:${String(dm).padStart(2, '0')}`;
  return [
    { type: 'walk', durationMins: toBoard.mins, toStopName: board.name, distanceMeters: toBoard.meters },
    {
      type: 'transit',
      durationMins: transitDur,
      distanceMeters: transitDist,
      lineNumber: lineNum,
      boardStop: { name: board.name, latitude: board.latitude, longitude: board.longitude },
      alightStop: { name: alight.name, latitude: alight.latitude, longitude: alight.longitude },
      intermediateStops: midStops,
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
  const sr = getStopRouteDirs();
  const map = new Map<string, RouteStop>();
  for (const stop of stops) {
    for (const { lineNum } of sr[stop.id] ?? []) {
      if (!map.has(lineNum)) map.set(lineNum, stop);
    }
  }
  return map;
}

function routeMeta(lineNumber: string) {
  return IZMIR_ROUTES.find(r => r.lineNumber === lineNumber);
}

function sunAnalysisForSteps(steps: import('../../types').RouteStep[], origin: Location, destination: Location) {
  const transit = steps.find(s => s.type === 'transit');
  const waypoints: Array<{ latitude: number; longitude: number }> = transit?.boardStop
    ? [
        transit.boardStop,
        ...(transit.intermediateStops ?? []),
        transit.alightStop!,
      ]
    : [origin, destination];
  return analyzeSunExposureAlongRoute(waypoints, new Date());
}

async function liveNextArrival(lineNum: string, boardLat: number, boardLon: number): Promise<number> {
  const iztekId = nearestIztekStopId(boardLat, boardLon);
  if (iztekId) {
    try {
      const buses = await getApproachingBuses(iztekId);
      const match = buses.find(b => String(b.hatNumarasi) === lineNum);
      if (match) return minsFromRemainingStops(match.kalanDurakSayisi);
    } catch {}
  }
  return getNextArrivalMins(lineNum);
}

export async function findRoutes(origin: Location, destination: Location): Promise<Route[]> {
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
    const nextArrival = await liveNextArrival(lineNum, boardingStop.latitude, boardingStop.longitude);
    const steps = buildSteps(origin, destination, lineNum, boardingStop, alightingStop, nextArrival);
    const estimatedDuration = steps.reduce((s, st) => s + st.durationMins, 0);
    results.push({
      id: `direct-${lineNum}`,
      lineNumber: lineNum,
      lineName: meta.lineName,
      estimatedDuration,
      transfers: [],
      nextArrival,
      crowdLevel: CROWD_CYCLE[idx % 4],
      sunAnalysis: sunAnalysisForSteps(steps, origin, destination),
      boardingStop,
      alightingStop,
      steps,
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
        const nextArrival = await liveNextArrival(lineA, boardingStop.latitude, boardingStop.longitude);
        const steps = buildSteps(origin, destination, lineA, boardingStop, alightingStop, nextArrival);
        const estimatedDuration = steps.reduce((s, st) => s + st.durationMins, 0) + 5;
        results.push({
          id: `transfer-${lineA}-${lineB}`,
          lineNumber: lineA,
          lineName: metaA.lineName,
          estimatedDuration,
          transfers: [{ lineNumber: lineB, stopName: 'Aktarma Durağı', waitTime: 5 }],
          nextArrival,
          crowdLevel: CROWD_CYCLE[(idx + 1) % 4],
          sunAnalysis: sunAnalysisForSteps(steps, origin, destination),
          boardingStop,
          alightingStop,
          steps,
        });
        if (results.length >= 5) break outer;
      }
    }
  }

  if (results.length === 0) {
    for (const [i, r] of IZMIR_ROUTES.slice(0, 4).entries()) {
      const nextArrival = await liveNextArrival(r.lineNumber, originStops[0]?.latitude ?? origin.latitude, originStops[0]?.longitude ?? origin.longitude);
      const board = originStops[0];
      const alight = destStops[0];
      const steps = board && alight ? buildSteps(origin, destination, r.lineNumber, board, alight, nextArrival) : undefined;
      const estimatedDuration = steps ? steps.reduce((s, st) => s + st.durationMins, 0) : Math.round(distKm * 5 + 10 + i * 5);
      results.push({
        id: `fallback-${r.id}`,
        lineNumber: r.lineNumber,
        lineName: r.lineName,
        estimatedDuration,
        transfers: [],
        nextArrival,
        crowdLevel: CROWD_CYCLE[i % 4],
        sunAnalysis: steps ? sunAnalysisForSteps(steps, origin, destination) : analyzeSunExposureAlongRoute([origin, destination], new Date()),
        boardingStop: board,
        alightingStop: alight,
        steps,
      });
    }
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
