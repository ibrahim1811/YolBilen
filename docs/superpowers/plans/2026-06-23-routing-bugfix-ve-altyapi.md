# Routing Bug Fix ve Altyapı Güçlendirmesi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 6 kritik bug'ı düzelt, RouteGraph/KD-Tree/ScoreSystem/SunCache/Confidence/Warm-up/Replay altyapısını ekle.

**Architecture:** Mevcut GTFS lazy-load katmanı üzerine; yeni servisler `src/services/routing/` altında toplanır. Bug fix'ler mevcut dosyaları minimal değiştirir.

**Tech Stack:** TypeScript strict, React Native, Expo SDK 56, Firebase Firestore, Leaflet WebView

## Global Constraints

- TypeScript strict — `undefined` Firestore'a gönderilmez, her `noEmit` temiz olmalı
- Yeni dosya için `Write`, mevcut dosya için `Edit`
- Her task sonunda `npx tsc --noEmit` + commit
- Delta Updates ve gerçek CDN altyapısı bu planın kapsamı dışında

---

## Task 1: Küçük Bug Fix'ler — scheduleService + gtfsData

**Files:**
- Modify: `src/services/firebase/scheduleService.ts:117`
- Modify: `src/data/gtfsData.ts:112-115` (findBoardAlightPair board loop)

**Interfaces:**
- `getNextArrivalMins(lineNumber)` — artık gidiş+dönüş tarifelerini birleştirir
- `findBoardAlightPair` — artık son durağı da biniş adayı olarak değerlendirir

- [ ] **Step 1: scheduleService.ts — gidis+donus birleştir**

`src/services/firebase/scheduleService.ts` dosyasında `getNextArrivalMins` fonksiyonunu bul (satır 114):

```typescript
export function getNextArrivalMins(lineNumber: string): number {
  const schedule = bundledFallback(lineNumber);
  const svcType = todayServiceType();
  // ESKİ: const times = schedule?.[svcType]?.gidis ?? [];
  const times = [
    ...(schedule?.[svcType]?.gidis ?? []),
    ...(schedule?.[svcType]?.donus ?? []),
  ];
  if (times.length === 0) return 15;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const result = Math.min(...times.map(t => minsUntil(t, nowMins)));
  return isFinite(result) && result <= 90 ? result : 999;
}
```

- [ ] **Step 2: gtfsData.ts — son durağı board adayı yap**

`src/data/gtfsData.ts` dosyasında `findBoardAlightPair` içinde board arama döngüsünü bul:

```typescript
// ESKİ:
let boardI = 0, boardDist = haversineKm(origin, stops[0]);
for (let i = 1; i < stops.length - 1; i++) {

// YENİ: (stops.length - 1 yerine stops.length)
let boardI = 0, boardDist = haversineKm(origin, stops[0]);
for (let i = 1; i < stops.length; i++) {
```

- [ ] **Step 3: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/services/firebase/scheduleService.ts src/data/gtfsData.ts
git commit -m "fix: scheduleService gidis+donus birleştirme, gtfsData son durak fix"
```

---

## Task 2: İZTEK Direction Filtering + KD-Tree Spatial Index

**Files:**
- Modify: `src/services/iztek/iztekService.ts`

**Interfaces:**
- `nearestIztekStopId(lat, lon)` — O(N) → O(log N) KD-Tree ile
- `getApproachingBuses(iztekStopId, expectedDir?)` — yön filtresi parametresi eklendi
- `minsFromRemainingStops` — değişmez

- [ ] **Step 1: iztekService.ts'i tamamen değiştir**

`src/services/iztek/iztekService.ts` dosyasını şununla değiştir:

```typescript
const BASE = 'https://openapi.izmir.bel.tr/api/iztek';
const MINS_PER_STOP = 1.5;
const BUS_SPEED_KMH = 22;

const IZTEK_STOPS: Array<{ id: number; lat: number; lon: number }> =
  require('../../data/iztek-stops.json');

// ─── KD-Tree ────────────────────────────────────────────────────────────────

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
  if (!_kdRoot) _kdRoot = buildKD(IZTEK_STOPS);
  return _kdRoot!;
}

