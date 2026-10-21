import {
  getRouteStopSeqs,
  getStopIndex,
  getStops,
  getLineMode,
  getRailTimetable,
  getBusOffsets,
  type IzmirStop,
  type ServiceType,
} from '../../data/gtfsData';
import { getBundledDepartures } from '../firebase/scheduleService';

// Tarife tabanlı çok aktarmalı rota arama (RAPTOR). Her tur bir araç daha ekler;
// sonuçta her aktarma sayısı için en erken varış ve o yolculuğun bacakları döner.

const WALK_M_PER_MIN = 84;
const FOOTPATH_M = 600;
const MAX_ROUNDS = 4;
const SEARCH_HORIZON_MINS = 240;
const BUS_KMH = 22;

export interface RaptorLeg {
  type: 'walk' | 'ride';
  fromStopId?: string;
  toStopId?: string;
  lineNum?: string;
  dir?: 0 | 1;
  boardIdx?: number;
  alightIdx?: number;
  departMins: number;
  arriveMins: number;
  meters?: number;
}

export interface RaptorJourney {
  legs: RaptorLeg[];
  departMins: number;
  arriveMins: number;
  rides: number;
}

interface Pattern {
  key: string;
  lineNum: string;
  dir: 0 | 1;
  stops: string[];
  offsets: number[];
  deps: number[];
}

type Label =
  | { kind: 'origin'; walkMins: number; meters: number }
  | { kind: 'ride'; pattern: Pattern; boardIdx: number; alightIdx: number; tripDep: number }
  | { kind: 'walk'; from: string; mins: number; meters: number };

function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

export function serviceTypeFor(date: Date): ServiceType {
  const d = date.getDay();
  return d === 0 ? 'sunday' : d === 6 ? 'saturday' : 'weekday';
}

const patternCache = new Map<ServiceType, Pattern[]>();
let stopPatterns: Map<string, Array<{ p: number; idx: number }>> | null = null;
let stopPatternsSvc: ServiceType | null = null;

function busOffsets(stops: IzmirStop[]): number[] {
  const out = [0];
  let mins = 0;
  for (let i = 1; i < stops.length; i++) {
    mins += (haversineM(stops[i - 1], stops[i]) / 1000 / BUS_KMH) * 60 + 1;
    out.push(Math.round(mins));
  }
  return out;
}

function withAfterMidnight(deps: number[]): number[] {
  const all = deps.flatMap(d => (d < 180 ? [d, d + 1440] : [d]));
  return [...new Set(all)].sort((a, b) => a - b);
}

function getPatterns(svc: ServiceType): Pattern[] {
  const cached = patternCache.get(svc);
  if (cached) return cached;
  const idx = getStopIndex();
  const patterns: Pattern[] = [];
  for (const [key, ids] of Object.entries(getRouteStopSeqs())) {
    const sep = key.lastIndexOf('_');
    const lineNum = key.slice(0, sep);
    const dir = Number(key.slice(sep + 1)) as 0 | 1;
    const stops = ids.filter(id => idx.has(id));
    if (stops.length < 2) continue;
    let offsets: number[];
    let deps: number[];
    if (getLineMode(lineNum) !== 'bus') {
      const tt = getRailTimetable(lineNum, dir, svc);
      if (!tt || tt.offsets.length !== ids.length) continue;
      offsets = ids.flatMap((id, i) => (idx.has(id) ? [tt.offsets[i]] : []));
      deps = tt.deps;
    } else {
      const planned = getBusOffsets(lineNum, dir);
      offsets = planned && planned.length === ids.length
        ? ids.flatMap((id, i) => (idx.has(id) ? [Math.round(planned[i])] : []))
        : busOffsets(stops.map(id => idx.get(id)!));
      deps = getBundledDepartures(lineNum, dir, svc);
    }
    if (deps.length === 0) continue;
    patterns.push({ key, lineNum, dir, stops, offsets, deps: withAfterMidnight(deps) });
  }
  patternCache.set(svc, patterns);
  return patterns;
}

function getStopPatterns(svc: ServiceType, patterns: Pattern[]) {
  if (stopPatterns && stopPatternsSvc === svc) return stopPatterns;
  stopPatterns = new Map();
  patterns.forEach((pt, p) => pt.stops.forEach((id, i) => {
    let arr = stopPatterns!.get(id);
    if (!arr) { arr = []; stopPatterns!.set(id, arr); }
    arr.push({ p, idx: i });
  }));
  stopPatternsSvc = svc;
  return stopPatterns;
}

