export interface IzmirStop {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

interface StopRouteDir { lineNum: string; dir: 0 | 1; }

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
  if (!_stops) _stops = require('./gtfs/stops.json') as IzmirStop[];
  return _stops;
}

export function getStopIndex(): Map<string, IzmirStop> {
  if (!_stopIndex) {
    _stopIndex = new Map();
    for (const s of getStops()) _stopIndex.set(s.id, s);
  }
  return _stopIndex;
}

export function getStopRouteDirs(): Record<string, StopRouteDir[]> {
  if (!_stopRouteDirs) _stopRouteDirs = require('./gtfs/stop-route-dirs.json');
  return _stopRouteDirs!;
}

export function getRouteStopSeqs(): Record<string, string[]> {
  if (!_routeStopSeqs) _routeStopSeqs = require('./gtfs/route-stop-seqs.json');
  return _routeStopSeqs!;
}

export function isRingRoute(lineNum: string): boolean {
  if (!_ringRoutes) _ringRoutes = new Set(require('./gtfs/ring-routes.json') as string[]);
  return _ringRoutes.has(lineNum);
}

export function getRouteShape(lineNum: string, dir: 0 | 1): [number, number][] {
  if (!_shapes) _shapes = require('./gtfs/shapes.json');
  return _shapes![`${lineNum}_${dir}`] ?? [];
}

export function getRouteName(lineNum: string): string | undefined {
  if (!_routeMeta) _routeMeta = require('./gtfs/route-meta.json');
  return _routeMeta![lineNum]?.name;
}

export function getAllLines(): Array<{ lineNum: string; name: string }> {
  if (!_routeMeta) _routeMeta = require('./gtfs/route-meta.json');
  return Object.entries(_routeMeta!).map(([lineNum, { name }]) => ({ lineNum, name }));
}

const _linesNearCache = new Map<string, string[]>();

export function getLinesNearOrigin(
  origin: { lat: number; lon: number },
  radiusKm = 1.0
): string[] {
  const key = `${(origin.lat * 100) | 0},${(origin.lon * 100) | 0},${radiusKm}`;
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

    if (!ring && alightI <= boardI) continue;

    const cost = boardDist + alightDist;
    if (!best || cost < best.cost) {
      best = { board: stops[boardI], alight: stops[alightI], dir, cost };
    }
  }

  return best ? { board: best.board, alight: best.alight, dir: best.dir } : null;
}
