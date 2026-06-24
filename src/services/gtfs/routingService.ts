import type { Route, Location, CrowdLevel, RouteStop, RouteStep, RouteFilterMode, SunAnalysis } from '../../types';
import {
  findBoardAlightPair,
  getLinesNearOrigin,
  getOrderedStopsForDir,
  getRouteName,
  clearLinesNearCache,
} from '../../data/gtfsData';
import { getCachedSunAnalysis } from '../sun/sunCache';
import { getNextArrivalMins } from '../firebase/scheduleService';
import { getApproachingBuses, nearestIztekStopId, bestIztekStopId, minsFromRemainingStops } from '../iztek/iztekService';
import { hasSchedule } from '../../data/scheduleData';

const WALK_NORMAL_M = 700;
const WALK_EXTENDED_M = 1200;
const TRANSFER_WALK_M = 600;

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

function sunAnalysisForSteps(
  steps: RouteStep[],
  origin: Location,
  destination: Location,
  lineNum: string,
  dir: 0 | 1
): SunAnalysis {
  const transit = steps.find(s => s.type === 'transit');
  const waypoints: Array<{ latitude: number; longitude: number }> = transit?.boardStop
    ? [transit.boardStop, ...(transit.intermediateStops ?? []), transit.alightStop!]
    : [origin, destination];
  return getCachedSunAnalysis(lineNum, dir, waypoints, new Date());
}

async function liveNextArrival(
  lineNum: string,
  lat: number,
  lon: number,
  dir: 0 | 1,
  boardStopId?: string
): Promise<number> {
  const iztekId = boardStopId
    ? bestIztekStopId(lat, lon, lineNum, dir, boardStopId)
    : nearestIztekStopId(lat, lon);
  if (iztekId) {
    try {
      const buses = await getApproachingBuses(iztekId, dir);
      const match = buses.find(b => String(b.hatNumarasi) === lineNum);
      if (match) return minsFromRemainingStops(match.kalanDurakSayisi);
    } catch {}
  }
  return getNextArrivalMins(lineNum);
}

// getBusCard plate-based — hat numarasından plaka bilinmez; saat bazlı heuristik kullan
function getCrowdLevel(): CrowdLevel {
  const hour = new Date().getHours();
  if ((hour >= 7 && hour < 9) || (hour >= 17 && hour < 19)) return 'high';
  if ((hour >= 9 && hour < 17) || (hour >= 19 && hour < 21)) return 'medium';
  return 'low';
}

function calcRouteScore(
  estimatedDuration: number,
  walkMeters: number,
  transferCount: number,
  crowdLevel: CrowdLevel,
  sunAnalysis: SunAnalysis | undefined
): number {
  const crowdPenalty: Record<CrowdLevel, number> = { low: 0, medium: 5, high: 15, very_high: 30 };
  const sunPenalty = sunAnalysis
    ? Math.max(sunAnalysis.leftPercentage, sunAnalysis.rightPercentage) - 50
    : 0;
  return (
    estimatedDuration * 0.4 +
    (walkMeters / 1000) * 20 * 0.2 +
    transferCount * 15 * 0.2 +
    crowdPenalty[crowdLevel] * 0.1 +
    Math.max(0, sunPenalty) * 0.1
  );
}

function calcConfidence(hasLiveData: boolean, totalReports: number): number {
  let score = 30; // GTFS her zaman mevcut
  if (hasLiveData) score += 40;
  if (totalReports >= 10) score += 30;
  else if (totalReports >= 3) score += 15;
  return Math.min(100, score);
}