const GRID = 0.005;
let grid: Map<string, IzmirStop[]> | null = null;
function stopsNear(pt: { lat: number; lon: number }, radiusM: number): Array<{ stop: IzmirStop; meters: number }> {
  if (!grid) {
    grid = new Map();
    for (const s of getStops()) {
      const k = `${Math.floor(s.lat / GRID)},${Math.floor(s.lon / GRID)}`;
      let arr = grid.get(k);
      if (!arr) { arr = []; grid.set(k, arr); }
      arr.push(s);
    }
  }
  const r = Math.ceil(radiusM / (GRID * 111_000)) + 1;
  const cy = Math.floor(pt.lat / GRID), cx = Math.floor(pt.lon / GRID);
  const out: Array<{ stop: IzmirStop; meters: number }> = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const s of grid.get(`${cy + dy},${cx + dx}`) ?? []) {
        const m = haversineM(pt, s);
        if (m <= radiusM) out.push({ stop: s, meters: m });
      }
    }
  }
  return out;
}

const footpathCache = new Map<string, Array<{ to: string; meters: number }>>();
function footpaths(stopId: string): Array<{ to: string; meters: number }> {
  const cached = footpathCache.get(stopId);
  if (cached) return cached;
  const s = getStopIndex().get(stopId);
  const res = s ? stopsNear(s, FOOTPATH_M).filter(x => x.stop.id !== stopId).map(x => ({ to: x.stop.id, meters: x.meters })) : [];
  footpathCache.set(stopId, res);
  return res;
}

function walkMins(meters: number): number {
  return Math.max(1, Math.round(meters / WALK_M_PER_MIN));
}

// Kalkış saati >= t olan ilk sefer (ilk duraktan kalkış), yoksa -1.
function firstTripAtOrAfter(deps: number[], offset: number, t: number): number {
  let lo = 0, hi = deps.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (deps[mid] + offset >= t) hi = mid; else lo = mid + 1;
  }
  return lo < deps.length ? deps[lo] : -1;
}

export interface RaptorOptions {
  maxAccessWalkM: number;
  date?: Date;
  departAtMins?: number;
}

