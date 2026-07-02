import type { Route, Location, CrowdLevel, RouteStop, RouteStep, RouteFilterMode, SunAnalysis, RouteConfidenceDetail } from '../../types';
import {
  findBoardAlightPair,
  getLinesNearOrigin,
  getOrderedStopsForDir,
  getRouteName,
  clearLinesNearCache,
  isRingRoute,
} from '../../data/gtfsData';
import { getCachedSunAnalysis } from '../sun/sunCache';
import { getNextArrivalMins } from '../firebase/scheduleService';
import { getApproachingBuses, nearestIztekStopId, bestIztekStopId, minsFromRemainingStops } from '../iztek/iztekService';
import { hasSchedule } from '../../data/scheduleData';

const WALK_NORMAL_M = 700;

const withTimeout = <T>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([p, new Promise<T>(r => setTimeout(() => r(fallback), ms))]);
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
  if (boardI < 0 || alightI < 0 || boardI === alightI) return [];
  const mid = alightI > boardI
    ? ordered.slice(boardI + 1, alightI)
    : isRingRoute(lineNum)
      ? [...ordered.slice(boardI + 1), ...ordered.slice(0, alightI)] // halka hat: son duraktan sonra başa sarar
      : [];
  return mid.map(s => ({ name: s.name, latitude: s.lat, longitude: s.lon }));
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
  routeKey: string,
  departureMins: number
): SunAnalysis {
  const transitSteps = steps.filter(s => s.type === 'transit');
  const waypoints: Array<{ latitude: number; longitude: number }> = transitSteps.length > 0
    ? transitSteps.flatMap(t => [t.boardStop!, ...(t.intermediateStops ?? []), t.alightStop!])
    : [origin, destination];
  const departureTime = new Date(Date.now() + departureMins * 60000);
  return getCachedSunAnalysis(routeKey, waypoints, departureTime);
}

interface ArrivalEstimate {
  mins: number;
  isLive: boolean; // true: gerçek İZTEK GPS verisi, false: statik tarife tahmini
}

async function liveNextArrival(
  lineNum: string,
  lat: number,
  lon: number,
  dir: 0 | 1,
  boardStopId?: string
): Promise<ArrivalEstimate> {
  const iztekId = boardStopId
    ? bestIztekStopId(lat, lon, lineNum, dir, boardStopId)
    : nearestIztekStopId(lat, lon);
  if (iztekId) {
    try {
      const buses = await withTimeout(getApproachingBuses(iztekId, dir), 3000, []);
      const match = buses.find(b => String(b.hatNumarasi) === lineNum);
      if (match) return { mins: minsFromRemainingStops(match.kalanDurakSayisi), isLive: true };
    } catch {}
  }
  return { mins: getNextArrivalMins(lineNum), isLive: false };
}

// getBusCard plate-based — hat numarasından plaka bilinmez; saat bazlı heuristik kullan
function getCrowdLevel(): CrowdLevel {
  const hour = new Date().getHours();
  if ((hour >= 7 && hour < 9) || (hour >= 17 && hour < 19)) return 'high';
  if ((hour >= 9 && hour < 17) || (hour >= 19 && hour < 21)) return 'medium';
  return 'low';
}

function calcConfidenceDetail(
  hasLiveData: boolean,
  hasScheduleData: boolean,
  boardWalkM: number,
  alightWalkM: number
): RouteConfidenceDetail {
  let score = 0;
  const reasons: string[] = [];

  if (hasLiveData) {
    score += 40;
    reasons.push('Canlı konum verisi mevcut');
  } else {
    reasons.push('Canlı veri yok — tarife kullanıldı');
  }

  if (hasScheduleData) {
    score += 20;
    reasons.push('Sefer tarihi doğrulandı');
  } else {
    reasons.push('Sefer tarihi eksik');
  }

  // Yön her zaman findBoardAlightPair tarafından doğrulanıyor
  score += 20;
  reasons.push('Yön doğrulandı');

  const maxWalk = Math.max(boardWalkM, alightWalkM);
  let stopMatchQuality: 'high' | 'medium' | 'low';
  if (maxWalk < 300) {
    score += 20;
    stopMatchQuality = 'high';
    reasons.push('Durak eşleşmesi mükemmel');
  } else if (maxWalk < 600) {
    score += 10;
    stopMatchQuality = 'medium';
    reasons.push('Durak eşleşmesi iyi');
  } else {
    stopMatchQuality = 'low';
    reasons.push('Durak uzak — yürüyüş gerekli');
  }

  return { score: Math.min(100, score), hasLiveData, hasScheduleData, directionVerified: true, stopMatchQuality, reasons };
}