export async function findRoutes(
  origin: Location,
  destination: Location,
  options: { allowLongWalk?: boolean } = {}
): Promise<Route[]> {
  const maxWalkM = options.allowLongWalk ? WALK_EXTENDED_M : WALK_NORMAL_M;
  const maxWalkKm = maxWalkM / 1000;

  const candidateLines = getLinesNearOrigin(
    { lat: origin.latitude, lon: origin.longitude },
    maxWalkKm
  );

  const pairs = candidateLines.map(lineNum => ({
    lineNum,
    name: getRouteName(lineNum),
    pair: findBoardAlightPair(
      lineNum,
      { lat: origin.latitude, lon: origin.longitude },
      { lat: destination.latitude, lon: destination.longitude }
    ),
  })).filter(x => x.name && x.pair);

  const valid = pairs.filter(({ pair }) => {
    const boardWalkM = haversineKm(
      { lat: origin.latitude, lon: origin.longitude },
      { lat: pair!.board.lat, lon: pair!.board.lon }
    ) * 1000;
    const alightWalkM = haversineKm(
      { lat: destination.latitude, lon: destination.longitude },
      { lat: pair!.alight.lat, lon: pair!.alight.lon }
    ) * 1000;
    return boardWalkM <= maxWalkM && alightWalkM <= maxWalkM;
  }).slice(0, 5);

  const crowdLevels = valid.map(({ lineNum }) => getCrowdLevel());
  const arrivals = await Promise.all(valid.map(({ pair, lineNum }) =>
    liveNextArrival(lineNum, pair!.board.lat, pair!.board.lon, pair!.dir, pair!.board.id)
  ));

  const results: Route[] = [];

  valid.forEach(({ lineNum, name, pair }, i) => {
    const nextArrival = arrivals[i];
    const crowdLevel = crowdLevels[i];
    const hasLiveData = nextArrival < 999 && nextArrival > 0;

    const boardStop: RouteStop = {
      id: pair!.board.id,
      name: pair!.board.name,
      latitude: pair!.board.lat,
      longitude: pair!.board.lon,
    };
    const alightStop: RouteStop = {
      id: pair!.alight.id,
      name: pair!.alight.name,
      latitude: pair!.alight.lat,
      longitude: pair!.alight.lon,
    };

    const steps = buildSteps(origin, destination, lineNum, pair!.dir, boardStop, alightStop, nextArrival);
    const estimatedDuration = steps.reduce((s, st) => s + st.durationMins, 0);
    const walkMeters = steps.filter(s => s.type === 'walk').reduce((s, st) => s + (st.distanceMeters ?? 0), 0);
    const sunAnalysis = sunAnalysisForSteps(steps, origin, destination, lineNum, pair!.dir);
    const score = calcRouteScore(estimatedDuration, walkMeters, 0, crowdLevel, sunAnalysis);
    const confidence = calcConfidence(hasLiveData, 0);

    results.push({
      id: `direct-${lineNum}-${pair!.dir}`,
      lineNumber: lineNum,
      lineName: name!,
      estimatedDuration,
      transfers: [],
      nextArrival,
      crowdLevel,
      sunAnalysis,
      boardingStop: boardStop,
      alightingStop: alightStop,
      steps,
      score,
      confidence,
      hasIncompleteData: !hasSchedule(lineNum),
    });
  });

  results.sort((a, b) => (a.score ?? 99) - (b.score ?? 99));

  if (results.length < 3) {
    try {
      const transfers = await findTransferRoutes(origin, destination);
      for (const tr of transfers) {
        if (!results.find(r => r.id === tr.id)) results.push(tr);
      }
    } catch {}
  }

  clearLinesNearCache();
  return results;
}

