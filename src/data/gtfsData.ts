import type { TransitMode } from '../types';

export interface IzmirStop {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

interface StopRouteDir { lineNum: string; dir: 0 | 1; }

export type ServiceType = 'weekday' | 'saturday' | 'sunday';

// Metro, tramvay, İZBAN ve vapur — scripts/build-rail-gtfs.mjs üretir.
// offsets: hattın ilk durağından her durağa dakika; deps: ilk duraktan kalkışlar (gece yarısından dakika).
interface RailData {
  lines: Record<string, { name: string; mode: Exclude<TransitMode, 'bus'>; color: string }>;
  stops: IzmirStop[];
  seqs: Record<string, string[]>;
  offsets: Record<string, number[]>;
  deps: Record<string, Record<ServiceType, number[]>>;
}

let _rail: RailData | null = null;
let _railStopRouteDirs: Record<string, StopRouteDir[]> | null = null;

function getRail(): RailData {
  if (!_rail) _rail = require('./gtfs/rail.json') as RailData;
  return _rail;
}

export function getLineMode(lineNum: string): TransitMode {
  return getRail().lines[lineNum]?.mode ?? 'bus';
}

export function getLineColor(lineNum: string): string | undefined {
  return getRail().lines[lineNum]?.color;
}

export const TRANSIT_MODE_ICON: Record<TransitMode, 'bus' | 'subway-variant' | 'tram' | 'train' | 'ferry'> = {
  bus: 'bus',
  metro: 'subway-variant',
  tram: 'tram',
  rail: 'train',
  ferry: 'ferry',
};

export const TRANSIT_MODE_LABEL: Record<TransitMode, string> = {
  bus: 'Hat',
  metro: 'Metro',
  tram: 'Tramvay',
  rail: 'İZBAN',
  ferry: 'Vapur',
};

// Ekranlarda gösterilecek kısa hat adı: "Hat 302", "M1", "İZBAN-1", vapurda iskele adı.
export function lineTitle(lineNum: string): string {
  const line = getRail().lines[lineNum];
  if (!line) return `Hat ${lineNum}`;
  return line.mode === 'ferry' ? `Vapur · ${line.name}` : lineNum;
}

export function stopMode(stopId: string): TransitMode {
  const dirs = getRailStopRouteDirs()[stopId];
  return dirs?.length ? getLineMode(dirs[0].lineNum) : 'bus';
}

function todayServiceType(): ServiceType {
  const day = new Date().getDay();
  return day === 0 ? 'sunday' : day === 6 ? 'saturday' : 'weekday';
}

// Raylı/vapur hatlarında durağa geliş (dakika); bugün yetişilebilecek sefer yoksa null.
export function getRailArrivalMins(lineNum: string, dir: 0 | 1, stopId: string, afterMins = 0): number | null {
  const rail = getRail();
  const key = `${lineNum}_${dir}`;
  const idx = rail.seqs[key]?.indexOf(stopId) ?? -1;
  const times = rail.deps[key]?.[todayServiceType()];
  if (idx < 0 || !times?.length) return null;
  const offset = rail.offsets[key][idx];
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  let best = Infinity;
  for (const dep of times) {
    for (const d of dep < 180 ? [dep, dep + 1440] : [dep]) {
      const wait = d + offset - nowMins;
      if (wait >= afterMins && wait < best) best = wait;
    }
  }
  return isFinite(best) ? best : null;
}

let _busOffsets: Record<string, { o: number[]; m: number[] }> | null = null;

// ESHOT planındaki durak bazlı süreler (ilk duraktan dakika), route-stop-seqs ile aynı sırada.
// scripts/build-bus-offsets.mjs üretir; hat için veri yoksa null.
export function getBusOffsets(lineNum: string, dir: 0 | 1): number[] | null {
  if (!_busOffsets) _busOffsets = require('./gtfs/route-offsets.json');
  return _busOffsets![`${lineNum}_${dir}`]?.o ?? null;
}

// İki durak arası planlanan süre (dakika); veri yoksa null.
export function getBusRideMins(lineNum: string, dir: 0 | 1, boardId: string, alightId: string): number | null {
  const offs = getBusOffsets(lineNum, dir);
  const seq = getRouteStopSeqs()[`${lineNum}_${dir}`];
  if (!offs || !seq || offs.length !== seq.length) return null;
  const b = seq.indexOf(boardId), a = seq.indexOf(alightId);
  if (b < 0 || a <= b) return null;
  return Math.max(1, Math.round(offs[a] - offs[b]));
}

export function getBusOffsetAt(lineNum: string, dir: 0 | 1, stopId: string): number | null {
  const offs = getBusOffsets(lineNum, dir);
  const seq = getRouteStopSeqs()[`${lineNum}_${dir}`];
  if (!offs || !seq || offs.length !== seq.length) return null;
  const i = seq.indexOf(stopId);
  return i < 0 ? null : Math.round(offs[i]);
}

// Raylı/vapur hattının bir yönü için durak ofsetleri ve kalkışlar (rota motoru için).
export function getRailTimetable(lineNum: string, dir: 0 | 1, svc: ServiceType): { offsets: number[]; deps: number[] } | null {
  const rail = getRail();
  const key = `${lineNum}_${dir}`;
  if (!rail.seqs[key]) return null;
  return { offsets: rail.offsets[key] ?? [], deps: rail.deps[key]?.[svc] ?? [] };
}

// Hattın ilk durağından kalkışlar, scheduleService'in LineSchedule biçiminde.
export function getRailSchedule(lineNum: string): Partial<Record<ServiceType, { gidis: number[]; donus: number[] }>> | null {
  const rail = getRail();
  if (!rail.lines[lineNum]) return null;
  const d0 = rail.deps[`${lineNum}_0`];
  const d1 = rail.deps[`${lineNum}_1`];
  const result: Partial<Record<ServiceType, { gidis: number[]; donus: number[] }>> = {};
  for (const svc of ['weekday', 'saturday', 'sunday'] as ServiceType[]) {
    const gidis = d0?.[svc] ?? [];
    const donus = d1?.[svc] ?? [];
    if (gidis.length || donus.length) result[svc] = { gidis, donus };
  }
  return result;
}

// Tarifeye göre iki durak arası yolculuk süresi; durak bulunamazsa null.
export function getRailRideMins(lineNum: string, dir: 0 | 1, boardId: string, alightId: string): number | null {
  const rail = getRail();
  const key = `${lineNum}_${dir}`;
  const seq = rail.seqs[key];
  if (!seq) return null;
  const b = seq.indexOf(boardId), a = seq.indexOf(alightId);
  if (b < 0 || a <= b) return null;
  return Math.max(1, rail.offsets[key][a] - rail.offsets[key][b]);
}

let _stops: IzmirStop[] | null = null;
let _stopIndex: Map<string, IzmirStop> | null = null;
let _stopRouteDirs: Record<string, StopRouteDir[]> | null = null;
let _routeStopSeqs: Record<string, string[]> | null = null;
let _ringRoutes: Set<string> | null = null;
let _shapes: Record<string, [number, number][]> | null = null;
let _routeMeta: Record<string, { name: string }> | null = null;
let _grid: Map<string, IzmirStop[]> | null = null;

const GRID_SIZE = 0.02;

function gridKey(lat: number, lon: number): string {
  return `${Math.floor(lat / GRID_SIZE)},${Math.floor(lon / GRID_SIZE)}`;
}

function getGrid(): Map<string, IzmirStop[]> {
  if (_grid) return _grid;
  _grid = new Map();
  for (const stop of getStops()) {
    const key = gridKey(stop.lat, stop.lon);
    if (!_grid.has(key)) _grid.set(key, []);
    _grid.get(key)!.push(stop);
  }
  return _grid;
}

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

export function getStops(): IzmirStop[] {
  if (!_stops) _stops = [...(require('./gtfs/stops.json') as IzmirStop[]), ...getRail().stops];
  return _stops;
}

export function getStopIndex(): Map<string, IzmirStop> {
  if (!_stopIndex) {
    _stopIndex = new Map();
    for (const s of getStops()) _stopIndex.set(s.id, s);
  }
  return _stopIndex;
}

function getRailStopRouteDirs(): Record<string, StopRouteDir[]> {
  if (_railStopRouteDirs) return _railStopRouteDirs;
  _railStopRouteDirs = {};
  for (const [key, ids] of Object.entries(getRail().seqs)) {
    const sep = key.lastIndexOf('_');
    const lineNum = key.slice(0, sep);
    const dir = Number(key.slice(sep + 1)) as 0 | 1;
    for (const id of ids) (_railStopRouteDirs[id] ??= []).push({ lineNum, dir });
  }
  return _railStopRouteDirs;
}

export function getStopRouteDirs(): Record<string, StopRouteDir[]> {
  if (!_stopRouteDirs) _stopRouteDirs = { ...require('./gtfs/stop-route-dirs.json'), ...getRailStopRouteDirs() };
  return _stopRouteDirs!;
}

export function getRouteStopSeqs(): Record<string, string[]> {
  if (!_routeStopSeqs) _routeStopSeqs = { ...require('./gtfs/route-stop-seqs.json'), ...getRail().seqs };
  return _routeStopSeqs!;
}

export function isRingRoute(lineNum: string): boolean {
  if (!_ringRoutes) _ringRoutes = new Set(require('./gtfs/ring-routes.json') as string[]);
  return _ringRoutes.has(lineNum);
}

// Raylı/vapur hatlarında şekil verisi yok; duraklar sırayla birleştirilir.
export function getRouteShape(lineNum: string, dir: 0 | 1): [number, number][] {
  if (getLineMode(lineNum) !== 'bus') return getOrderedStopsForDir(lineNum, dir).map(s => [s.lat, s.lon]);
  if (!_shapes) _shapes = require('./gtfs/shapes.json');
  return _shapes![`${lineNum}_${dir}`] ?? [];
}

export function getRouteName(lineNum: string): string | undefined {
  if (!_routeMeta) _routeMeta = require('./gtfs/route-meta.json');
  return _routeMeta![lineNum]?.name ?? getRail().lines[lineNum]?.name;
}

let _allLines: Array<{ lineNum: string; name: string }> | null = null;

export function getAllLines(): Array<{ lineNum: string; name: string }> {
  if (_allLines) return _allLines;
  if (!_routeMeta) _routeMeta = require('./gtfs/route-meta.json');
  _allLines = [
    ...Object.entries(_routeMeta!).map(([lineNum, { name }]) => ({ lineNum, name })),
    ...Object.entries(getRail().lines).map(([lineNum, { name }]) => ({ lineNum, name })),
  ];
  return _allLines;
}

const _linesNearCache = new Map<string, string[]>();

export function getLinesNearOrigin(
  origin: { lat: number; lon: number },
  radiusKm = 1.0
): string[] {
  const key = `${origin.lat},${origin.lon},${radiusKm}`;
  if (_linesNearCache.has(key)) return _linesNearCache.get(key)!;

  const grid = getGrid();
  const srd = getStopRouteDirs();
  const seen = new Set<string>();
  const result: string[] = [];
  const cellRadius = Math.ceil(radiusKm / (GRID_SIZE * 111)) + 1;
  const centerLat = Math.floor(origin.lat / GRID_SIZE);
  const centerLon = Math.floor(origin.lon / GRID_SIZE);
  for (let dlat = -cellRadius; dlat <= cellRadius; dlat++) {
    for (let dlon = -cellRadius; dlon <= cellRadius; dlon++) {
      const stops = grid.get(`${centerLat + dlat},${centerLon + dlon}`) ?? [];
      for (const stop of stops) {
        const dLatKm = (stop.lat - origin.lat) * 111;
        const dLonKm = (stop.lon - origin.lon) * 111 * Math.cos(origin.lat * Math.PI / 180);
        if (Math.sqrt(dLatKm * dLatKm + dLonKm * dLonKm) > radiusKm) continue;
        for (const { lineNum } of srd[stop.id] ?? []) {
          if (!seen.has(lineNum)) { seen.add(lineNum); result.push(lineNum); }
        }
      }
    }
  }
  _linesNearCache.set(key, result);
  return result;
}

export function clearLinesNearCache(): void {
  _linesNearCache.clear();
}

const _orderedStopsCache = new Map<string, IzmirStop[]>();

export function getOrderedStopsForDir(
  lineNum: string,
  dir: 0 | 1
): IzmirStop[] {
  const key = `${lineNum}_${dir}`;
  if (_orderedStopsCache.has(key)) return _orderedStopsCache.get(key)!;
  const seqs = getRouteStopSeqs();
  const idx = getStopIndex();
  const stopIds = seqs[key] ?? [];
  const result = stopIds.flatMap(id => { const s = idx.get(id); return s ? [s] : []; });
  _orderedStopsCache.set(key, result);
  return result;
}

export function findBoardAlightPair(
  lineNum: string,
  origin: { lat: number; lon: number },
  dest: { lat: number; lon: number }
): { board: IzmirStop; alight: IzmirStop; dir: 0 | 1 } | null {
  const ring = isRingRoute(lineNum);
  const dirs: (0 | 1)[] = ring ? [0] : [0, 1];
  let best: { board: IzmirStop; alight: IzmirStop; dir: 0 | 1; cost: number } | null = null;

  for (const dir of dirs) {
    const stops = getOrderedStopsForDir(lineNum, dir);
    if (stops.length < 2) continue;

    let boardI = 0, boardDist = haversineKm(origin, stops[0]);
    for (let i = 1; i < stops.length; i++) {
      const d = haversineKm(origin, stops[i]);
      if (d < boardDist) { boardDist = d; boardI = i; }
    }

    const alightStart = ring ? 0 : boardI + 1;
    if (alightStart >= stops.length) continue;

    let alightI = alightStart, alightDist = haversineKm(dest, stops[alightStart]);
    for (let i = alightStart + 1; i < stops.length; i++) {
      const d = haversineKm(dest, stops[i]);
      if (d < alightDist) { alightDist = d; alightI = i; }
    }

    if (alightI === boardI) continue;
    if (!ring && alightI < boardI) continue;

    const cost = boardDist + alightDist;
    if (!best || cost < best.cost) {
      best = { board: stops[boardI], alight: stops[alightI], dir, cost };
    }
  }

  return best ? { board: best.board, alight: best.alight, dir: best.dir } : null;
}
