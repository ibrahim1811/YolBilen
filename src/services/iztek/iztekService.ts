import { getOrderedStopsForDir, getRouteShape } from '../../data/gtfsData';

const BASE = 'https://openapi.izmir.bel.tr/api/iztek';
const MINS_PER_STOP = 1.5;
const ESHOT_SPEED_KMH = 25;
const ROAD_FACTOR = 1.25;
const CACHE_TTL_MS = 20_000;
const RATE_LIMIT_COOLDOWN_MS = 60_000;

const IZTEK_STOPS: Array<{ id: number; lat: number; lon: number }> =
  require('../../data/iztek-stops.json');

let _iztekIds: Set<number> | null = null;
function getIztekIds(): Set<number> {
  if (!_iztekIds) _iztekIds = new Set(IZTEK_STOPS.map(s => s.id));
  return _iztekIds;
}

// ─── HTTP (önbellek + istek limiti) ──────────────────────────────────────────

export class IztekError extends Error {
  constructor(message: string, readonly rateLimited = false) {
    super(message);
    this.name = 'IztekError';
  }
}

const _cache = new Map<string, { at: number; data: unknown }>();
const _inflight = new Map<string, Promise<unknown>>();
let _rateLimitedUntil = 0;

function isRateLimitBody(json: unknown): boolean {
  const msg = (json as { message?: unknown } | null)?.message;
  return typeof msg === 'string' && /rate limit/i.test(msg);
}

async function iztekGet(path: string): Promise<unknown> {
  const hit = _cache.get(path);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  if (Date.now() < _rateLimitedUntil) {
    if (hit) return hit.data;
    throw new IztekError('İZTEK istek limiti aşıldı', true);
  }
  const pending = _inflight.get(path);
  if (pending) return pending;

  const request = (async () => {
    const res = await fetch(`${BASE}/${path}`);
    const json: unknown = await res.json().catch(() => null);
    if (res.status === 429 || isRateLimitBody(json)) {
      _rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
      if (hit) return hit.data;
      throw new IztekError('İZTEK istek limiti aşıldı', true);
    }
    if (!res.ok || json === null) throw new IztekError(`İZTEK yanıtı geçersiz (HTTP ${res.status})`);
    _cache.set(path, { at: Date.now(), data: json });
    return json;
  })().finally(() => _inflight.delete(path));

  _inflight.set(path, request);
  return request;
}

// ─── KD-Tree ─────────────────────────────────────────────────────────────────

interface KDNode {
  id: number;
  lat: number;
  lon: number;
  left: KDNode | null;
  right: KDNode | null;
}

function buildKD(points: Array<{ id: number; lat: number; lon: number }>, depth = 0): KDNode | null {
  if (points.length === 0) return null;
  const axis = depth % 2 === 0 ? 'lat' : 'lon';
  const sorted = [...points].sort((a, b) => a[axis] - b[axis]);
  const mid = Math.floor(sorted.length / 2);
  return {
    ...sorted[mid],
    left: buildKD(sorted.slice(0, mid), depth + 1),
    right: buildKD(sorted.slice(mid + 1), depth + 1),
  };
}

function kdNearest(
  node: KDNode | null,
  lat: number,
  lon: number,
  depth = 0,
  best: { id: number; dist: number } = { id: -1, dist: Infinity }
): { id: number; dist: number } {
  if (!node) return best;
  const d = distKm(lat, lon, node.lat, node.lon);
  if (d < best.dist) best = { id: node.id, dist: d };
  const axis = depth % 2 === 0 ? 'lat' : 'lon';
  const diff = axis === 'lat' ? lat - node.lat : lon - node.lon;
  const [near, far] = diff < 0 ? [node.left, node.right] : [node.right, node.left];
  best = kdNearest(near, lat, lon, depth + 1, best);
  const axialDist = Math.abs(diff) * (axis === 'lat' ? 111 : 111 * Math.cos(lat * Math.PI / 180));
  if (axialDist < best.dist) best = kdNearest(far, lat, lon, depth + 1, best);
  return best;
}

let _kdRoot: KDNode | null = null;
function getKDTree(): KDNode {
  if (!_kdRoot) _kdRoot = buildKD(IZTEK_STOPS)!;
  return _kdRoot;
}

// ─── Yardımcı ─────────────────────────────────────────────────────────────────

function parseCoord(val: string | number): number {
  return parseFloat(String(val).replace(',', '.'));
}

function distKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function nearestIztekStopId(lat: number, lon: number): number | null {
  const result = kdNearest(getKDTree(), lat, lon);
  return result.dist < 0.2 ? result.id : null;
}

// GTFS stop_id'leri İZTEK durak ID'leriyle aynı; koordinat tahmini yalnızca ID yoksa kullanılır.
export function resolveIztekStopId(gtfsStopId: string | undefined, lat: number, lon: number): number | null {
  const id = Number(gtfsStopId);
  if (gtfsStopId && Number.isInteger(id) && getIztekIds().has(id)) return id;
  return nearestIztekStopId(lat, lon);
}

export interface ApproachingBus {
  otobusId: number;
  hatNumarasi: number;
  hatAdi: string;
  kalanDurakSayisi: number;
  hattinYonu: number;
  lat: number;
  lon: number;
}