async function findTransferRoutes(origin: Location, destination: Location): Promise<Route[]> {
  const results: Route[] = [];
  const line1Candidates = getLinesNearOrigin(
    { lat: origin.latitude, lon: origin.longitude },
    WALK_NORMAL_M / 1000
  );

  for (const line1 of line1Candidates) {
    if (results.length >= 3) break;
    const name1 = getRouteName(line1);
    if (!name1) continue;

    // Her iki yönü dene — yanlış yön seçimini önler
    for (const dir1 of [0, 1] as (0 | 1)[]) {
    if (results.length >= 3) break;

    const line1Stops = getOrderedStopsForDir(line1, dir1);
    if (line1Stops.length < 2) continue;

    // origin'e en yakın durak
    let boardIdx = 0;
    let boardDist = haversineKm({ lat: origin.latitude, lon: origin.longitude }, { lat: line1Stops[0].lat, lon: line1Stops[0].lon });
    for (let i = 1; i < line1Stops.length; i++) {
      const d = haversineKm({ lat: origin.latitude, lon: origin.longitude }, { lat: line1Stops[i].lat, lon: line1Stops[i].lon });
      if (d < boardDist) { boardDist = d; boardIdx = i; }
    }
    if (boardDist * 1000 > WALK_NORMAL_M) continue;

    const board1Stop = line1Stops[boardIdx];

    for (let midIdx = boardIdx + 2; midIdx < line1Stops.length; midIdx++) {
      if (results.length >= 3) break;
      const midStop = line1Stops[midIdx];

      // Destination'a doğru ilerliyoruz mu kontrol et
      const distToDestFromMid = haversineKm(
        { lat: midStop.lat, lon: midStop.lon },
        { lat: destination.latitude, lon: destination.longitude }
      );
      const distToDestFromBoard = haversineKm(
        { lat: board1Stop.lat, lon: board1Stop.lon },
        { lat: destination.latitude, lon: destination.longitude }
      );
      if (distToDestFromMid >= distToDestFromBoard) continue;

      const line2Candidates = getLinesNearOrigin(
        { lat: midStop.lat, lon: midStop.lon },
        TRANSFER_WALK_M / 1000
      );

      for (const line2 of line2Candidates) {
        if (line2 === line1) continue; // BUG 2 fix: continue, break değil
        if (results.length >= 3) break;
        const name2 = getRouteName(line2);
        if (!name2) continue;

        const pair2 = findBoardAlightPair(
          line2,
          { lat: midStop.lat, lon: midStop.lon },
          { lat: destination.latitude, lon: destination.longitude }
        );
        if (!pair2) continue;

        const alightWalk = haversineKm(
          { lat: destination.latitude, lon: destination.longitude },
          { lat: pair2.alight.lat, lon: pair2.alight.lon }
        );
        if (alightWalk * 1000 > WALK_NORMAL_M) continue;

        const board1: RouteStop = { id: board1Stop.id, name: board1Stop.name, latitude: board1Stop.lat, longitude: board1Stop.lon };
        const alight1: RouteStop = { id: midStop.id, name: midStop.name, latitude: midStop.lat, longitude: midStop.lon };
        const board2: RouteStop = { id: pair2.board.id, name: pair2.board.name, latitude: pair2.board.lat, longitude: pair2.board.lon };
        const alight2: RouteStop = { id: pair2.alight.id, name: pair2.alight.name, latitude: pair2.alight.lat, longitude: pair2.alight.lon };

        const transferWalkKm = haversineKm(
          { lat: alight1.latitude, lon: alight1.longitude },
          { lat: board2.latitude, lon: board2.longitude }
        );
        const transferWalkMins = Math.max(1, Math.round(transferWalkKm * 12));

        const crowd1 = getCrowdLevel();
        const crowd2 = getCrowdLevel();
        const [arr1, arr2] = await Promise.all([
          liveNextArrival(line1, board1Stop.lat, board1Stop.lon, dir1, board1Stop.id),
          liveNextArrival(line2, pair2.board.lat, pair2.board.lon, pair2.dir, pair2.board.id),
        ]);

        // Redundant 0-mesafe yürüyüş adımlarını çıkar
        const steps1Raw = buildSteps(origin, { name: alight1.name, latitude: alight1.latitude, longitude: alight1.longitude }, line1, dir1, board1, alight1, arr1);
        const steps2Raw = buildSteps({ name: board2.name, latitude: board2.latitude, longitude: board2.longitude }, destination, line2, pair2.dir, board2, alight2, arr2);
        const steps1 = steps1Raw.slice(0, -1); // son walk (alight1→alight1) kaldırılır
        const steps2 = steps2Raw.slice(1);     // ilk walk (board2→board2) kaldırılır

        const transferWalkStep: RouteStep = {
          type: 'walk',
          durationMins: transferWalkMins,
          toStopName: board2.name,
          distanceMeters: Math.round(transferWalkKm * 1000),
        };

        const allSteps: RouteStep[] = [...steps1, transferWalkStep, ...steps2];
        const totalDuration = allSteps.reduce((s, st) => s + st.durationMins, 0);
        const walkMeters = allSteps.filter(s => s.type === 'walk').reduce((s, st) => s + (st.distanceMeters ?? 0), 0);

        const crowdLevel: CrowdLevel = crowd1 === 'very_high' || crowd2 === 'very_high' ? 'very_high'
          : crowd1 === 'high' || crowd2 === 'high' ? 'high'
          : crowd1 === 'medium' || crowd2 === 'medium' ? 'medium' : 'low';

        const sunAnalysis = sunAnalysisForSteps(steps1, origin, destination, line1, dir1);
        const score = calcRouteScore(totalDuration, walkMeters, 1, crowdLevel, sunAnalysis);
        const confidence = calcConfidence(arr1 < 999, 0);

        results.push({
          id: `transfer-${line1}-${line2}-${dir1}-${midIdx}`,
          lineNumber: line1,
          lineName: `${name1} → ${name2}`,
          estimatedDuration: totalDuration,
          transfers: [{
            lineNumber: line2,
            lineName: name2,
            boardStop: board2,
            alightStop: alight2,
            walkMins: transferWalkMins,
          }],
          nextArrival: arr1,
          crowdLevel,
          sunAnalysis,
          boardingStop: board1,
          alightingStop: alight2,
          steps: allSteps,
          score,
          confidence,
          hasIncompleteData: !hasSchedule(line1) || !hasSchedule(line2),
        });
        break;
      }
    }
    } // dir1 loop
  }
  return results;
}

export function sortRoutes(routes: Route[], mode: RouteFilterMode): Route[] {
  switch (mode) {
    case 'fastest':
      return [...routes].sort((a, b) => a.estimatedDuration - b.estimatedDuration);
    case 'comfortable': {
      const crowdOrder: Record<CrowdLevel, number> = { low: 0, medium: 1, high: 2, very_high: 3 };
      return [...routes].sort((a, b) => crowdOrder[a.crowdLevel] - crowdOrder[b.crowdLevel]);
    }
    case 'cool':
      // EKSİKLİK 4 fix: en az güneş maruziyeti = en serin
      return [...routes].sort((a, b) => {
        const sunA = a.sunAnalysis ? Math.max(a.sunAnalysis.leftPercentage, a.sunAnalysis.rightPercentage) : 50;
        const sunB = b.sunAnalysis ? Math.max(b.sunAnalysis.leftPercentage, b.sunAnalysis.rightPercentage) : 50;
        return sunA - sunB;
      });
    case 'least_transfers':
      return [...routes].sort((a, b) => a.transfers.length - b.transfers.length);
    case 'night_safe':
      return [...routes].sort((a, b) => {
        const walkA = a.steps?.filter(s => s.type === 'walk').reduce((s, st) => s + (st.distanceMeters ?? 0), 0) ?? 0;
        const walkB = b.steps?.filter(s => s.type === 'walk').reduce((s, st) => s + (st.distanceMeters ?? 0), 0) ?? 0;
        return (a.transfers.length * 1000 + walkA) - (b.transfers.length * 1000 + walkB);
      });
    default:
      return routes;
  }
}
