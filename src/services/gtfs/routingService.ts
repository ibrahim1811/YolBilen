import type { Route, Location, CrowdLevel, RouteStop, RouteStep, RouteFilterMode, SunAnalysis, RouteConfidenceDetail } from '../../types';
import {
  findBoardAlightPair,
  getLinesNearOrigin,
  getOrderedStopsForDir,
  getRouteName,
  clearLinesNearCache,
  isRingRoute,
  getStopRouteDirs,
  getLineMode,
  getRailArrivalMins,
  getRailRideMins,
  getRouteStopSeqs,
  getBusRideMins,
  getBusOffsetAt,
} from '../../data/gtfsData';
import { getStopIndex } from '../../data/gtfsData';
import { raptorSearch, patternStopsBetween, type RaptorJourney } from './raptor';
import type { Transfer } from '../../types';
import { getCachedSunAnalysis } from '../sun/sunCache';
import { getScheduledArrivalAtStop, NO_SERVICE_MINS } from '../firebase/scheduleService';
import { getApproachingBuses, resolveIztekStopId, estimateArrivalMins, isWaitingAtTerminal } from '../iztek/iztekService';
import { hasSchedule } from '../../data/scheduleData';

const WALK_NORMAL_M = 700;

const withTimeout = <T>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([p, new Promise<T>(r => setTimeout(() => r(fallback), ms))]);
const WALK_EXTENDED_M = 1200;
const FUTURE_SEARCH_THRESHOLD_MS = 10 * 60_000;
const FAR_DEPARTURE_MINS = 120;

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
  const mode = getLineMode(lineNum);
  const { distanceMeters: transitDist, durationMins: busDur } = calcTransitDetails(board, alight, midStops);
  const transitDur = (mode !== 'bus'
    ? getRailRideMins(lineNum, dir, board.id, alight.id)
    : getBusRideMins(lineNum, dir, board.id, alight.id)) || busDur;
  let departureTime: string | undefined;
  let departureMins: number | undefined;
  if (nextArrivalMins < NO_SERVICE_MINS) {
    const now = new Date();
    departureMins = now.getHours() * 60 + now.getMinutes() + nextArrivalMins;
    departureTime = `${String(Math.floor(departureMins / 60) % 24).padStart(2, '0')}:${String(departureMins % 60).padStart(2, '0')}`;
  }
  const dirStops = getOrderedStopsForDir(lineNum, dir);
  const headsign = isRingRoute(lineNum) ? undefined : dirStops[dirStops.length - 1]?.name;
  return [
    { type: 'walk', durationMins: toBoard.mins, toStopName: board.name, distanceMeters: toBoard.meters },
    {
      type: 'transit',
      durationMins: transitDur,
      distanceMeters: transitDist,
      lineNumber: lineNum,
      mode,
      boardStop: { name: board.name, latitude: board.latitude, longitude: board.longitude },
      alightStop: { name: alight.name, latitude: alight.latitude, longitude: alight.longitude },
      intermediateStops: midStops,
      departureTime,
      departureMins,
      headsign,
      dir,
      boardStopId: board.id,
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
): SunAnalysis | undefined {
  const transitSteps = steps.filter(s => s.type === 'transit');
  const waypoints: Array<{ latitude: number; longitude: number }> = transitSteps.length > 0
    ? transitSteps.flatMap(t => [t.boardStop!, ...(t.intermediateStops ?? []), t.alightStop!])
    : [origin, destination];
  const departureTime = new Date(Date.now() + departureMins * 60000);
  return getCachedSunAnalysis(routeKey, waypoints, departureTime) ?? undefined;
}

interface ArrivalEstimate {
  mins: number;
  isLive: boolean; // true: gerçek İZTEK GPS verisi, false: statik tarife tahmini
}

function rideMinsFromTerminal(lineNum: string, dir: 0 | 1, stopId: string): number {
  const planned = getBusOffsetAt(lineNum, dir, stopId);
  if (planned !== null) return planned;
  const ordered = getOrderedStopsForDir(lineNum, dir);
  const idx = ordered.findIndex(s => s.id === stopId);
  if (idx <= 0) return 0;
  const chain = ordered.slice(0, idx + 1).map(s => ({ latitude: s.lat, longitude: s.lon }));
  return calcTransitDetails(chain[0], chain[chain.length - 1], chain.slice(1, -1)).durationMins;
}

// Durağın bulunduğu yön(ler)e göre tarifeden en yakın geliş; bugün sefer yoksa null.
export function getScheduledArrivalForStopId(lineNum: string, stopId: string, afterMins = 0): number | null {
  const dirs = (getStopRouteDirs()[stopId] ?? []).filter(d => d.lineNum === lineNum).map(d => d.dir);
  const isRail = getLineMode(lineNum) !== 'bus';
  const results = dirs
    .map(dir => isRail
      ? getRailArrivalMins(lineNum, dir, stopId, afterMins)
      : getScheduledArrivalAtStop(lineNum, dir, rideMinsFromTerminal(lineNum, dir, stopId), afterMins))
    .filter((m): m is number => m !== null);
  return results.length > 0 ? Math.min(...results) : null;
}

// afterMins: yürüyerek/aktarmayla durağa varmadan önce gelen otobüsler atlanır.
async function nextArrival(
  lineNum: string,
  dir: 0 | 1,
  board: { id: string; lat: number; lon: number },
  afterMins: number
): Promise<ArrivalEstimate> {
  // İZTEK canlı verisi yalnızca ESHOT otobüsleri için; raylı sistem ve vapurda tarife kullanılır.
  if (getLineMode(lineNum) !== 'bus') {
    return { mins: getRailArrivalMins(lineNum, dir, board.id, afterMins) ?? NO_SERVICE_MINS, isLive: false };
  }
  const iztekId = resolveIztekStopId(board.id, board.lat, board.lon);
  if (iztekId) {
    try {
      const buses = await withTimeout(getApproachingBuses(iztekId), 3000, []);
      const etas = buses
        .filter(b => String(b.hatNumarasi) === lineNum && !isWaitingAtTerminal(b, board.id))
        .map(b => estimateArrivalMins(b, board.id))
        .filter(m => m >= afterMins)
        .sort((x, y) => x - y);
      if (etas.length > 0) return { mins: etas[0], isLive: true };
    } catch (e) {
      console.warn('[nextArrival] canlı veri alınamadı, tarifeye düşülüyor:', e);
    }
  }
  const scheduled = getScheduledArrivalAtStop(lineNum, dir, rideMinsFromTerminal(lineNum, dir, board.id), afterMins);
  return { mins: scheduled ?? NO_SERVICE_MINS, isLive: false };
}

function lineHasSchedule(lineNum: string): boolean {
  return getLineMode(lineNum) !== 'bus' || hasSchedule(lineNum);
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
  options: { allowLongWalk?: boolean; filterMode?: RouteFilterMode; departAt?: Date } = {}
): Promise<Route[]> {
  const maxWalkM = options.allowLongWalk ? WALK_EXTENDED_M : WALK_NORMAL_M;
  const maxWalkKm = maxWalkM / 1000;

  // İleri bir saat için canlı veri anlamsız: yalnızca tarife tabanlı arama
  if (options.departAt && options.departAt.getTime() - Date.now() > FUTURE_SEARCH_THRESHOLD_MS) {
    return findMultiLegRoutes(origin, destination, Math.max(maxWalkM, 1000), options.departAt);
  }

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

  const ranked = pairs
    .map(x => ({
      ...x,
      boardWalkM: haversineKm(
        { lat: origin.latitude, lon: origin.longitude },
        { lat: x.pair!.board.lat, lon: x.pair!.board.lon }
      ) * 1000,
      alightWalkM: haversineKm(
        { lat: destination.latitude, lon: destination.longitude },
        { lat: x.pair!.alight.lat, lon: x.pair!.alight.lon }
      ) * 1000,
    }))
    .filter(x => x.boardWalkM <= maxWalkM && x.alightWalkM <= maxWalkM)
    .sort((a, b) => (a.boardWalkM + a.alightWalkM) - (b.boardWalkM + b.alightWalkM));
  // Otobüs durakları çok daha sık olduğu için raylı/vapur adayları ayrı kontenjanla eklenir, yoksa hep elenirler.
  const valid = [
    ...ranked.filter(x => getLineMode(x.lineNum) === 'bus').slice(0, 5),
    ...ranked.filter(x => getLineMode(x.lineNum) !== 'bus').slice(0, 3),
  ];

  const crowdLevels = valid.map(() => getCrowdLevel());
  const arrivals = await Promise.all(valid.map(({ pair, lineNum }) =>
    nextArrival(lineNum, pair!.dir, pair!.board, walkCalc(origin, { latitude: pair!.board.lat, longitude: pair!.board.lon }).mins)
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
    for (const s of steps) if (s.type === 'transit') s.isLive = hasLiveData;
    const sunAnalysis = sunAnalysisForSteps(
      steps, origin, destination,
      `${lineNum}_${pair!.dir}_${boardStop.id}_${alightStop.id}`,
      nextArrival >= NO_SERVICE_MINS ? 0 : nextArrival
    );
    const scheduleOk = lineHasSchedule(lineNum);
    const boardWalkM = steps[0]?.distanceMeters ?? 0;
    const alightWalkM = steps[steps.length - 1]?.distanceMeters ?? 0;
    const confidenceDetail = calcConfidenceDetail(hasLiveData, scheduleOk, boardWalkM, alightWalkM);

    results.push({
      id: `direct-${lineNum}-${pair!.dir}`,
      lineNumber: lineNum,
      lineName: name!,
      mode: getLineMode(lineNum),
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

  try {
    const directLines = new Set(results.map(r => r.lineNumber));
    const multi = findMultiLegRoutes(origin, destination, Math.max(maxWalkM, 1000))
      // Tek araçlı sonuç zaten canlı veriyle direkt rotalarda varsa tekrar ekleme
      .filter(m => !(m.transfers.length === 0 && directLines.has(m.lineNumber)));
    const refined = await Promise.all(multi.map(m => (m.isNextDay ? m : retimeWithLive(m))));
    // Yeniden zamanlamada iki seçenek aynı sefere düşebilir
    const seenTimed = new Set<string>();
    for (const r of refined) {
      const sig = (r.steps ?? []).filter(s => s.type === 'transit').map(s => `${s.lineNumber}@${s.departureMins}`).join('-');
      if (seenTimed.has(sig)) continue;
      seenTimed.add(sig);
      results.push(r);
    }
  } catch (e) {
    console.warn('[findRoutes] çok aktarmalı rota aranamadı:', e);
  }

  const walk = walkOnlyRoute(origin, destination);
  if (walk) results.push(walk);

  clearLinesNearCache();
  // Bugün seferi kalmamış direkt hatlar, başka seçenek varsa listeyi kirletmesin
  const withService = results.filter(r => r.isWalkOnly || r.nextArrival < NO_SERVICE_MINS);
  const final = withService.length > 0 ? withService : results;
  // Bu akşam için gerçek bir seçenek varsa ertesi sabahın seçenekleri gösterilmez
  const hasToday = final.some(r => !r.isWalkOnly && !r.isNextDay && r.nextArrival < NO_SERVICE_MINS);
  const sameDay = hasToday ? final.filter(r => !r.isNextDay) : final;
  // Yakında kalkan bir seçenek varsa saatler sonraki seferler (ör. gece hattı) gösterilmez
  const soon = sameDay.filter(r => r.isWalkOnly || r.nextArrival <= FAR_DEPARTURE_MINS);
  return soon.some(r => !r.isWalkOnly) ? soon : sameDay;
}

function clockLabel(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function journeyToRoute(j: RaptorJourney, origin: Location, destination: Location, nowMins: number): Route | null {
  const stopIdx = getStopIndex();
  const steps: RouteStep[] = [];
  const rides = j.legs.filter(l => l.type === 'ride');
  if (rides.length === 0) return null;

  for (let i = 0; i < j.legs.length; i++) {
    const leg = j.legs[i];
    if (leg.type === 'walk') {
      const to = leg.toStopId ? stopIdx.get(leg.toStopId) : undefined;
      const mins = leg.arriveMins - leg.departMins;
      if (mins <= 0 && !to) continue;
      const prevStep = steps[steps.length - 1];
      if (prevStep?.type === 'walk') {
        prevStep.durationMins += Math.max(0, mins);
        prevStep.distanceMeters = (prevStep.distanceMeters ?? 0) + Math.round(leg.meters ?? 0);
        prevStep.toStopName = to?.name ?? destination.name;
        continue;
      }
      steps.push({
        type: 'walk',
        durationMins: Math.max(0, mins),
        toStopName: to?.name ?? destination.name,
        distanceMeters: Math.round(leg.meters ?? 0),
      });
      continue;
    }
    const stops = patternStopsBetween(leg.lineNum!, leg.dir!, leg.boardIdx!, leg.alightIdx!);
    const board = stops[0];
    const alight = stops[stops.length - 1];
    const mid = stops.slice(1, -1).map(s => ({ name: s.name, latitude: s.lat, longitude: s.lon }));
    const dirStops = getOrderedStopsForDir(leg.lineNum!, leg.dir!);
    steps.push({
      type: 'transit',
      durationMins: leg.arriveMins - leg.departMins,
      distanceMeters: calcTransitDetails(
        { latitude: board.lat, longitude: board.lon },
        { latitude: alight.lat, longitude: alight.lon },
        mid
      ).distanceMeters,
      lineNumber: leg.lineNum,
      mode: getLineMode(leg.lineNum!),
      boardStop: { name: board.name, latitude: board.lat, longitude: board.lon },
      alightStop: { name: alight.name, latitude: alight.lat, longitude: alight.lon },
      intermediateStops: mid,
      departureMins: leg.departMins,
      departureTime: clockLabel(leg.departMins),
      headsign: isRingRoute(leg.lineNum!) ? undefined : dirStops[dirStops.length - 1]?.name,
      dir: leg.dir,
      boardStopId: board.id,
    });
  }

  const first = rides[0];
  const firstBoard = stopIdx.get(first.fromStopId!)!;
  const lastAlight = stopIdx.get(rides[rides.length - 1].toStopId!)!;
  const walkToBoard = steps[0]?.type === 'walk' ? steps[0].durationMins : 0;
  const names = rides.map(r => getRouteName(r.lineNum!) ?? r.lineNum!);
  const transfers: Transfer[] = rides.slice(1).map((r, i) => {
    const b = stopIdx.get(r.fromStopId!)!;
    const a = stopIdx.get(r.toStopId!)!;
    const walkLeg = j.legs[j.legs.indexOf(r) - 1];
    return {
      lineNumber: r.lineNum!,
      lineName: names[i + 1],
      boardStop: { id: b.id, name: b.name, latitude: b.lat, longitude: b.lon },
      alightStop: { id: a.id, name: a.name, latitude: a.lat, longitude: a.lon },
      walkMins: walkLeg?.type === 'walk' ? walkLeg.arriveMins - walkLeg.departMins : 0,
    };
  });

  const allScheduled = rides.every(r => lineHasSchedule(r.lineNum!));
  const confidenceDetail = calcConfidenceDetail(
    false,
    allScheduled,
    steps[0]?.type === 'walk' ? steps[0].distanceMeters ?? 0 : 0,
    steps[steps.length - 1]?.type === 'walk' ? steps[steps.length - 1].distanceMeters ?? 0 : 0
  );

  return {
    id: `multi-${rides.map(r => `${r.lineNum}.${r.dir}`).join('-')}-${first.departMins}`,
    lineNumber: first.lineNum!,
    lineName: names.join(' → '),
    mode: getLineMode(first.lineNum!),
    estimatedDuration: j.arriveMins - first.departMins + walkToBoard,
    transfers,
    nextArrival: first.departMins - nowMins,
    crowdLevel: getCrowdLevel(),
    sunAnalysis: sunAnalysisForSteps(
      steps, origin, destination,
      rides.map(r => `${r.lineNum}_${r.dir}_${r.fromStopId}_${r.toStopId}`).join('|'),
      first.departMins - nowMins
    ),
    boardingStop: { id: firstBoard.id, name: firstBoard.name, latitude: firstBoard.lat, longitude: firstBoard.lon },
    alightingStop: { id: lastAlight.id, name: lastAlight.name, latitude: lastAlight.lat, longitude: lastAlight.lon },
    steps,
    confidence: confidenceDetail.score,
    confidenceDetail,
    hasIncompleteData: !allScheduled,
    departAtMins: j.departMins,
    arriveAtMins: j.arriveMins,
  };
}

const MULTI_RESULT_LIMIT = 5;

// Tarifeye göre en erken varan seçenekler; her aktarma sayısı için en iyisi, ardından sonraki kalkışlar.
function shiftJourney(j: RaptorJourney, add: number): RaptorJourney {
  return {
    ...j,
    departMins: j.departMins + add,
    arriveMins: j.arriveMins + add,
    legs: j.legs.map(l => ({ ...l, departMins: l.departMins + add, arriveMins: l.arriveMins + add })),
  };
}

const FIRST_MORNING_SEARCH_MINS = 5 * 60;

function collectJourneys(
  o: { lat: number; lon: number },
  d: { lat: number; lon: number },
  maxWalkM: number,
  serviceDate: Date,
  startMins: number,
  dayOffset: number,
  origin: Location,
  destination: Location,
  nowMins: number
): Route[] {
  // Aynı hatlarla aynı saatte varan seçeneklerden en geç yola çıkılanı (en az bekleteni) tutulur.
  const bySig = new Map<string, Route>();
  let departAt = startMins;
  for (let pass = 0; pass < 8 && bySig.size < MULTI_RESULT_LIMIT; pass++) {
    const journeys = raptorSearch(o, d, { maxAccessWalkM: maxWalkM, date: serviceDate, departAtMins: departAt });
    if (journeys.length === 0) break;
    for (const raw of journeys) {
      const j = dayOffset ? shiftJourney(raw, dayOffset) : raw;
      const sig = `${j.legs.filter(l => l.type === 'ride').map(l => `${l.lineNum}.${l.dir}`).join('-')}@${j.arriveMins}`;
      const prev = bySig.get(sig);
      if (prev && (prev.departAtMins ?? 0) >= j.departMins) continue;
      const r = journeyToRoute(j, origin, destination, nowMins);
      if (r) bySig.set(sig, r);
    }
    // Bir sonraki tur: en erken seçeneğin ilk aracından bir dakika sonra yola çıkılırsa ne olur
    const earliestFirstRide = Math.min(...journeys.map(j => j.legs.find(l => l.type === 'ride')!.departMins));
    const firstWalk = journeys[0].legs[0].type === 'walk' ? journeys[0].legs[0].arriveMins - journeys[0].legs[0].departMins : 0;
    departAt = earliestFirstRide - firstWalk + 1;
  }
  return [...bySig.values()].sort((a, b) => (a.arriveAtMins ?? 0) - (b.arriveAtMins ?? 0)).slice(0, MULTI_RESULT_LIMIT);
}

// Gece 03:00'e kadar önceki günün tarifesi geçerli: servis günü ve o güne göre dakika.
function serviceClock(at: Date): { serviceDate: Date; mins: number } {
  const mins = at.getHours() * 60 + at.getMinutes();
  return mins < 180
    ? { serviceDate: new Date(at.getTime() - 86_400_000), mins: mins + 1440 }
    : { serviceDate: at, mins };
}

function dayIndex(d: Date): number {
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86_400_000);
}

// Tarifeye göre en erken varan seçenekler; bu gece sefer kalmadıysa ertesi sabahın ilk seçenekleri.
// departAt verilirse o saatten itibaren aranır (dakikalar bugünün servis gününe göre ifade edilir).
function findMultiLegRoutes(origin: Location, destination: Location, maxWalkM: number, departAt?: Date): Route[] {
  const { serviceDate, mins: nowMins } = serviceClock(new Date());
  const o = { lat: origin.latitude, lon: origin.longitude };
  const d = { lat: destination.latitude, lon: destination.longitude };
  if (departAt) {
    const target = serviceClock(departAt);
    const offset = (dayIndex(target.serviceDate) - dayIndex(serviceDate)) * 1440;
    return collectJourneys(o, d, maxWalkM, target.serviceDate, target.mins, offset, origin, destination, nowMins);
  }
  const today = collectJourneys(o, d, maxWalkM, serviceDate, nowMins, 0, origin, destination, nowMins);
  if (today.length > 0) return today;
  const nextDay = new Date(serviceDate.getTime() + 86_400_000);
  return collectJourneys(o, d, maxWalkM, nextDay, FIRST_MORNING_SEARCH_MINS, 1440, origin, destination, nowMins)
    .map(r => ({ ...r, isNextDay: true }));
}

const RETIME_EARLY_SLACK_MINS = 10;

// Tarifeyle bulunan rotayı baştan sona yeniden zamanlar: otobüs bacakları için İZTEK canlı tahmini
// (yoksa tarife), raylı/vapur için tarife. Bir araç gecikirse sonraki aktarmalar da buna göre kayar.
async function retimeWithLive(route: Route): Promise<Route> {
  const steps = (route.steps ?? []).map(s => ({ ...s }));
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes() + (now.getHours() < 3 ? 1440 : 0);
  let t = nowMins;
  let anyLive = false;
  let firstDep: number | null = null;
  try {
    for (const step of steps) {
      if (step.type === 'walk') { t += step.durationMins; continue; }
      if (!step.lineNumber || step.dir === undefined || !step.boardStopId || !step.boardStop) {
        t = Math.max(t, step.departureMins ?? t) + step.durationMins;
        continue;
      }
      // Planlanan seferden çok önceki bir araca atlamasın: otobüste 10 dk erken gelme payı, rayda tarife kesin
      const planned = step.departureMins ?? t;
      const slack = getLineMode(step.lineNumber) === 'bus' ? RETIME_EARLY_SLACK_MINS : 0;
      const est = await nextArrival(
        step.lineNumber,
        step.dir,
        { id: step.boardStopId, lat: step.boardStop.latitude, lon: step.boardStop.longitude },
        Math.max(t, planned - slack) - nowMins
      );
      const dep = est.mins < NO_SERVICE_MINS ? Math.max(t, nowMins + est.mins) : Math.max(t, step.departureMins ?? t);
      step.departureMins = dep;
      step.departureTime = clockLabel(dep);
      step.isLive = est.isLive && est.mins < NO_SERVICE_MINS;
      anyLive ||= !!step.isLive;
      if (firstDep === null) firstDep = dep;
      t = dep + step.durationMins;
    }
  } catch (e) {
    console.warn('[retimeWithLive] canlı yeniden zamanlama yapılamadı, tarife korunuyor:', e);
    return route;
  }
  if (firstDep === null) return route;
  const firstWalk = steps[0]?.type === 'walk' ? steps[0].durationMins : 0;
  const confidenceDetail = route.confidenceDetail
    ? calcConfidenceDetail(anyLive, route.confidenceDetail.hasScheduleData,
      steps[0]?.distanceMeters ?? 0, steps[steps.length - 1]?.distanceMeters ?? 0)
    : undefined;
  return {
    ...route,
    steps,
    nextArrival: firstDep - nowMins,
    departAtMins: firstDep - firstWalk,
    arriveAtMins: t,
    estimatedDuration: t - firstDep + firstWalk,
    confidence: confidenceDetail?.score ?? route.confidence,
    confidenceDetail,
  };
}

const WALK_ONLY_MAX_M = 2500;

function walkOnlyRoute(origin: Location, destination: Location): Route | null {
  const w = walkCalc(origin, destination);
  if (w.meters > WALK_ONLY_MAX_M) return null;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return {
    id: 'walk-only',
    lineNumber: '',
    lineName: 'Yürüyerek',
    estimatedDuration: w.mins,
    transfers: [],
    nextArrival: 0,
    crowdLevel: 'low',
    steps: [{ type: 'walk', durationMins: w.mins, toStopName: destination.name, distanceMeters: w.meters }],
    departAtMins: nowMins,
    arriveAtMins: nowMins + w.mins,
    isWalkOnly: true,
  };
}

// Bekleme dahil varış: önce durağa yürünür, otobüs beklenir, sonra yolculuk sürer.
function arrivalAtDestinationMins(r: Route): number {
  if (r.arriveAtMins !== undefined) {
    const now = new Date();
    let nowMins = now.getHours() * 60 + now.getMinutes();
    if (nowMins < 180) nowMins += 1440;
    return r.arriveAtMins - nowMins;
  }
  if (r.nextArrival >= NO_SERVICE_MINS) return Infinity;
  const walkToBoard = r.steps?.[0]?.type === 'walk' ? r.steps[0].durationMins : 0;
  return Math.max(r.nextArrival, walkToBoard) + r.estimatedDuration - walkToBoard;
}

function getWalkMeters(r: Route): number {
  return r.steps?.filter(s => s.type === 'walk').reduce((s, st) => s + (st.distanceMeters ?? 0), 0) ?? 0;
}

export function sortRoutes(routes: Route[], mode: RouteFilterMode): Route[] {
  switch (mode) {
    case 'fastest':
      return [...routes].sort((a, b) => {
        const d = arrivalAtDestinationMins(a) - arrivalAtDestinationMins(b);
        return d !== 0 && !isNaN(d) ? d : getWalkMeters(a) - getWalkMeters(b);
      });
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