// ─── Yardımcı ────────────────────────────────────────────────────────────────

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

// ─── Public API ──────────────────────────────────────────────────────────────

export function nearestIztekStopId(lat: number, lon: number): number | null {
  const result = kdNearest(getKDTree(), lat, lon);
  return result.dist < 0.2 ? result.id : null;
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

export function minsFromRemainingStops(kalanDurak: number): number {
  return Math.max(1, Math.round(kalanDurak * MINS_PER_STOP));
}

export function estimateArrivalFromPosition(
  buses: BusPosition[],
  stopLat: number,
  stopLon: number
): number | null {
  if (buses.length === 0) return null;
  const minDist = Math.min(...buses.map(b => distKm(b.lat, b.lon, stopLat, stopLon)));
  return Math.max(1, Math.round((minDist / BUS_SPEED_KMH) * 60));
}
```

- [ ] **Step 2: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/services/iztek/iztekService.ts
git commit -m "feat: KD-Tree spatial index, İZTEK yön filtresi — O(N)->O(logN)"
```

---

## Task 3: RouteGraph Adjacency List

**Files:**
- Create: `src/data/routeGraph.ts`

**Interfaces:**
- `buildRouteGraph()` → `RouteGraph` (Map<stopId, GraphEdge[]>)
- `getGraph()` — lazy singleton, tüm dosyadan erişilebilir

- [ ] **Step 1: routeGraph.ts oluştur**

```typescript
import { getStops, getOrderedStopsForDir, getAllLines } from './gtfsData';

export interface GraphEdge {
  toStopId: string;
  lineNum: string;
  dir: 0 | 1;
  travelCost: number; // tahmini dakika
}

export type RouteGraph = Map<string, GraphEdge[]>;

const MINS_PER_STOP = 1.5;

let _graph: RouteGraph | null = null;

export function getGraph(): RouteGraph {
  if (_graph) return _graph;
  _graph = new Map();
  const lines = getAllLines();

  for (const { lineNum } of lines) {
    for (const dir of [0, 1] as (0 | 1)[]) {
      const stops = getOrderedStopsForDir(lineNum, dir);
      for (let i = 0; i < stops.length - 1; i++) {
        const from = stops[i];
        const to = stops[i + 1];
        if (!_graph.has(from.id)) _graph.set(from.id, []);
        _graph.get(from.id)!.push({
          toStopId: to.id,
          lineNum,
          dir,
          travelCost: MINS_PER_STOP,
        });
      }
    }
  }
  return _graph;
}

export function getNeighbors(stopId: string): GraphEdge[] {
  return getGraph().get(stopId) ?? [];
}

export function getGraphStats(): { nodes: number; edges: number } {
  const g = getGraph();
  let edges = 0;
  g.forEach(v => { edges += v.length; });
  return { nodes: g.size, edges };
}
```

- [ ] **Step 2: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/data/routeGraph.ts
git commit -m "feat: RouteGraph adjacency list — Dijkstra/A* altyapısı"
```

---

## Task 4: SunCache

**Files:**
- Create: `src/services/sun/sunCache.ts`
- Modify: `src/services/sun/sunAnalysis.ts`

**Interfaces:**
- `getCachedSunAnalysis(lineNum, dir, hour, month, waypoints)` → `SunAnalysis`
- Mevcut `analyzeSunExposureAlongRoute` imzası değişmez

- [ ] **Step 1: sunCache.ts oluştur**

```typescript
import type { SunAnalysis } from '../../types';
import { analyzeSunExposureAlongRoute } from './sunAnalysis';

const _cache = new Map<string, SunAnalysis>();

function cacheKey(lineNum: string, dir: 0 | 1, hour: number, month: number): string {
  return `${lineNum}_${dir}_${hour}_${month}`;
}

export function getCachedSunAnalysis(
  lineNum: string,
  dir: 0 | 1,
  waypoints: Array<{ latitude: number; longitude: number }>,
  date: Date
): SunAnalysis {
  const hour = date.getHours();
  const month = date.getMonth();
  const key = cacheKey(lineNum, dir, hour, month);
  if (_cache.has(key)) return _cache.get(key)!;
  const result = analyzeSunExposureAlongRoute(waypoints, date);
  _cache.set(key, result);
  return result;
}

export function clearSunCache(): void {
  _cache.clear();
}
```

- [ ] **Step 2: routingService.ts'de sunAnalysisForSteps'i cache kullancak şekilde güncelle**

`src/services/sun/sunAnalysis.ts` veya `routingService.ts` içinde `sunAnalysisForSteps` çağrısını şununla değiştir:

```typescript
// routingService.ts import ekle
import { getCachedSunAnalysis } from '../sun/sunCache';

// sunAnalysisForSteps fonksiyonunu güncelle:
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
```

`findRoutes` içindeki `sunAnalysis: sunAnalysisForSteps(steps, origin, destination)` çağrısını:
```typescript
sunAnalysis: sunAnalysisForSteps(steps, origin, destination, lineNum, pair.dir),
```

- [ ] **Step 3: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/services/sun/sunCache.ts src/services/gtfs/routingService.ts
git commit -m "feat: SunCache — lineNum+dir+hour+month anahtarıyla güneş analizi önbellekleme"
```

---

## Task 5: routingService.ts — Büyük Düzeltme

**Files:**
- Modify: `src/services/gtfs/routingService.ts`

**Düzeltilen sorunlar:**
- BUG 1: findTransferRoutes board1 tüm durakları tarar
- BUG 2: `break` → `continue` (line2 === line1 için)
- BUG 3: crowdLevel sahte → busCardService'den gerçek skor
- BUG 4: liveNextArrival yön filtresi ile çağrılır
- EKSİKLİK 1: transfer walk adımı steps'e eklenir
- EKSİKLİK 3: Promise.all paralel
- EKSİKLİK 4: sortRoutes 'cool' düzeltilir
- Route Score: weighted scoring eklenir
- Route Confidence: 0-100 güven skoru eklenir

- [ ] **Step 1: Route ve RouteStop tiplerine score ve confidence ekle**

`src/types/index.ts` dosyasında `Route` interface'ini bul ve şunu ekle:

```typescript
export interface Route {
  // ... mevcut alanlar ...
  score?: number;       // weighted route score (düşük = daha iyi)
  confidence?: number;  // 0-100 güven skoru
}
```

- [ ] **Step 2: routingService.ts'i tamamen yeniden yaz**

Aşağıdaki tam dosya içeriğini `src/services/gtfs/routingService.ts` olarak yaz:

```typescript
import type { Route, Location, CrowdLevel, RouteStop, RouteStep, RouteFilterMode, SunAnalysis } from '../../types';
import {
  findBoardAlightPair,
  getLinesNearOrigin,
  getOrderedStopsForDir,
  getRouteName,
  getStopIndex,
} from '../../data/gtfsData';
import { getCachedSunAnalysis } from '../sun/sunCache';
import { getNextArrivalMins } from '../firebase/scheduleService';
import { getApproachingBuses, nearestIztekStopId, minsFromRemainingStops } from '../iztek/iztekService';
import { getBusCard } from '../firebase/busCardService';

const MAX_WALK_KM = 1.5;
const MAX_TRANSFER_WALK_KM = 0.6;

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
  dir: 0 | 1
): Promise<number> {
  const iztekId = nearestIztekStopId(lat, lon);
  if (iztekId) {
    try {
      const buses = await getApproachingBuses(iztekId, dir);
      const match = buses.find(b => String(b.hatNumarasi) === lineNum);
      if (match) return minsFromRemainingStops(match.kalanDurakSayisi);
    } catch {}
  }
  return getNextArrivalMins(lineNum);
}

async function getCrowdLevel(lineNum: string): Promise<CrowdLevel> {
  try {
    const card = await getBusCard(lineNum);
    if (!card || card.totalReports < 3) return 'low';
    if (card.crowdScore >= 8) return 'low';
    if (card.crowdScore >= 5) return 'medium';
    if (card.crowdScore >= 3) return 'high';
    return 'very_high';
  } catch {
    return 'low';
  }
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
    ? Math.abs((sunAnalysis.leftPercentage > 50 ? sunAnalysis.leftPercentage : sunAnalysis.rightPercentage) - 50)
    : 0;
  return (
    estimatedDuration * 0.4 +
    (walkMeters / 1000) * 20 * 0.2 +
    transferCount * 15 * 0.2 +
    crowdPenalty[crowdLevel] * 0.1 +
    sunPenalty * 0.1
  );
}

function calcConfidence(hasLiveData: boolean, totalReports: number): number {
  let score = 0;
  if (hasLiveData) score += 40;
  if (totalReports >= 10) score += 30;
  else if (totalReports >= 3) score += 15;
  score += 30; // GTFS data always present
  return Math.min(100, score);
}

export async function findRoutes(origin: Location, destination: Location): Promise<Route[]> {
  const candidateLines = getLinesNearOrigin(
    { lat: origin.latitude, lon: origin.longitude },
    MAX_WALK_KM
  );

  // Paralel: tüm hatlar için board/alight pair bul
  const pairs = candidateLines.map(lineNum => ({
    lineNum,
    name: getRouteName(lineNum),
    pair: findBoardAlightPair(
      lineNum,
      { lat: origin.latitude, lon: origin.longitude },
      { lat: destination.latitude, lon: destination.longitude }
    ),
  })).filter(x => x.name && x.pair);

  // Yürüyüş mesafesi filtresi
  const valid = pairs.filter(({ pair }) => {
    const boardWalk = haversineKm(
      { lat: origin.latitude, lon: origin.longitude },
      { lat: pair!.board.lat, lon: pair!.board.lon }
    );
    const alightWalk = haversineKm(
      { lat: destination.latitude, lon: destination.longitude },
      { lat: pair!.alight.lat, lon: pair!.alight.lon }
    );
    return boardWalk <= MAX_WALK_KM && alightWalk <= MAX_WALK_KM;
  }).slice(0, 5);

  // Paralel: tüm hatlar için canlı varış ve kalabalık bilgisi
  const [arrivals, crowdLevels] = await Promise.all([
    Promise.all(valid.map(({ pair, lineNum }) =>
      liveNextArrival(lineNum, pair!.board.lat, pair!.board.lon, pair!.dir)
    )),
    Promise.all(valid.map(({ lineNum }) => getCrowdLevel(lineNum))),
  ]);

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

  return results;
}

async function findTransferRoutes(origin: Location, destination: Location): Promise<Route[]> {
  const results: Route[] = [];
  const stopIdx = getStopIndex();
  const line1Candidates = getLinesNearOrigin(
    { lat: origin.latitude, lon: origin.longitude },
    MAX_WALK_KM
  );

  for (const line1 of line1Candidates) {
    if (results.length >= 3) break;
    const name1 = getRouteName(line1);
    if (!name1) continue;

    // board1: origin'e en yakın durak
    const pair1board = findBoardAlightPair(
      line1,
      { lat: origin.latitude, lon: origin.longitude },
      { lat: origin.latitude, lon: origin.longitude } // sadece board için — dest kendisi
    );
    if (!pair1board) continue;

    // line1'in board1'inden sonraki tüm durakları tara
    const line1Stops = getOrderedStopsForDir(line1, pair1board.dir);
    const boardIdx = line1Stops.findIndex(s => s.id === pair1board.board.id);
    if (boardIdx < 0) continue;

    for (let midIdx = boardIdx + 2; midIdx < line1Stops.length; midIdx++) {
      if (results.length >= 3) break;
      const midStop = line1Stops[midIdx];

      // Bu ara durağa yakın line2 ara
      const line2Candidates = getLinesNearOrigin(
        { lat: midStop.lat, lon: midStop.lon },
        MAX_TRANSFER_WALK_KM
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
        if (alightWalk > MAX_WALK_KM) continue;

        const alightMidStop = line1Stops[midIdx]; // line1'den ineceğimiz durak
        const board1: RouteStop = { id: pair1board.board.id, name: pair1board.board.name, latitude: pair1board.board.lat, longitude: pair1board.board.lon };
        const alight1: RouteStop = { id: alightMidStop.id, name: alightMidStop.name, latitude: alightMidStop.lat, longitude: alightMidStop.lon };
        const board2: RouteStop = { id: pair2.board.id, name: pair2.board.name, latitude: pair2.board.lat, longitude: pair2.board.lon };
        const alight2: RouteStop = { id: pair2.alight.id, name: pair2.alight.name, latitude: pair2.alight.lat, longitude: pair2.alight.lon };

        const transferWalkKm = haversineKm(
          { lat: alight1.latitude, lon: alight1.longitude },
          { lat: board2.latitude, lon: board2.longitude }
        );
        const transferWalkMins = Math.round(transferWalkKm * 12);

        const [arr1, arr2, crowd1, crowd2] = await Promise.all([
          liveNextArrival(line1, pair1board.board.lat, pair1board.board.lon, pair1board.dir),
          liveNextArrival(line2, pair2.board.lat, pair2.board.lon, pair2.dir),
          getCrowdLevel(line1),
          getCrowdLevel(line2),
        ]);

        const midDest: Location = { name: alight1.name, latitude: alight1.latitude, longitude: alight1.longitude };
        const steps1 = buildSteps(origin, midDest, line1, pair1board.dir, board1, alight1, arr1);
        const midOrigin: Location = { name: board2.name, latitude: board2.latitude, longitude: board2.longitude };
        const steps2 = buildSteps(midOrigin, destination, line2, pair2.dir, board2, alight2, arr2);

        // EKSİKLİK 1: aktarma yürüyüş adımı steps'e eklenir
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
        const sunAnalysis = sunAnalysisForSteps(steps1, origin, destination, line1, pair1board.dir);
        const score = calcRouteScore(totalDuration, walkMeters, 1, crowdLevel, sunAnalysis);
        const confidence = calcConfidence(arr1 < 999, 0);

        results.push({
          id: `transfer-${line1}-${line2}-${pair1board.dir}-${midIdx}`,
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
        });
        break; // bu mid durağında ilk geçerli aktarma yeterli
      }
    }
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
      // EKSİKLİK 4 fix: en az güneş maruziyeti = en serin. leftPercentage 50'den fazlaysa sol güneşli, sağda otur
      return [...routes].sort((a, b) => {
        const sunA = a.sunAnalysis ? Math.max(a.sunAnalysis.leftPercentage, a.sunAnalysis.rightPercentage) : 50;
        const sunB = b.sunAnalysis ? Math.max(b.sunAnalysis.leftPercentage, b.sunAnalysis.rightPercentage) : 50;
        return sunA - sunB; // en az güneş maruziyeti önce
      });
    case 'least_transfers':
      return [...routes].sort((a, b) => a.transfers.length - b.transfers.length);
    case 'night_safe':
      // Gece güvenli: en az aktarma ve en kısa yürüyüş
      return [...routes].sort((a, b) => {
        const walkA = a.steps?.filter(s => s.type === 'walk').reduce((s, st) => s + (st.distanceMeters ?? 0), 0) ?? 0;
        const walkB = b.steps?.filter(s => s.type === 'walk').reduce((s, st) => s + (st.distanceMeters ?? 0), 0) ?? 0;
        return (a.transfers.length * 1000 + walkA) - (b.transfers.length * 1000 + walkB);
      });
    default:
      return routes;
  }
}
```

- [ ] **Step 3: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/services/gtfs/routingService.ts src/types/index.ts
git commit -m "fix: aktarmalı rota algoritması, paralel API, crowdLevel gerçek, yön filtresi, score+confidence"
```

---

## Task 6: RouteMapScreen — Tüm Transit Segmentleri

**Files:**
- Modify: `src/screens/RouteMapScreen.tsx`

**Problem:** `steps.find(s => s.type === 'transit')` sadece ilk segmenti çiziyor. Aktarmalı rotada ikinci hat haritada görünmüyor.

- [ ] **Step 1: buildMapHtml'de tüm transit adımları bul**

`src/screens/RouteMapScreen.tsx` dosyasında `buildMapHtml` fonksiyonu içinde:

```typescript
// ESKİ:
const transitStep = steps?.find(s => s.type === 'transit');
const midStops = transitStep?.intermediateStops ?? [];
const boardStop = transitStep?.boardStop ?? null;
const alightStop = transitStep?.alightStop ?? null;
```

Yerine:
```typescript
const transitSteps = steps?.filter(s => s.type === 'transit') ?? [];
const transitStep = transitSteps[0] ?? null; // geriye dönük uyumluluk
const midStops = transitStep?.intermediateStops ?? [];
const boardStop = transitStep?.boardStop ?? null;
const alightStop = transitStep?.alightStop ?? null;
```

- [ ] **Step 2: İkinci transit segmenti için ayrı OSRM + marker ekle**

`buildMapHtml` fonksiyonu içinde `osrmFetchJs` tanımının hemen altına:

```typescript
// İkinci transit segment (aktarmalı rota)
const transit2 = transitSteps[1];
const transit2Coords: [number, number][] = transit2?.boardStop && transit2?.alightStop
  ? [
      [transit2.boardStop.latitude, transit2.boardStop.longitude],
      ...(transit2.intermediateStops ?? []).map(s => [s.latitude, s.longitude] as [number, number]),
      [transit2.alightStop.latitude, transit2.alightStop.longitude],
    ]
  : [];

const osrm2Coords = transit2Coords.map(([lat, lon]) => `${lon},${lat}`).join(';');
const fallback2Pts = JSON.stringify(transit2Coords);

const osrm2FetchJs = transit2Coords.length >= 2
  ? `fetch('https://router.project-osrm.org/route/v1/driving/${osrm2Coords}?overview=full&geometries=geojson')` +
    `.then(function(r){return r.json();})` +
    `.then(function(data){` +
    `if(data.routes&&data.routes[0]){` +
    `var coords=data.routes[0].geometry.coordinates.map(function(c){return[c[1],c[0]];});` +
    `L.polyline(coords,{color:'#E91E63',weight:5,opacity:0.9,lineJoin:'round'}).addTo(map);` +
    `}else{L.polyline(${fallback2Pts},{color:'#E91E63',weight:5,dashArray:'10,5'}).addTo(map);}` +
    `}).catch(function(){L.polyline(${fallback2Pts},{color:'#E91E63',weight:5,dashArray:'10,5'}).addTo(map);});`
  : '';

// transit2 ara duraklar (turuncu yerine pembe)
const intermediate2Js = (transit2?.intermediateStops ?? [])
  .map(s =>
    `L.circleMarker([${s.latitude},${s.longitude}],` +
    `{radius:5,color:'#E91E63',fillColor:'#E91E63',fillOpacity:0.7,weight:2})` +
    `.addTo(map);`
  ).join('\n');
```

HTML `<script>` bloğuna `${osrm2FetchJs}` ve `${intermediate2Js}` ekle.

- [ ] **Step 3: RouteMapScreen'de transitStep kullanımını güncelle**

`RouteMapScreen` component içinde:

```typescript
const routeTransitStep = route.steps?.find(s => s.type === 'transit');
```

Bu satır değişmez (geriye dönük uyumlu). Ama legend'da aktarma var mı kontrol ekle:

```typescript
const hasTransfer = (route.steps?.filter(s => s.type === 'transit').length ?? 0) > 1;
```

Legend bölümünde:
```typescript
{hasTransfer && (
  <Text variant="bodySmall" style={{ color: '#E91E63', marginTop: 2 }}>
    🔄 Aktarmalı rota — ikinci hat pembe ile gösterilir
  </Text>
)}
```

- [ ] **Step 4: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/screens/RouteMapScreen.tsx
git commit -m "fix: RouteMapScreen aktarmalı rotada ikinci segmenti haritada gösterir"
```

---

## Task 7: Background Warm-up Servisi

**Files:**
- Create: `src/services/background/warmupService.ts`
- Modify: `src/navigation/AppNavigator.tsx`

**Logic:** Uygulama açılınca arka planda GTFS grid, RouteGraph ve İZTEK KD-Tree'yi hazırlar.

- [ ] **Step 1: warmupService.ts oluştur**

```typescript
import { getStops, getLinesNearOrigin, getStopIndex } from '../../data/gtfsData';
import { getGraph } from '../../data/routeGraph';
import { nearestIztekStopId } from '../iztek/iztekService';

let _warmedUp = false;

export function warmupRouting(): void {
  if (_warmedUp) return;
  _warmedUp = true;
  // setTimeout ile ana thread'i bloke etme
  setTimeout(() => {
    try {
      getStops();          // stops.json lazy-load
      getStopIndex();      // stopIndex map
      getLinesNearOrigin({ lat: 38.4189, lon: 27.1287 }, 0.1); // grid build
      nearestIztekStopId(38.4189, 27.1287);                     // KD-Tree build
      getGraph();          // RouteGraph adjacency list
    } catch {}
  }, 2000); // login/onboarding animasyonu bittikten sonra
}
```

- [ ] **Step 2: AppNavigator'da warmup çağır**

`src/navigation/AppNavigator.tsx` dosyasında:

```typescript
import { warmupRouting } from '../services/background/warmupService';
```

`AppNavigator` içinde `useEffect` ekle:

```typescript
React.useEffect(() => {
  warmupRouting();
}, []);
```

- [ ] **Step 3: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/services/background/warmupService.ts src/navigation/AppNavigator.tsx
git commit -m "feat: background warm-up — GTFS grid + KD-Tree + RouteGraph uygulama açılışında hazırlanır"
```

---

## Task 8: Route Replay Ekranı

**Files:**
- Create: `src/screens/RouteReplayScreen.tsx`
- Modify: `src/navigation/AppNavigator.tsx`
- Modify: `src/types/index.ts`
- Modify: `src/screens/RouteResultScreen.tsx` (buton ekle)

**Logic:** Leaflet haritasında otobüs ikonu rota boyunca animasyonlu ilerler. SunCalc anlık güneş pozisyonunu gösterir.

- [ ] **Step 1: RootStackParamList'e RouteReplay ekle**

`src/types/index.ts` dosyasında:

```typescript
RouteReplay: { route: Route };
```

- [ ] **Step 2: RouteReplayScreen.tsx oluştur**

```typescript
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Appbar, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'RouteReplay'>;

function buildReplayHtml(waypoints: Array<{ lat: number; lon: number; label: string }>): string {
  const pts = JSON.stringify(waypoints.map(p => [p.lat, p.lon]));
  const labels = JSON.stringify(waypoints.map(p => p.label));

  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#map{margin:0;padding:0;height:100%;width:100%;}</style>
</head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var pts=${pts};
var labels=${labels};
var map=L.map('map',{zoomControl:true});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OSM'}).addTo(map);

// Güzergah çiz
L.polyline(pts,{color:'#1A73E8',weight:4,opacity:0.7}).addTo(map);
map.fitBounds(pts,{padding:[40,40]});

// Durak işaretleri
pts.forEach(function(p,i){
  L.circleMarker(p,{radius:5,color:'#1A73E8',fillColor:'#fff',fillOpacity:1,weight:2})
   .bindPopup(labels[i]).addTo(map);
});

// Otobüs ikonu
var busIcon=L.divIcon({
  html:'<div style="font-size:28px;line-height:1;">🚌</div>',
  iconSize:[32,32],iconAnchor:[16,16],className:''
});
var busMarker=L.marker(pts[0],{icon:busIcon}).addTo(map);

// Animasyon
var idx=0;
var timer=setInterval(function(){
  idx++;
  if(idx>=pts.length){
    clearInterval(timer);
    return;
  }
  busMarker.setLatLng(pts[idx]);
  map.panTo(pts[idx],{animate:true,duration:0.8});
},800);
</script></body></html>`;
}

export function RouteReplayScreen({ navigation, route: navRoute }: Props) {
  const theme = useTheme();
  const { route } = navRoute.params;

  const transitSteps = route.steps?.filter(s => s.type === 'transit') ?? [];
  const waypoints: Array<{ lat: number; lon: number; label: string }> = [];

  if (route.boardingStop) {
    waypoints.push({ lat: route.boardingStop.latitude, lon: route.boardingStop.longitude, label: '📍 Başlangıç' });
  }

  for (const step of transitSteps) {
    if (step.boardStop) {
      waypoints.push({ lat: step.boardStop.latitude, lon: step.boardStop.longitude, label: `🟢 Biniş: ${step.boardStop.name}` });
    }
    for (const mid of step.intermediateStops ?? []) {
      waypoints.push({ lat: mid.latitude, lon: mid.longitude, label: mid.name });
    }
    if (step.alightStop) {
      waypoints.push({ lat: step.alightStop.latitude, lon: step.alightStop.longitude, label: `🔴 İniş: ${step.alightStop.name}` });
    }
  }

  if (route.alightingStop) {
    waypoints.push({ lat: route.alightingStop.latitude, lon: route.alightingStop.longitude, label: '🏁 Varış' });
  }

  const html = buildReplayHtml(waypoints.length > 0 ? waypoints : [
    { lat: 38.4189, lon: 27.1287, label: 'İzmir' },
  ]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <Appbar.Header elevated>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content
          title="Rota Replay"
          subtitle={`${route.lineNumber} · ${route.estimatedDuration} dk`}
        />
      </Appbar.Header>
      <WebView
        style={styles.map}
        source={{ html }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
      />
      <View style={[styles.legend, { backgroundColor: theme.colors.surface }]}>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          🚌 Otobüs rotası boyunca animasyonlu ilerliyor — {waypoints.length} durak
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  map: { flex: 1 },
  legend: { padding: 12, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.08)' },
});
```

- [ ] **Step 3: AppNavigator'a RouteReplay ekle**

`src/navigation/AppNavigator.tsx` dosyasında:

```typescript
import { RouteReplayScreen } from '../screens/RouteReplayScreen';
```

Stack.Navigator içine:
```typescript
<Stack.Screen
  name="RouteReplay"
  component={RouteReplayScreen}
  options={{ animation: 'slide_from_bottom' }}
/>
```

- [ ] **Step 4: RouteResultScreen'e Replay butonu ekle**

`src/screens/RouteResultScreen.tsx` dosyasında "Yolculuğu Başlat" butonunun yanına:

```typescript
<Button
  mode="outlined"
  icon="play-circle"
  onPress={() => navigation.navigate('RouteReplay', { route: selectedRoute })}
  style={styles.replayBtn}
>
  Rotayı Oynat
</Button>
```

StyleSheet'e:
```typescript
replayBtn: { marginTop: 8 },
```

- [ ] **Step 5: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/screens/RouteReplayScreen.tsx src/navigation/AppNavigator.tsx src/types/index.ts src/screens/RouteResultScreen.tsx
git commit -m "feat: Route Replay — rota boyunca animasyonlu otobüs simülasyonu"
```

---

## Self-Review

**Spec coverage:**
- ✅ BUG 1 aktarmalı rota — Task 5 (board1 tüm durakları tarar)
- ✅ BUG 2 break→continue — Task 5
- ✅ BUG 3 sahte crowdLevel — Task 5 (getCrowdLevel via busCardService)
- ✅ BUG 4 İZTEK yön — Task 5 + Task 2 (getApproachingBuses dir param)
- ✅ BUG 5 scheduleService — Task 1
- ✅ BUG 6 son durak — Task 1
- ✅ EKSİKLİK 1 transfer walk step — Task 5
- ✅ EKSİKLİK 2 harita çok segment — Task 6
- ✅ EKSİKLİK 3 paralel API — Task 5 (Promise.all)
- ✅ EKSİKLİK 4 cool sort — Task 5
- ✅ RouteGraph adjacency list — Task 3
- ✅ KD-Tree — Task 2
- ✅ Route Score System — Task 5
- ✅ SunCache — Task 4
- ✅ Route Confidence — Task 5
- ✅ Background Warm-up — Task 7
- ✅ Route Replay — Task 8
- ⛔ Delta Updates — Kapsam dışı (CDN altyapısı gerektirir)

**Placeholder scan:** Temiz.

**Type consistency:** `Route.score`, `Route.confidence` Task 1'de types'a ekleniyor, Task 5'te kullanılıyor. `RouteReplay` Task 8 Step 1'de types'a ekleniyor, Step 3'te AppNavigator'da kullanılıyor. ✅
