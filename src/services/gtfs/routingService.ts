import type { Route, Location, CrowdLevel, RouteStop, RouteStep, RouteFilterMode } from '../../types';
import {
  findBoardAlightPair,
  getLinesNearOrigin,
  getOrderedStopsForDir,
  getRouteName,
} from '../../data/gtfsData';
import { analyzeSunExposureAlongRoute } from '../sun/sunAnalysis';
import { getNextArrivalMins } from '../firebase/scheduleService';
import { getApproachingBuses, nearestIztekStopId, minsFromRemainingStops } from '../iztek/iztekService';

const CROWD_CYCLE: CrowdLevel[] = ['low', 'medium', 'high', 'very_high'];
const MAX_WALK_KM = 1.5;

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
    Math.cos((b.lat * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

function walkCalc(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): { mins: number; meters: number } {
  const meters = Math.round(
    haversineKm({ lat: from.latitude, lon: from.longitude }, { lat: to.latitude, lon: to.longitude }) * 1000
  );
  return { meters, mins: Math.max(1, Math.round(meters / 84)) };
}

function intermediateStops(
  lineNum: string,
  dir: 0 | 1,
  boardId: string,
  alightId: string
): Array<{ name: string; latitude: number; longitude: number }> {
  const ordered = getOrderedStopsForDir(lineNum, dir);
  const boardI = ordered.findIndex(s => s.id === boardId);
  const alightI = ordered.findIndex(s => s.id === alightId);
  if (boardI < 0 || alightI < 0 || alightI <= boardI) return [];
  return ordered.slice(boardI + 1, alightI).map(s => ({
    name: s.name,
    latitude: s.lat,
    longitude: s.lon,
  }));
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
      haversineKm(
        { lat: chain[i].latitude, lon: chain[i].longitude },
        { lat: chain[i + 1].latitude, lon: chain[i + 1].longitude }
      ) * 1000
    );
  }
  const durationMins = Math.max(2, Math.round((totalMeters / 1000 / 22) * 60) + midStops.length);
  return { distanceMeters: totalMeters, durationMins };
}