export function raptorSearch(
  origin: { lat: number; lon: number },
  destination: { lat: number; lon: number },
  opts: RaptorOptions
): RaptorJourney[] {
  const now = opts.date ?? new Date();
  let t0 = opts.departAtMins ?? now.getHours() * 60 + now.getMinutes();
  let serviceDate = now;
  // Gece 03:00'ten önce bir önceki günün tarifesi geçerli (gece yarısını aşan seferler).
  // departAtMins verildiyse `date` zaten servis günüdür ve t0 1440'ı aşabilir.
  if (opts.departAtMins === undefined && t0 < 180) {
    serviceDate = new Date(now.getTime() - 86_400_000);
    t0 += 1440;
  }
  const svc = serviceTypeFor(serviceDate);
  const patterns = getPatterns(svc);
  const byStop = getStopPatterns(svc, patterns);
  const horizon = t0 + SEARCH_HORIZON_MINS;

  const destStops = new Map<string, number>();
  for (const { stop, meters } of stopsNear(destination, opts.maxAccessWalkM)) destStops.set(stop.id, meters);
  if (destStops.size === 0) return [];

  const best = new Map<string, number>();
  const rounds: Array<Map<string, { t: number; label: Label }>> = [new Map()];
  let marked = new Set<string>();
  for (const { stop, meters } of stopsNear(origin, opts.maxAccessWalkM)) {
    const t = t0 + walkMins(meters);
    rounds[0].set(stop.id, { t, label: { kind: 'origin', walkMins: walkMins(meters), meters } });
    best.set(stop.id, t);
    marked.add(stop.id);
  }

  let bestDest = Infinity;
  const destBound = () => bestDest;

  for (let k = 1; k <= MAX_ROUNDS && marked.size > 0; k++) {
    const prev = rounds[k - 1];
    const cur = new Map<string, { t: number; label: Label }>();
    rounds.push(cur);

    const queue = new Map<number, number>();
    for (const sid of marked) {
      for (const { p, idx } of byStop.get(sid) ?? []) {
        const q = queue.get(p);
        if (q === undefined || idx < q) queue.set(p, idx);
      }
    }

    const newlyMarked = new Set<string>();
    for (const [p, startIdx] of queue) {
      const pt = patterns[p];
      let tripDep = -1;
      let boardIdx = -1;
      for (let i = startIdx; i < pt.stops.length; i++) {
        const sid = pt.stops[i];
        if (tripDep >= 0) {
          const arr = tripDep + pt.offsets[i];
          const bestHere = best.get(sid) ?? Infinity;
          if (arr < bestHere && arr < destBound()) {
            cur.set(sid, { t: arr, label: { kind: 'ride', pattern: pt, boardIdx, alightIdx: i, tripDep } });
            best.set(sid, arr);
            newlyMarked.add(sid);
          }
        }
        const prevT = prev.get(sid)?.t;
        if (prevT !== undefined && (tripDep < 0 || prevT <= tripDep + pt.offsets[i])) {
          const transferBuffer = k > 1 ? 1 : 0;
          const dep = firstTripAtOrAfter(pt.deps, pt.offsets[i], prevT + transferBuffer);
          if (dep >= 0 && dep + pt.offsets[i] <= horizon && (tripDep < 0 || dep < tripDep)) {
            tripDep = dep;
            boardIdx = i;
          }
        }
      }
    }

    for (const sid of [...newlyMarked]) {
      const base = cur.get(sid)!.t;
      for (const { to, meters } of footpaths(sid)) {
        // Araçla varılan durağın etiketini ezmek yürüyüş zinciri oluşturur; geri izlemede karışıklık yaratır.
        if (cur.get(to)?.label.kind === 'ride') continue;
        const t = base + walkMins(meters);
        if (t < (best.get(to) ?? Infinity) && t < destBound()) {
          cur.set(to, { t, label: { kind: 'walk', from: sid, mins: walkMins(meters), meters } });
          best.set(to, t);
          newlyMarked.add(to);
        }
      }
    }

    for (const [sid, meters] of destStops) {
      const r = cur.get(sid);
      if (r) bestDest = Math.min(bestDest, r.t + walkMins(meters));
    }
    marked = newlyMarked;
  }

  // Her aktarma sayısı için en iyi varış; yalnızca daha az aktarmalı seçenekten daha erken olanlar tutulur.
  const journeys: RaptorJourney[] = [];
  let bestSoFar = Infinity;
  for (let k = 1; k < rounds.length; k++) {
    let bestStop: string | null = null;
    let bestT = Infinity;
    for (const [sid, meters] of destStops) {
      const r = rounds[k].get(sid);
      if (r && r.label.kind !== 'origin') {
        const t = r.t + walkMins(meters);
        if (t < bestT) { bestT = t; bestStop = sid; }
      }
    }
    if (!bestStop || bestT >= bestSoFar) continue;
    const legs = reconstruct(rounds, k, bestStop);
    if (!legs) continue;
    const last = legs[legs.length - 1];
    const finalWalkM = destStops.get(bestStop)!;
    legs.push({ type: 'walk', fromStopId: bestStop, departMins: last.arriveMins, arriveMins: last.arriveMins + walkMins(finalWalkM), meters: finalWalkM });
    const firstRide = legs.find(l => l.type === 'ride')!;
    const firstWalk = legs[0].type === 'walk' ? legs[0].arriveMins - legs[0].departMins : 0;
    journeys.push({
      legs,
      departMins: firstRide.departMins - firstWalk,
      arriveMins: bestT,
      rides: legs.filter(l => l.type === 'ride').length,
    });
    bestSoFar = bestT;
  }
  return journeys;
}

function reconstruct(
  rounds: Array<Map<string, { t: number; label: Label }>>,
  k: number,
  stopId: string
): RaptorLeg[] | null {
  const legs: RaptorLeg[] = [];
  let sid = stopId;
  let round = k;
  for (let guard = 0; guard < 20; guard++) {
    const entry = rounds[round]?.get(sid);
    if (!entry) return null;
    const { label, t } = entry;
    if (label.kind === 'origin') {
      legs.unshift({ type: 'walk', toStopId: sid, departMins: t - label.walkMins, arriveMins: t, meters: label.meters });
      return legs;
    }
    if (label.kind === 'walk') {
      legs.unshift({ type: 'walk', fromStopId: label.from, toStopId: sid, departMins: t - label.mins, arriveMins: t, meters: label.meters });
      sid = label.from;
      continue;
    }
    const { pattern, boardIdx, alightIdx, tripDep } = label;
    legs.unshift({
      type: 'ride',
      lineNum: pattern.lineNum,
      dir: pattern.dir,
      fromStopId: pattern.stops[boardIdx],
      toStopId: pattern.stops[alightIdx],
      boardIdx,
      alightIdx,
      departMins: tripDep + pattern.offsets[boardIdx],
      arriveMins: tripDep + pattern.offsets[alightIdx],
    });
    sid = pattern.stops[boardIdx];
    round -= 1;
  }
  return null;
}

export function patternStopsBetween(lineNum: string, dir: 0 | 1, boardIdx: number, alightIdx: number): IzmirStop[] {
  const idx = getStopIndex();
  const ids = (getRouteStopSeqs()[`${lineNum}_${dir}`] ?? []).filter(id => idx.has(id));
  return ids.slice(boardIdx, alightIdx + 1).map(id => idx.get(id)!);
}