export async function findRoutes(
  origin: Location,
  destination: Location,
  options: { allowLongWalk?: boolean; filterMode?: RouteFilterMode } = {}
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
    const { mins: nextArrival, isLive: hasLiveData } = arrivals[i];
    const crowdLevel = crowdLevels[i];

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
    const sunAnalysis = sunAnalysisForSteps(
      steps, origin, destination,
      `${lineNum}_${pair!.dir}_${boardStop.id}_${alightStop.id}`,
      nextArrival
    );
    const scheduleOk = hasSchedule(lineNum);
    const boardWalkM = steps[0]?.distanceMeters ?? 0;
    const alightWalkM = steps[steps.length - 1]?.distanceMeters ?? 0;
    const confidenceDetail = calcConfidenceDetail(hasLiveData, scheduleOk, boardWalkM, alightWalkM);

    results.push({
      id: `direct-${lineNum}-${pair!.dir}`,
      lineNumber: lineNum,
      lineName: name!,
      estimatedDuration: steps.reduce((s, st) => s + st.durationMins, 0),
      transfers: [],
      nextArrival,
      crowdLevel,
      sunAnalysis,
      boardingStop: boardStop,
      alightingStop: alightStop,
      steps,
      confidence: confidenceDetail.score,
      confidenceDetail,
      hasIncompleteData: !scheduleOk,
    });
  });

  if (results.length < 3) {
    try {
      const transfers = await findTransferRoutes(origin, destination, maxWalkM);
      for (const tr of transfers) {
        if (!results.find(r => r.id === tr.id)) results.push(tr);
      }
    } catch {}
  }

  clearLinesNearCache();
  return results;
}

async function findTransferRoutes(origin: Location, destination: Location, maxWalkM: number): Promise<Route[]> {
  const results: Route[] = [];
  const line1Candidates = getLinesNearOrigin(
    { lat: origin.latitude, lon: origin.longitude },
    maxWalkM / 1000
  ).slice(0, 10); // en fazla 10 hat dene — daha fazlası azalan kazanım

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
    if (boardDist * 1000 > maxWalkM) continue;

    const board1Stop = line1Stops[boardIdx];

    const midSearchEnd = Math.min(boardIdx + 16, line1Stops.length);
    for (let midIdx = boardIdx + 2; midIdx < midSearchEnd; midIdx++) {
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
        if (alightWalk * 1000 > maxWalkM) continue;

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
        const steps1Raw = buildSteps(origin, { name: alight1.name, latitude: alight1.latitude, longitude: alight1.longitude }, line1, dir1, board1, alight1, arr1.mins);
        const steps2Raw = buildSteps({ name: board2.name, latitude: board2.latitude, longitude: board2.longitude }, destination, line2, pair2.dir, board2, alight2, arr2.mins);
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

        const crowdLevel: CrowdLevel = crowd1 === 'very_high' || crowd2 === 'very_high' ? 'very_high'
          : crowd1 === 'high' || crowd2 === 'high' ? 'high'
          : crowd1 === 'medium' || crowd2 === 'medium' ? 'medium' : 'low';

        const sunAnalysis = sunAnalysisForSteps(
          allSteps, origin, destination,
          `${line1}_${dir1}_${board1.id}_${alight1.id}_${line2}_${pair2.dir}_${board2.id}_${alight2.id}`,
          arr1.mins
        );
        const scheduleOk1 = hasSchedule(line1);
        const scheduleOk2 = hasSchedule(line2);
        const tBoardWalkM = allSteps[0]?.distanceMeters ?? 0;
        const tAlightWalkM = allSteps[allSteps.length - 1]?.distanceMeters ?? 0;
        const confidenceDetail = calcConfidenceDetail(arr1.isLive, scheduleOk1 && scheduleOk2, tBoardWalkM, tAlightWalkM);

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
          nextArrival: arr1.mins,
          crowdLevel,
          sunAnalysis,
          boardingStop: board1,
          alightingStop: alight2,
          steps: allSteps,
          confidence: confidenceDetail.score,
          confidenceDetail,
          hasIncompleteData: !scheduleOk1 || !scheduleOk2,
        });
        break;
      }
    }
    } // dir1 loop
  }
  return results;
}

function getWalkMeters(r: Route): number {
  return r.steps?.filter(s => s.type === 'walk').reduce((s, st) => s + (st.distanceMeters ?? 0), 0) ?? 0;
}

export function sortRoutes(routes: Route[], mode: RouteFilterMode): Route[] {
  switch (mode) {
    case 'fastest':
      return [...routes].sort((a, b) =>
        a.estimatedDuration !== b.estimatedDuration
          ? a.estimatedDuration - b.estimatedDuration
          : getWalkMeters(a) - getWalkMeters(b)
      );
    case 'comfortable': {
      const crowdOrder: Record<CrowdLevel, number> = { low: 0, medium: 1, high: 2, very_high: 3 };
      return [...routes].sort((a, b) => {
        const c = crowdOrder[a.crowdLevel] - crowdOrder[b.crowdLevel];
        return c !== 0 ? c : getWalkMeters(a) - getWalkMeters(b);
      });
    }
    case 'cool':
      return [...routes].sort((a, b) => {
        const sunA = a.sunAnalysis ? Math.max(a.sunAnalysis.leftPercentage, a.sunAnalysis.rightPercentage) : 50;
        const sunB = b.sunAnalysis ? Math.max(b.sunAnalysis.leftPercentage, b.sunAnalysis.rightPercentage) : 50;
        const s = sunA - sunB;
        return s !== 0 ? s : getWalkMeters(a) - getWalkMeters(b);
      });
    case 'least_transfers':
      return [...routes].sort((a, b) => {
        const t = a.transfers.length - b.transfers.length;
        return t !== 0 ? t : getWalkMeters(a) - getWalkMeters(b);
      });
    case 'night_safe':
      return [...routes].sort((a, b) =>
        (a.transfers.length * 1000 + getWalkMeters(a)) - (b.transfers.length * 1000 + getWalkMeters(b))
      );
    default:
      return routes;
  }
}