function buildSteps(
  origin: Location,
  destination: Location,
  lineNum: string,
  dir: 0 | 1,
  board: RouteStop,
  alight: RouteStop,
  nextArrivalMins: number
): RouteStep[] {
  const toBoard = walkCalc(origin, board);
  const fromAlight = walkCalc(alight, destination);
  const midStops = intermediateStops(lineNum, dir, board.id, alight.id);
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

function sunAnalysisForSteps(steps: RouteStep[], origin: Location, destination: Location) {
  const transit = steps.find(s => s.type === 'transit');
  const waypoints: Array<{ latitude: number; longitude: number }> = transit?.boardStop
    ? [transit.boardStop, ...(transit.intermediateStops ?? []), transit.alightStop!]
    : [origin, destination];
  return analyzeSunExposureAlongRoute(waypoints, new Date());
}

async function liveNextArrival(lineNum: string, lat: number, lon: number): Promise<number> {
  const iztekId = nearestIztekStopId(lat, lon);
  if (iztekId) {
    try {
      const buses = await getApproachingBuses(iztekId);
      const match = buses.find(b => String(b.hatNumarasi) === lineNum);
      if (match) return minsFromRemainingStops(match.kalanDurakSayisi);
    } catch {}
  }
  return getNextArrivalMins(lineNum);
}

const MAX_TRANSFER_WALK_KM = 0.6;

async function findTransferRoutes(origin: Location, destination: Location): Promise<Route[]> {
  const results: Route[] = [];
  const line1Candidates = getLinesNearOrigin(
    { lat: origin.latitude, lon: origin.longitude },
    MAX_WALK_KM
  );

  for (const line1 of line1Candidates) {
    if (results.length >= 3) break;
    const name1 = getRouteName(line1);
    if (!name1) continue;

    const pair1 = findBoardAlightPair(
      line1,
      { lat: origin.latitude, lon: origin.longitude },
      { lat: destination.latitude, lon: destination.longitude }
    );
    if (!pair1) continue;

    const transferOrigin = { lat: pair1.alight.lat, lon: pair1.alight.lon };
    const line2Candidates = getLinesNearOrigin(transferOrigin, MAX_TRANSFER_WALK_KM);

    for (const line2 of line2Candidates) {
      if (line2 === line1 || results.length >= 3) break;
      const name2 = getRouteName(line2);
      if (!name2) continue;

      const pair2 = findBoardAlightPair(
        line2,
        transferOrigin,
        { lat: destination.latitude, lon: destination.longitude }
      );
      if (!pair2) continue;

      const alightWalk = haversineKm(
        { lat: destination.latitude, lon: destination.longitude },
        { lat: pair2.alight.lat, lon: pair2.alight.lon }
      );
      if (alightWalk > MAX_WALK_KM) continue;

      const board1: RouteStop = { id: pair1.board.id, name: pair1.board.name, latitude: pair1.board.lat, longitude: pair1.board.lon };
      const alight1: RouteStop = { id: pair1.alight.id, name: pair1.alight.name, latitude: pair1.alight.lat, longitude: pair1.alight.lon };
      const board2: RouteStop = { id: pair2.board.id, name: pair2.board.name, latitude: pair2.board.lat, longitude: pair2.board.lon };
      const alight2: RouteStop = { id: pair2.alight.id, name: pair2.alight.name, latitude: pair2.alight.lat, longitude: pair2.alight.lon };

      const transferWalkKm = haversineKm(
        { lat: alight1.latitude, lon: alight1.longitude },
        { lat: board2.latitude, lon: board2.longitude }
      );
      const transferWalkMins = Math.round(transferWalkKm * 12);

      const arr1 = await liveNextArrival(line1, pair1.board.lat, pair1.board.lon);
      const arr2 = await liveNextArrival(line2, pair2.board.lat, pair2.board.lon);
      const steps1 = buildSteps(origin, { name: alight1.name, latitude: alight1.latitude, longitude: alight1.longitude }, line1, pair1.dir, board1, alight1, arr1);
      const midDest: Location = { name: board2.name, latitude: board2.latitude, longitude: board2.longitude };
      const steps2 = buildSteps(midDest, destination, line2, pair2.dir, board2, alight2, arr2);

      const totalDuration = steps1.reduce((s, st) => s + st.durationMins, 0)
        + transferWalkMins
        + steps2.reduce((s, st) => s + st.durationMins, 0);

      results.push({
        id: `transfer-${line1}-${line2}-${pair1.dir}`,
        lineNumber: line1,
        lineName: `${name1} → ${name2}`,
        estimatedDuration: totalDuration,
        transfers: [{ lineNumber: line2, lineName: name2, boardStop: board2, alightStop: alight2, walkMins: transferWalkMins }],
        nextArrival: arr1,
        crowdLevel: 'low',
        sunAnalysis: sunAnalysisForSteps(steps1, origin, destination),
        boardingStop: board1,
        alightingStop: alight2,
        steps: [...steps1, ...steps2],
      });
    }
  }
  return results;
}

export async function findRoutes(origin: Location, destination: Location): Promise<Route[]> {
  const candidateLines = getLinesNearOrigin(
    { lat: origin.latitude, lon: origin.longitude },
    MAX_WALK_KM
  );

  const results: Route[] = [];

  for (const lineNum of candidateLines) {
    const name = getRouteName(lineNum);
    if (!name) continue;

    const pair = findBoardAlightPair(
      lineNum,
      { lat: origin.latitude, lon: origin.longitude },
      { lat: destination.latitude, lon: destination.longitude }
    );
    if (!pair) continue;

    const boardWalk = haversineKm(
      { lat: origin.latitude, lon: origin.longitude },
      { lat: pair.board.lat, lon: pair.board.lon }
    );
    const alightWalk = haversineKm(
      { lat: destination.latitude, lon: destination.longitude },
      { lat: pair.alight.lat, lon: pair.alight.lon }
    );
    if (boardWalk > MAX_WALK_KM || alightWalk > MAX_WALK_KM) continue;

    const boardStop: RouteStop = {
      id: pair.board.id,
      name: pair.board.name,
      latitude: pair.board.lat,
      longitude: pair.board.lon,
    };
    const alightStop: RouteStop = {
      id: pair.alight.id,
      name: pair.alight.name,
      latitude: pair.alight.lat,
      longitude: pair.alight.lon,
    };

    const nextArrival = await liveNextArrival(lineNum, pair.board.lat, pair.board.lon);
    const steps = buildSteps(origin, destination, lineNum, pair.dir, boardStop, alightStop, nextArrival);
    const estimatedDuration = steps.reduce((s, st) => s + st.durationMins, 0);

    results.push({
      id: `direct-${lineNum}-${pair.dir}`,
      lineNumber: lineNum,
      lineName: name,
      estimatedDuration,
      transfers: [],
      nextArrival,
      crowdLevel: CROWD_CYCLE[results.length % 4],
      sunAnalysis: sunAnalysisForSteps(steps, origin, destination),
      boardingStop: boardStop,
      alightingStop: alightStop,
      steps,
    });

    if (results.length >= 5) break;
  }

  results.sort((a, b) => {
    const wa = a.boardingStop
      ? haversineKm({ lat: origin.latitude, lon: origin.longitude }, { lat: a.boardingStop.latitude, lon: a.boardingStop.longitude })
      : 99;
    const wb = b.boardingStop
      ? haversineKm({ lat: origin.latitude, lon: origin.longitude }, { lat: b.boardingStop.latitude, lon: b.boardingStop.longitude })
      : 99;
    return wa - wb;
  });

  if (results.length < 3) {
    try {
      const transfers = await findTransferRoutes(origin, destination);
      for (const tr of transfers) {
        if (!results.find(r => r.id === tr.id)) results.push(tr);
      }
    } catch {}
  }

  return results;
}

export function sortRoutes(routes: Route[], mode: RouteFilterMode): Route[] {
  switch (mode) {
    case 'fastest':
      return [...routes].sort((a, b) => a.estimatedDuration - b.estimatedDuration);
    case 'comfortable':
      return [...routes].sort((a, b) => {
        const crowdOrder: Record<CrowdLevel, number> = { low: 0, medium: 1, high: 2, very_high: 3 };
        return crowdOrder[a.crowdLevel] - crowdOrder[b.crowdLevel];
      });
    case 'cool': {
      return [...routes].sort((a, b) => {
        const la = a.sunAnalysis?.leftPercentage ?? 50;
        const lb = b.sunAnalysis?.leftPercentage ?? 50;
        return Math.abs(la - 50) - Math.abs(lb - 50);
      });
    }
    case 'least_transfers':
      return [...routes].sort((a, b) => a.transfers.length - b.transfers.length);
    case 'night_safe':
      return [...routes];
    default:
      return routes;
  }
}
