import { getOrderedStopsForDir, getStopIndex } from '../../data/gtfsData';

const BASE = 'https://openapi.izmir.bel.tr/api/iztek';
const MINS_PER_STOP = 1.5;
const BUS_SPEED_KMH = 22;

const IZTEK_STOPS: Array<{ id: number; lat: number; lon: number }> =
  require('../../data/iztek-stops.json');

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

function kdNearestN(
  root: KDNode | null,
  lat: number,
  lon: number,
  n: number,
  maxDistKm: number
): Array<{ id: number; lat: number; lon: number; dist: number }> {
  const results: Array<{ id: number; lat: number; lon: number; dist: number }> = [];
  function search(node: KDNode | null, depth: number): void {
    if (!node) return;
    const d = distKm(lat, lon, node.lat, node.lon);
    if (d <= maxDistKm) results.push({ id: node.id, lat: node.lat, lon: node.lon, dist: d });
    const axis = depth % 2 === 0 ? 'lat' : 'lon';
    const diff = axis === 'lat' ? lat - node.lat : lon - node.lon;
    const axialDist = Math.abs(diff) * (axis === 'lat' ? 111 : 111 * Math.cos(lat * Math.PI / 180));
    const [near, far] = diff < 0 ? [node.left, node.right] : [node.right, node.left];
    search(near, depth + 1);
    if (axialDist < maxDistKm) search(far, depth + 1);
  }
  search(root, 0);
  return results.sort((a, b) => a.dist - b.dist).slice(0, n);
}

export function bestIztekStopId(
  lat: number,
  lon: number,
  lineNum: string,
  dir: 0 | 1,
  boardStopId: string
): number | null {
  const candidates = kdNearestN(getKDTree(), lat, lon, 5, 0.5);
  if (candidates.length === 0) return null;

  const orderedStops = getOrderedStopsForDir(lineNum, dir);
  const stopIdx = getStopIndex();
  const boardIdx = orderedStops.findIndex(s => s.id === boardStopId);

  const scored = candidates.map(c => {
    const gtfsMatch = orderedStops.find(s => {
      const gs = stopIdx.get(s.id);
      return gs && distKm(gs.lat, gs.lon, c.lat, c.lon) < 0.05;
    });
    const seqIdx = gtfsMatch ? orderedStops.findIndex(s => s.id === gtfsMatch.id) : -1;
    const sequenceScore = seqIdx >= 0 && boardIdx >= 0
      ? Math.max(0, 1 - Math.abs(seqIdx - boardIdx) / Math.max(orderedStops.length, 1))
      : 0;
    return { id: c.id, distKm: c.dist, sequenceScore };
  });

  const best = scored.sort((a, b) => {
    const sA = (1 - Math.min(a.distKm / 0.5, 1)) * 0.6 + a.sequenceScore * 0.4;
    const sB = (1 - Math.min(b.distKm / 0.5, 1)) * 0.6 + b.sequenceScore * 0.4;
    return sB - sA;
  })[0];

  return best.distKm < 0.3 ? best.id : null;
}

export interface ApproachingBus {
  otobusId: number;
  hatNumarasi: number;
  hatAdi: string;
  kalanDurakSayisi: number;
  yon: number;
  lat: number;
  lon: number;
}

export async function getApproachingBuses(
  iztekStopId: number,
  expectedDir?: 0 | 1
): Promise<ApproachingBus[]> {
  try {
    const res = await fetch(`${BASE}/duragayaklasanotobusler/${iztekStopId}`);
    const json = await res.json();
    if (!Array.isArray(json)) return [];
    const buses: ApproachingBus[] = json.map((b: any) => ({
      otobusId: b.OtobusId,
      hatNumarasi: b.HatNumarasi,
      hatAdi: b.HatAdi ?? '',
      kalanDurakSayisi: b.KalanDurakSayisi ?? 0,
      yon: b.Yon ?? 0,
      lat: parseCoord(b.KoorX),
      lon: parseCoord(b.KoorY),
    }));
    if (expectedDir !== undefined) {
      return buses.filter(b => b.yon === expectedDir);
    }
    return buses;
  } catch {
    return [];
  }
}

export interface BusPosition {
  otobusId: number;
  yon: number;
  lat: number;
  lon: number;
}

export async function getLineBusPositions(lineNumber: string): Promise<BusPosition[]> {
  try {
    const res = await fetch(`${BASE}/hatotobuskonumlari/${lineNumber}`);
    const json = await res.json();
    if (json.HataVarMi) return [];
    return (json.HatOtobusKonumlari ?? [])
      .map((b: any) => ({
        otobusId: b.OtobusId,
        yon: b.Yon,
        lat: parseCoord(b.KoorX),
        lon: parseCoord(b.KoorY),
      }))
      .filter((b: BusPosition) => b.lat !== 0 && b.lon !== 0);
  } catch {
    return [];
  }
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

export function estimateArrivalFromPosition(
  buses: BusPosition[],
  stopLat: number,
  stopLon: number
): number | null {
  if (buses.length === 0) return null;
  const minDist = Math.min(...buses.map(b => distKm(b.lat, b.lon, stopLat, stopLon)));
  return Math.max(1, Math.round((minDist / BUS_SPEED_KMH) * 60 * getTrafficMultiplier()));
}