export async function getApproachingBuses(iztekStopId: number): Promise<ApproachingBus[]> {
  const json = await iztekGet(`duragayaklasanotobusler/${iztekStopId}`);
  if (!Array.isArray(json)) throw new IztekError('Beklenmeyen yanıt: duragayaklasanotobusler');
  const byBus = new Map<number, ApproachingBus>();
  for (const b of json) {
    const bus: ApproachingBus = {
      otobusId: b.OtobusId,
      hatNumarasi: b.HatNumarasi,
      hatAdi: b.HatAdi ?? '',
      kalanDurakSayisi: b.KalanDurakSayisi ?? 0,
      hattinYonu: b.HattinYonu ?? 0,
      lat: parseCoord(b.KoorX),
      lon: parseCoord(b.KoorY),
    };
    const prev = byBus.get(bus.otobusId);
    if (!prev || bus.kalanDurakSayisi < prev.kalanDurakSayisi) byBus.set(bus.otobusId, bus);
  }
  return [...byBus.values()].sort((a, b) => a.kalanDurakSayisi - b.kalanDurakSayisi);
}

export interface BusPosition {
  otobusId: number;
  yon: number;
  lat: number;
  lon: number;
}

export async function getLineBusPositions(lineNumber: string): Promise<BusPosition[]> {
  const json = (await iztekGet(`hatotobuskonumlari/${lineNumber}`)) as {
    HataVarMi?: boolean;
    HataMesaj?: string;
    HatOtobusKonumlari?: any[];
  };
  if (json.HataVarMi) throw new IztekError(json.HataMesaj || 'İZTEK hat konumu hatası');
  const seen = new Set<number>();
  return (json.HatOtobusKonumlari ?? [])
    .map((b: any) => ({
      otobusId: b.OtobusId,
      yon: b.Yon,
      lat: parseCoord(b.KoorX),
      lon: parseCoord(b.KoorY),
    }))
    .filter((b: BusPosition) => {
      if (b.lat === 0 || b.lon === 0 || seen.has(b.otobusId)) return false;
      seen.add(b.otobusId);
      return true;
    });
}

function getTrafficMultiplier(): number {
  const now = new Date();
  const h = now.getHours();
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  if (isWeekend) return h >= 11 && h < 20 ? 1.15 : 1.0;
  if ((h >= 7 && h < 9) || (h >= 17 && h < 19)) return 1.45;
  if ((h >= 9 && h < 12) || (h >= 19 && h < 21)) return 1.20;
  if (h >= 22 || h < 6) return 0.85;
  return 1.0;
}

export function minsFromRemainingStops(kalanDurak: number): number {
  return Math.max(1, Math.round(kalanDurak * MINS_PER_STOP * getTrafficMultiplier()));
}

function nearestShapeIdx(shape: [number, number][], lat: number, lon: number, endIdx: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i <= endIdx; i++) {
    const d = distKm(lat, lon, shape[i][0], shape[i][1]);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function alongShapeKm(
  shape: [number, number][],
  from: { lat: number; lon: number },
  to: { lat: number; lon: number }
): number | null {
  if (shape.length < 2) return null;
  const i1 = nearestShapeIdx(shape, to.lat, to.lon, shape.length - 1);
  const i0 = nearestShapeIdx(shape, from.lat, from.lon, i1);
  let km = distKm(from.lat, from.lon, shape[i0][0], shape[i0][1]);
  for (let i = i0; i < i1; i++) km += distKm(shape[i][0], shape[i][1], shape[i + 1][0], shape[i + 1][1]);
  return km;
}

interface BusOnRoute { km: number; offKm: number; atTerminal: boolean }

function locateBusOnRoute(bus: ApproachingBus, gtfsStopId: string): BusOnRoute | null {
  const lineNum = String(bus.hatNumarasi);
  let best: BusOnRoute | null = null;
  for (const dir of [0, 1] as const) {
    const stops = getOrderedStopsForDir(lineNum, dir);
    const target = stops.findIndex(s => s.id === gtfsStopId);
    const from = target - bus.kalanDurakSayisi;
    if (target < 0 || from < 0) continue;
    const offKm = distKm(bus.lat, bus.lon, stops[from].lat, stops[from].lon);
    let km = alongShapeKm(getRouteShape(lineNum, dir), bus, stops[target]);
    if (km === null) {
      const next = stops[Math.min(from + 1, target)];
      km = distKm(bus.lat, bus.lon, next.lat, next.lon);
      for (let i = from + 1; i < target; i++) {
        km += distKm(stops[i].lat, stops[i].lon, stops[i + 1].lat, stops[i + 1].lon);
      }
      km *= ROAD_FACTOR;
    }
    const atTerminal = from === 0 && offKm < 0.15;
    if (!best || offKm < best.offKm) best = { km, offKm, atTerminal };
  }
  return best && best.offKm <= 1.5 ? best : null;
}

// ESHOT Mobil gibi, ilk durakta kalkış bekleyen otobüsler gösterilmez.
export function isWaitingAtTerminal(bus: ApproachingBus, gtfsStopId?: string): boolean {
  return !!gtfsStopId && !!locateBusOnRoute(bus, gtfsStopId)?.atTerminal;
}

// ESHOT Mobil ile aynı mantık: güzergah boyunca kalan mesafe / sabit hız.
export function estimateArrivalMins(bus: ApproachingBus, gtfsStopId?: string): number {
  const located = gtfsStopId ? locateBusOnRoute(bus, gtfsStopId) : null;
  if (!located) return minsFromRemainingStops(bus.kalanDurakSayisi);
  return Math.max(1, Math.round((located.km / ESHOT_SPEED_KMH) * 60));
}
