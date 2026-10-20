# Kritik Sistem Düzeltmeleri — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GTFS verisiyle yön-bilinçli rota eşleştirmesi kur; GPS otomatik başlangıç, harita seçici, duraklar ekranı, feedback fix, per-segment güneş analizi ve AI özeti düzeltmelerini uygula.

**Architecture:** Offline Node.js build scripti GTFS dosyalarını işleyerek 6 compact JSON dosyası üretir; bunlar app bundle'a eklenir. `gtfsData.ts` bu dosyaları lazy olarak yükler ve `findBoardAlightPair` ile direction-aware durak seçimi yapar. `routingService.ts` eski `nearestStops+routesForStops` yaklaşımını terk eder.

**Tech Stack:** Node.js ESM script, TypeScript, Expo/React Native, react-native-webview (mevcut), SunCalc, Leaflet (CDN via WebView)

## Global Constraints
- Android Studio build bozulmamalı — yeni native paket eklenmez
- `android/` dizinine dokunulmaz
- TypeScript strict mode: `npx tsc --noEmit` temiz geçmeli
- GTFS kaynak: `C:\Users\Kayra\Downloads\bus-eshot-gtfs\`
- Output: `src/data/gtfs/` (6 JSON dosyası)
- route_id ≠ route_short_name olabilir — daima routes.txt üzerinden eşle

---

## Dosya Haritası

**Oluşturulacak:**
- `scripts/build-gtfs.mjs` — GTFS işleyici
- `src/data/gtfs/stops.json` — 11K durak (generated)
- `src/data/gtfs/stop-route-dirs.json` — stopId → [{lineNum, dir}] (generated)
- `src/data/gtfs/route-stop-seqs.json` — "lineNum_dir" → stopId[] (generated)
- `src/data/gtfs/ring-routes.json` — string[] (generated)
- `src/data/gtfs/shapes.json` — "lineNum_dir" → [lat,lon][] (generated)
- `src/data/gtfs/route-meta.json` — lineNum → {name} (generated)
- `src/components/common/MapPickerModal.tsx` — OSM harita seçici

**Değiştirilecek:**
- `src/data/gtfsData.ts` — yeni fonksiyonlar, eski kaldırılır
- `src/services/gtfs/routingService.ts` — direction-aware routing
- `src/screens/HomeScreen.tsx` — GPS auto-origin
- `src/screens/LinesScreen.tsx` — duraklar bölümü
- `src/components/route/AiSummaryCard.tsx` — boş string fix
- `src/services/ai/groqService.ts` — hata yönetimi
- `src/screens/CommunityScreen.tsx` — feedback fix
- `src/components/home/AddFavoriteModal.tsx` — MapPickerModal entegrasyonu
- `src/services/sun/sunAnalysis.ts` — per-segment analiz
- `package.json` — build:gtfs scripti

**Silinecek (Task 4 sonrası):**
- `src/data/izmir-stops.json`
- `src/data/izmir-stop-routes.json`
- `src/data/izmir-routes.ts`

---

## Task 1: GTFS Build Script

**Files:**
- Create: `scripts/build-gtfs.mjs`
- Modify: `package.json` — `scripts.build:gtfs`

**Interfaces:**
- Produces: `src/data/gtfs/*.json` (6 dosya) — Task 2 bunları require() ile yükler

- [ ] **Step 1: Script dosyasını oluştur**

`scripts/build-gtfs.mjs`:
```javascript
import { createReadStream } from 'fs';
import { writeFile, mkdir } from 'fs/promises';
import { createInterface } from 'readline';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GTFS = 'C:/Users/Kayra/Downloads/bus-eshot-gtfs';
const OUT = join(__dirname, '../src/data/gtfs');

async function readCsv(file) {
  const rl = createInterface({ input: createReadStream(join(GTFS, file)), crlfDelay: Infinity });
  const rows = [];
  let headers = null;
  for await (const line of rl) {
    const trimmed = line.replace(/\r/g, '');
    if (!headers) { headers = trimmed.split(',').map(h => h.trim()); continue; }
    const vals = trimmed.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim(); });
    rows.push(obj);
  }
  return rows;
}

function douglasPeucker(pts, eps) {
  if (pts.length <= 2) return pts;
  const [lat1, lon1] = pts[0], [lat2, lon2] = pts[pts.length - 1];
  const dx = lat2 - lat1, dy = lon2 - lon1, len = Math.sqrt(dx * dx + dy * dy);
  let maxDist = 0, maxIdx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [lat, lon] = pts[i];
    const dist = len === 0
      ? Math.sqrt((lat - lat1) ** 2 + (lon - lon1) ** 2)
      : Math.abs(dy * lat - dx * lon + lat2 * lon1 - lon2 * lat1) / len;
    if (dist > maxDist) { maxDist = dist; maxIdx = i; }
  }
  if (maxDist > eps) {
    const l = douglasPeucker(pts.slice(0, maxIdx + 1), eps);
    const r = douglasPeucker(pts.slice(maxIdx), eps);
    return [...l.slice(0, -1), ...r];
  }
  return [pts[0], pts[pts.length - 1]];
}

async function main() {
  await mkdir(OUT, { recursive: true });
  console.log('Reading routes, trips...');

  const [routesRaw, tripsRaw] = await Promise.all([
    readCsv('routes.txt'),
    readCsv('trips.txt'),
  ]);

  // route_id → {lineNum, name}
  const routeMap = new Map();
  for (const r of routesRaw) {
    routeMap.set(r.route_id, { lineNum: r.route_short_name, name: r.route_long_name });
  }

  // route-meta.json
  const routeMeta = {};
  for (const { lineNum, name } of routeMap.values()) {
    if (lineNum) routeMeta[lineNum] = { name };
  }

  // trip_id → {lineNum, dir, shapeId}
  const tripMeta = new Map();
  for (const t of tripsRaw) {
    const meta = routeMap.get(t.route_id);
    if (!meta || !meta.lineNum) continue;
    tripMeta.set(t.trip_id, {
      lineNum: meta.lineNum,
      dir: t.direction_id === '1' ? 1 : 0,
      shapeId: t.shape_id,
    });
  }

  // ring-routes: lines with only direction 0
  const lineDirs = new Map();
  for (const { lineNum, dir } of tripMeta.values()) {
    if (!lineDirs.has(lineNum)) lineDirs.set(lineNum, new Set());
    lineDirs.get(lineNum).add(dir);
  }
  const ringRoutes = [...lineDirs.entries()]
    .filter(([, dirs]) => dirs.size === 1 && dirs.has(0))
    .map(([ln]) => ln);

  // Pick first trip per lineNum_dir as representative
  const repTrip = new Map(); // "lineNum_dir" → tripId
  for (const [tripId, { lineNum, dir }] of tripMeta) {
    const key = `${lineNum}_${dir}`;
    if (!repTrip.has(key)) repTrip.set(key, tripId);
  }
  const wantedTrips = new Set(repTrip.values());

  // Also need shapeId → key mapping for shapes
  const shapeToKey = new Map();
  for (const [key, tripId] of repTrip) {
    const info = tripMeta.get(tripId);
    if (info?.shapeId) shapeToKey.set(info.shapeId, key);
  }

  // Single pass through stop_times.txt
  console.log('Reading stop_times.txt (2.2M rows)...');
  const tripStops = new Map(); // tripId → [{stopId, seq}]
  {
    const rl = createInterface({ input: createReadStream(join(GTFS, 'stop_times.txt')), crlfDelay: Infinity });
    let isHeader = true;
    for await (const line of rl) {
      if (isHeader) { isHeader = false; continue; }
      const parts = line.replace(/\r/g, '').split(',');
      const tripId = parts[0];
      if (!wantedTrips.has(tripId)) continue;
      const stopId = parts[3];
      const seq = parseInt(parts[4], 10);
      if (!tripStops.has(tripId)) tripStops.set(tripId, []);
      tripStops.get(tripId).push({ stopId, seq });
    }
  }

  // route-stop-seqs.json + stop-route-dirs.json
  const routeStopSeqs = {};
  const stopRouteDirs = {};
  for (const [key, tripId] of repTrip) {
    const [lineNum, dirStr] = key.split('_');
    const dir = parseInt(dirStr, 10);
    const stops = (tripStops.get(tripId) ?? []).sort((a, b) => a.seq - b.seq);
    routeStopSeqs[key] = stops.map(s => s.stopId);
    for (const { stopId } of stops) {
      if (!stopRouteDirs[stopId]) stopRouteDirs[stopId] = [];
      if (!stopRouteDirs[stopId].some(e => e.lineNum === lineNum && e.dir === dir)) {
        stopRouteDirs[stopId].push({ lineNum, dir });
      }
    }
  }

  // Read stops.txt
  console.log('Reading stops.txt...');
  const stopsRaw = await readCsv('stops.txt');
  const stops = stopsRaw.map(s => ({
    id: s.stop_id,
    name: s.stop_name,
    lat: parseFloat(s.stop_lat),
    lon: parseFloat(s.stop_lon),
  }));

  // Read shapes.txt (filtered)
  console.log('Reading shapes.txt...');
  const shapePoints = new Map();
  {
    const rl = createInterface({ input: createReadStream(join(GTFS, 'shapes.txt')), crlfDelay: Infinity });
    let isHeader = true;
    for await (const line of rl) {
      if (isHeader) { isHeader = false; continue; }
      const parts = line.replace(/\r/g, '').split(',');
      const shapeId = parts[0];
      if (!shapeToKey.has(shapeId)) continue;
      const lat = parseFloat(parts[1]);
      const lon = parseFloat(parts[2]);
      const seq = parseInt(parts[3], 10);
      if (!shapePoints.has(shapeId)) shapePoints.set(shapeId, []);
      shapePoints.get(shapeId).push([lat, lon, seq]);
    }
  }

  const shapes = {};
  for (const [shapeId, pts] of shapePoints) {
    const key = shapeToKey.get(shapeId);
    if (!key) continue;
    pts.sort((a, b) => a[2] - b[2]);
    const raw = pts.map(([lat, lon]) => [lat, lon]);
    const simplified = douglasPeucker(raw, 0.0001);
    shapes[key] = simplified.map(([lat, lon]) => [
      Math.round(lat * 10000) / 10000,
      Math.round(lon * 10000) / 10000,
    ]);
  }

  // Write all files
  console.log('Writing output files...');
  await Promise.all([
    writeFile(join(OUT, 'stops.json'), JSON.stringify(stops)),
    writeFile(join(OUT, 'stop-route-dirs.json'), JSON.stringify(stopRouteDirs)),
    writeFile(join(OUT, 'route-stop-seqs.json'), JSON.stringify(routeStopSeqs)),
    writeFile(join(OUT, 'ring-routes.json'), JSON.stringify(ringRoutes)),
    writeFile(join(OUT, 'shapes.json'), JSON.stringify(shapes)),
    writeFile(join(OUT, 'route-meta.json'), JSON.stringify(routeMeta)),
  ]);

  console.log(`Done.`);
  console.log(`  Stops: ${stops.length}`);
  console.log(`  Route+dir sequences: ${Object.keys(routeStopSeqs).length}`);
  console.log(`  Ring routes: ${ringRoutes.join(', ')}`);
  console.log(`  Shapes: ${Object.keys(shapes).length}`);
}

main().catch(console.error);
```

- [ ] **Step 2: package.json'a build:gtfs ekle**

`package.json` `scripts` bölümüne ekle:
```json
"build:gtfs": "node scripts/build-gtfs.mjs"
```

- [ ] **Step 3: Script'i çalıştır**

```bash
npm run build:gtfs
```

Beklenen çıktı:
```
Reading routes, trips...
Reading stop_times.txt (2.2M rows)...
Reading stops.txt...
Reading shapes.txt...
Writing output files...
Done.
  Stops: 11510
  Route+dir sequences: 847
  Ring routes: [bazı hat numaraları]
  Shapes: 847
```

- [ ] **Step 4: Çıktıları doğrula**

```bash
node -e "
const s = require('./src/data/gtfs/stops.json');
const r = require('./src/data/gtfs/route-stop-seqs.json');
const m = require('./src/data/gtfs/route-meta.json');
console.log('Stops:', s.length);
console.log('35_0 stops:', (r['35_0'] || []).length);
console.log('35 meta:', m['35']);
"
```

Beklenen: Stops: ~11510, 35_0 stops: >0, 35 meta: {name: '...'}

---

## Task 2: gtfsData.ts Yeniden Yazımı

**Files:**
- Modify: `src/data/gtfsData.ts`

**Interfaces:**
- Consumes: `src/data/gtfs/*.json` (Task 1 çıktıları)
- Produces:
  - `getStops(): IzmirStop[]`
  - `getStopIndex(): Map<string, IzmirStop>`
  - `getStopRouteDirs(): Record<string, Array<{lineNum: string; dir: 0|1}>>`
  - `getRouteStopSeqs(): Record<string, string[]>`
  - `isRingRoute(lineNum: string): boolean`
  - `getRouteShape(lineNum: string, dir: 0|1): [number, number][]`
  - `getRouteName(lineNum: string): string | undefined`
  - `getAllLines(): Array<{lineNum: string; name: string}>`
  - `findBoardAlightPair(lineNum, origin, dest): {board, alight, dir} | null`

- [ ] **Step 1: gtfsData.ts'i tamamen yeniden yaz**

`src/data/gtfsData.ts`:
```typescript
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

function getStopRouteDirs(): Record<string, StopRouteDir[]> {
  if (!_stopRouteDirs) _stopRouteDirs = require('./gtfs/stop-route-dirs.json');
  return _stopRouteDirs!;
}

function getRouteStopSeqs(): Record<string, string[]> {
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

export function getLinesNearOrigin(
  origin: { lat: number; lon: number },
  radiusKm = 1.0
): string[] {
  const srd = getStopRouteDirs();
  const seen = new Set<string>();
  const result: string[] = [];
  for (const stop of getStops()) {
    if (haversineKm(origin, stop) > radiusKm) continue;
    for (const { lineNum } of srd[stop.id] ?? []) {
      if (!seen.has(lineNum)) { seen.add(lineNum); result.push(lineNum); }
    }
  }
  return result;
}

export function getOrderedStopsForDir(
  lineNum: string,
  dir: 0 | 1
): IzmirStop[] {
  const seqs = getRouteStopSeqs();
  const idx = getStopIndex();
  const stopIds = seqs[`${lineNum}_${dir}`] ?? [];
  return stopIds.flatMap(id => { const s = idx.get(id); return s ? [s] : []; });
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
    for (let i = 1; i < stops.length - 1; i++) {
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
```

- [ ] **Step 2: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

Beklenen: hata yok (ya da yalnızca routingService.ts'den import hatası — Task 3'te düzelir)

---

## Task 3: routingService.ts — Direction-Aware Routing

**Files:**
- Modify: `src/services/gtfs/routingService.ts`

**Interfaces:**
- Consumes: Task 2'den `findBoardAlightPair`, `getLinesNearOrigin`, `getOrderedStopsForDir`, `getRouteName`, `isRingRoute`
- Produces: `findRoutes(origin, destination): Promise<Route[]>` (mevcut imza korunur)

- [ ] **Step 1: routingService.ts'i yeniden yaz**

`src/services/gtfs/routingService.ts`:
```typescript
import type { Route, Location, CrowdLevel, RouteStop, RouteStep, RouteFilterMode } from '../../types';
import {
  findBoardAlightPair,
  getLinesNearOrigin,
  getOrderedStopsForDir,
  getRouteName,
  isRingRoute,
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
```

- [ ] **Step 2: Eski dosyaları sil**

```bash
rm src/data/izmir-stops.json
rm src/data/izmir-stop-routes.json
rm src/data/izmir-routes.ts
```

- [ ] **Step 3: izmir-routes.ts importlarını temizle**

`LinesScreen.tsx` içinde `import { IZMIR_ROUTES }` satırını kaldır — Task 6'da düzeltilecek.  
Diğer dosyalarda `IZMIR_ROUTES` kullanımını kontrol et:

```bash
grep -r "IZMIR_ROUTES\|izmir-routes\|izmir-stops\|izmir-stop-routes" src/
```

Bulduğun her import'u kaldır.

- [ ] **Step 4: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

Beklenen: hata yok.

---

## Task 4: GPS Otomatik Başlangıç Noktası

**Files:**
- Modify: `src/screens/HomeScreen.tsx`

**Interfaces:**
- Consumes: `expo-location` (mevcut), `getStops()` + `getStopIndex()` from gtfsData
- Produces: `origin` store'a GPS'ten otomatik set edilir

- [ ] **Step 1: HomeScreen.tsx'e GPS auto-origin ekle**

HomeScreen.tsx başına importları ekle (zaten `expo-location` yoksa):
```typescript
import * as Location from 'expo-location';
import { getStops } from '../data/gtfsData';
```

`HomeScreen` fonksiyonu içinde, mevcut `useEffect`'lerin üstüne ekle:

```typescript
useEffect(() => {
  if (origin !== null) return;
  (async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const { latitude, longitude } = pos.coords;
    const stops = getStops();
    let nearestStop = stops[0];
    let minDist = Infinity;
    for (const s of stops) {
      const d = Math.hypot(s.lat - latitude, s.lon - longitude);
      if (d < minDist) { minDist = d; nearestStop = s; }
    }
    setOrigin({
      name: nearestStop.name,
      latitude,
      longitude,
    });
  })();
}, []);
```

- [ ] **Step 2: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

---

## Task 5: LinesScreen — Duraklar Bölümü

**Files:**
- Modify: `src/screens/LinesScreen.tsx`

**Interfaces:**
- Consumes: `getStops()` from gtfsData, `getAllLines()` from gtfsData
- Produces: SectionList ile HATLAR + DURAKLAR bölümleri; arama her ikisini kapsar

- [ ] **Step 1: LinesScreen.tsx'i yeniden yaz**

`src/screens/LinesScreen.tsx`:
```typescript
import React, { useMemo } from 'react';
import { View, StyleSheet, SectionList, TouchableOpacity } from 'react-native';
import { Text, Surface, useTheme, Searchbar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFavorites } from '../hooks/useFavorites';
import { useAppStore } from '../store/useAppStore';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { getAllLines, getStops } from '../data/gtfsData';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function LinesScreen() {
  const theme = useTheme();
  const navigation = useNavigation<Nav>();
  const user = useAppStore((s) => s.user);
  const { isLineFavorited, addLine, removeLine, favoriteLines } = useFavorites();
  const [search, setSearch] = React.useState('');

  const allLines = useMemo(() => getAllLines(), []);
  const allStops = useMemo(() => getStops(), []);

  const lowerSearch = search.toLowerCase();

  const filteredLines = useMemo(
    () =>
      lowerSearch
        ? allLines.filter(
            l =>
              l.lineNum.toLowerCase().includes(lowerSearch) ||
              l.name.toLowerCase().includes(lowerSearch)
          )
        : allLines,
    [allLines, lowerSearch]
  );

  const filteredStops = useMemo(
    () =>
      lowerSearch.length >= 2
        ? allStops
            .filter(s => s.name.toLowerCase().includes(lowerSearch))
            .slice(0, 50)
        : [],
    [allStops, lowerSearch]
  );

  const sections = useMemo(() => {
    const s = [];
    if (filteredLines.length > 0) s.push({ title: 'HATLAR', data: filteredLines, type: 'line' as const });
    if (filteredStops.length > 0) s.push({ title: 'DURAKLAR', data: filteredStops, type: 'stop' as const });
    return s;
  }, [filteredLines, filteredStops]);

  function handleToggleFavorite(lineNum: string, lineName: string) {
    const existing = favoriteLines.find(l => l.lineNumber === lineNum);
    if (existing) removeLine(existing.id);
    else addLine(lineNum, lineName);
  }

  function renderLine(item: { lineNum: string; name: string }) {
    const isFav = isLineFavorited(item.lineNum);
    return (
      <TouchableOpacity onPress={() => navigation.navigate('LineDetail', { lineNumber: item.lineNum })}>
        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <View style={[styles.badge, { backgroundColor: theme.colors.primaryContainer }]}>
            <Text style={[styles.badgeText, { color: theme.colors.primary }]}>{item.lineNum}</Text>
          </View>
          <Text style={[styles.lineName, { color: theme.colors.onSurface }]} numberOfLines={1}>
            {item.name}
          </Text>
          {user && !user.isGuest && (
            <TouchableOpacity onPress={() => handleToggleFavorite(item.lineNum, item.name)}>
              <MaterialCommunityIcons
                name={isFav ? 'star' : 'star-outline'}
                size={20}
                color={isFav ? '#FBBC04' : theme.colors.onSurfaceVariant}
              />
            </TouchableOpacity>
          )}
        </Surface>
      </TouchableOpacity>
    );
  }

  function renderStop(item: { id: string; name: string; lat: number; lon: number }) {
    return (
      <TouchableOpacity
        onPress={() =>
          navigation.navigate('StopDetail', {
            stopId: item.id,
            stopName: item.name,
            latitude: item.lat,
            longitude: item.lon,
          })
        }
      >
        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <MaterialCommunityIcons name="bus-stop" size={20} color={theme.colors.primary} />
          <Text style={[styles.lineName, { color: theme.colors.onSurface }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.stopId, { color: theme.colors.onSurfaceVariant }]}>#{item.id}</Text>
        </Surface>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>Hatlar & Duraklar</Text>
        <Searchbar
          placeholder="Hat veya durak ara..."
          value={search}
          onChangeText={setSearch}
          style={[styles.searchbar, { backgroundColor: theme.colors.surfaceVariant }]}
          inputStyle={{ fontSize: 14 }}
          elevation={0}
        />
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(item, i) => ('lineNum' in item ? `l-${item.lineNum}` : `s-${(item as any).id}-${i}`)}
        renderSectionHeader={({ section }) => (
          <Text style={[styles.sectionHeader, { color: theme.colors.onSurfaceVariant, backgroundColor: theme.colors.background }]}>
            {section.title}
          </Text>
        )}
        renderItem={({ item, section }) =>
          section.type === 'line'
            ? renderLine(item as { lineNum: string; name: string })
            : renderStop(item as { id: string; name: string; lat: number; lon: number })
        }
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  searchbar: { borderRadius: 12 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  sectionHeader: { fontSize: 11, fontWeight: '700', letterSpacing: 1, paddingVertical: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, minWidth: 44, alignItems: 'center' },
  badgeText: { fontSize: 13, fontWeight: '700' },
  lineName: { flex: 1, fontSize: 14 },
  stopId: { fontSize: 12 },
});
```

- [ ] **Step 2: StopDetail navigation param kontrolü**

`src/types/index.ts` içinde `RootStackParamList`'te `StopDetail` route'unun `latitude` ve `longitude` parametreleri var mı kontrol et:

```bash
grep -A 5 "StopDetail" src/types/index.ts
```

Yoksa ekle:
```typescript
StopDetail: { stopId: string; stopName: string; latitude: number; longitude: number };
```

- [ ] **Step 3: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

---

## Task 6: AI Özeti Düzeltme

**Files:**
- Modify: `src/components/route/AiSummaryCard.tsx`
- Modify: `src/services/ai/groqService.ts`

**Interfaces:**
- Consumes: `generateTravelSummary` (mevcut imza korunur)
- Produces: boş string ve ağ hatası durumlarında fallback metin

- [ ] **Step 1: groqService.ts — boş yanıt ve network hatası**

`src/services/ai/groqService.ts` içinde `generateTravelSummary` fonksiyonunun son kısmını düzelt:

Mevcut son satır:
```typescript
  return data.choices?.[0]?.message?.content?.trim() ?? '';
```

Değiştir:
```typescript
  const text = (data.choices?.[0]?.message?.content ?? '').trim();
  if (!text) throw new Error('Groq boş yanıt döndürdü');
  return text;
```

- [ ] **Step 2: AiSummaryCard.tsx — fallback state ekle**

`src/components/route/AiSummaryCard.tsx` içinde:

State'e fallback ekle (mevcut state'lerin yanına):
```typescript
const [summary, setSummary] = useState<string | null>(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
```

`load` fonksiyonunu güncelle:
```typescript
async function load() {
  setLoading(true);
  setError(null);
  setSummary(null);
  try {
    const text = await generateTravelSummary(route, weather, comfort);
    setSummary(text);
  } catch (e: any) {
    setError(e?.message ?? 'Özet alınamadı');
  } finally {
    setLoading(false);
  }
}
```

Hata gösterimi kısmını bul (`{error && !loading && (`) ve düzelt:
```typescript
{error && !loading && (
  <TouchableRipple onPress={load} borderless style={styles.retryBtn}>
    <View style={styles.retryContent}>
      <MaterialCommunityIcons name="refresh" size={16} color={theme.colors.primary} />
      <Text style={[styles.retryText, { color: theme.colors.primary }]}>
        Tekrar dene
      </Text>
    </View>
  </TouchableRipple>
)}
```

- [ ] **Step 3: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

---

## Task 7: Feedback Gönderim Düzeltmesi

**Files:**
- Modify: `src/screens/CommunityScreen.tsx`

**Interfaces:**
- Produces: Firestore yazma hatası net görünür; `loadRecent` submit sonrası beklenir

- [ ] **Step 1: CommunityScreen.tsx handleSubmit güncelle**

`handleSubmit` fonksiyonunu bul ve güncelle:

```typescript
async function handleSubmit() {
  if (!user || !selectedLine) return;
  setLoading(true);
  try {
    await submitFeedback({
      userId: user.uid,
      routeId: `line-${selectedLine.number}`,
      lineNumber: selectedLine.number,
      comfort,
      ac,
      temperature: temp,
      crowd,
      timestamp: new Date(),
      busId: selectedBusId ?? undefined,
      plateNumber: plateInput.trim() || undefined,
    });
    setSnackbar('Teşekkürler! +10 puan kazandınız.');
    if (user) setUser({ ...user, contributionPoints: (user.contributionPoints ?? 0) + 10 });
    setSelectedLine(null);
    setSelectedBusId(null);
    setPlateInput('');
    setNearbyBuses([]);
    setShowBusList(false);
    await loadRecent();
  } catch (e: any) {
    console.error('submitFeedback error:', e?.code, e?.message);
    if (e?.message?.includes('auth/')) {
      setSnackbar('Oturumunuz sona erdi. Lütfen yeniden giriş yapın.');
    } else if (e?.code?.includes('permission-denied')) {
      setSnackbar('Gönderme izni yok. Lütfen giriş yapın.');
    } else {
      setSnackbar(`Hata: ${e?.message ?? 'Bilinmeyen hata'}`);
    }
  } finally {
    setLoading(false);
  }
}
```

- [ ] **Step 2: Firestore Security Rules (Firebase Console'da yapılacak)**

Firebase Console → Firestore Database → Rules sekmesine git.  
Mevcut kuralları şununla değiştir:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /feedbacks/{docId} {
      allow read: if true;
      allow create: if request.auth != null;
    }
    match /line_stats/{lineNumber} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    match /alerts/{docId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow delete: if request.auth != null;
      allow update: if request.auth != null;
    }
    match /admin/{docId} {
      allow read: if request.auth != null;
      allow write: if false;
    }
  }
}
```

Yayınla (Publish).

- [ ] **Step 3: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

---

## Task 8: MapPickerModal — OSM Harita Seçici

**Files:**
- Create: `src/components/common/MapPickerModal.tsx`
- Modify: `src/components/home/AddFavoriteModal.tsx`

**Interfaces:**
- Produces: `MapPickerModal` → `onSelect(location: {lat: number; lng: number})` callback
- `AddFavoriteModal` uses MapPickerModal instead of MOCK_SUGGESTIONS

- [ ] **Step 1: MapPickerModal.tsx oluştur**

`src/components/common/MapPickerModal.tsx`:
```typescript
import React, { useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Portal, Modal, Button, Text, useTheme, TextInput } from 'react-native-paper';
import { WebView } from 'react-native-webview';

interface Props {
  visible: boolean;
  initialLat?: number;
  initialLon?: number;
  onSelect: (lat: number, lng: number) => void;
  onDismiss: () => void;
}

const MAP_HTML = (lat: number, lon: number) => `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{height:100%;width:100%;margin:0;padding:0;}</style>
</head>
<body>
<div id="map"></div>
<script>
var map = L.map('map').setView([${lat},${lon}],14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  attribution:'© OpenStreetMap'
}).addTo(map);
var marker=null;
map.on('click',function(e){
  if(marker)marker.remove();
  marker=L.marker([e.latlng.lat,e.latlng.lng]).addTo(map);
  window.ReactNativeWebView.postMessage(JSON.stringify({lat:e.latlng.lat,lng:e.latlng.lng}));
});
</script>
</body>
</html>`;

export function MapPickerModal({ visible, initialLat = 38.4189, initialLon = 27.1287, onSelect, onDismiss }: Props) {
  const theme = useTheme();
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null);
  const [webviewReady, setWebviewReady] = useState(false);
  const [placeName, setPlaceName] = useState('');

  function handleMessage(event: { nativeEvent: { data: string } }) {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (typeof data.lat === 'number' && typeof data.lng === 'number') {
        setPicked(data);
      }
    } catch {}
  }

  function handleConfirm() {
    if (!picked) return;
    onSelect(picked.lat, picked.lng);
    setPicked(null);
    setPlaceName('');
    onDismiss();
  }

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.container}>
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>
          Konumu Haritada Seç
        </Text>
        <Text style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>
          Haritaya dokunarak konum belirleyin
        </Text>
        <View style={styles.mapWrap}>
          {!webviewReady && (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          )}
          <WebView
            style={styles.map}
            source={{ html: MAP_HTML(initialLat, initialLon) }}
            onMessage={handleMessage}
            onLoad={() => setWebviewReady(true)}
            javaScriptEnabled
          />
        </View>
        {picked && (
          <View style={styles.bottom}>
            <TextInput
              label="Konum adı (isteğe bağlı)"
              value={placeName}
              onChangeText={setPlaceName}
              style={styles.nameInput}
              mode="outlined"
              dense
            />
            <Text style={[styles.coords, { color: theme.colors.onSurfaceVariant }]}>
              {picked.lat.toFixed(5)}, {picked.lng.toFixed(5)}
            </Text>
            <Button mode="contained" onPress={handleConfirm}>
              Bu Konumu Seç
            </Button>
          </View>
        )}
        <Button onPress={onDismiss} style={styles.cancel}>İptal</Button>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  container: { margin: 16, borderRadius: 16, overflow: 'hidden', backgroundColor: 'white', maxHeight: '90%' },
  title: { fontSize: 17, fontWeight: '700', padding: 16, paddingBottom: 4 },
  hint: { fontSize: 13, paddingHorizontal: 16, paddingBottom: 8 },
  mapWrap: { height: 340, position: 'relative' },
  loader: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  map: { flex: 1 },
  bottom: { padding: 16, gap: 8 },
  nameInput: { backgroundColor: 'white' },
  coords: { fontSize: 12 },
  cancel: { marginBottom: 8 },
});
```

- [ ] **Step 2: AddFavoriteModal.tsx güncelle**

`AddFavoriteModal.tsx` dosyasındaki location step'i güncelle. MOCK_SUGGESTIONS'ı kaldır, MapPickerModal ekle.

Import ekle:
```typescript
import { MapPickerModal } from '../common/MapPickerModal';
```

State ekle (mevcut state'lerin yanına):
```typescript
const [showMap, setShowMap] = useState(false);
```

`step === 'location'` görünümünde, mevcut filteredList FlatList yerine:
```typescript
{step === 'location' && (
  <View style={styles.locationStep}>
    <Button
      mode="contained"
      icon="map-marker"
      onPress={() => setShowMap(true)}
      style={styles.mapBtn}
    >
      Haritadan Seç
    </Button>
    <MapPickerModal
      visible={showMap}
      onDismiss={() => setShowMap(false)}
      onSelect={async (lat, lng) => {
        setShowMap(false);
        await handleLocationSelect({
          name: customLabel || selectedType || 'Konum',
          latitude: lat,
          longitude: lng,
        });
      }}
    />
  </View>
)}
```

`handleLocationSelect` fonksiyonunu bul — bu fonksiyon mevcut Location nesnesini alıp `onAdd` çağırıyor. `latitude`/`longitude` değerleri bizden geliyor, sorun yok.

- [ ] **Step 3: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

---

## Task 9: Per-Segment Güneş Analizi

**Files:**
- Modify: `src/services/sun/sunAnalysis.ts`

**Interfaces:**
- Consumes: `SunCalc.getPosition` (mevcut)
- Produces: `analyzeSunExposureAlongRoute(waypoints, departureTime, avgSpeedKmh?)` — mevcut imza korunur

- [ ] **Step 1: analyzeSunExposureAlongRoute fonksiyonunu güncelle**

`src/services/sun/sunAnalysis.ts` dosyasında `analyzeSunExposureAlongRoute` fonksiyonunu bul ve değiştir:

Mevcut (satır 63-117):
```typescript
export function analyzeSunExposureAlongRoute(
  waypoints: Array<{ latitude: number; longitude: number }>,
  departureTime: Date
): SunAnalysis {
```

Tüm fonksiyonu şununla değiştir:
```typescript
export function analyzeSunExposureAlongRoute(
  waypoints: Array<{ latitude: number; longitude: number }>,
  departureTime: Date,
  avgSpeedKmh = 22
): SunAnalysis {
  if (waypoints.length < 2) return getMockSunAnalysis();

  function segDistKm(
    a: { latitude: number; longitude: number },
    b: { latitude: number; longitude: number }
  ): number {
    const R = 6371;
    const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
    const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((a.latitude * Math.PI) / 180) *
      Math.cos((b.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(s));
  }

  let rightWeightedSum = 0;
  let totalWeight = 0;
  let elapsedHours = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const distKm = segDistKm(a, b);
    if (distKm < 0.001) continue;

    // Zaman tahmini: bu segmentten kaç dakika geçti?
    const segTime = new Date(departureTime.getTime() + elapsedHours * 3600000);
    elapsedHours += distKm / avgSpeedKmh;

    const midLat = (a.latitude + b.latitude) / 2;
    const midLon = (a.longitude + b.longitude) / 2;
    const sunPos = SunCalc.getPosition(segTime, midLat, midLon);

    // Güneş ufkun altındaysa bu segment analizden çıkar
    if (sunPos.altitude <= 0) continue;

    const sunAzimuth = ((sunPos.azimuth * 180) / Math.PI + 180) % 360;
    const bearing = getBearing(
      { name: '', latitude: a.latitude, longitude: a.longitude },
      { name: '', latitude: b.latitude, longitude: b.longitude }
    );
    const { side, intensity } = getSunRelativeAngle(sunAzimuth, bearing);

    // Ağırlık: mesafe × güneş yüksekliği (alçak güneş = az etki)
    const weight = distKm * Math.sin(sunPos.altitude);
    const rightPct = side === 'right' ? 50 + intensity * 50 : 50 - intensity * 50;

    rightWeightedSum += rightPct * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return getMockSunAnalysis();

  const rightPct = Math.round(rightWeightedSum / totalWeight);
  const leftPct = 100 - rightPct;
  const recommendedSide = rightPct > leftPct ? 'left' : 'right';

  return {
    recommendedSide,
    leftPercentage: leftPct,
    rightPercentage: rightPct,
    description:
      recommendedSide === 'left'
        ? '☀️ Sağ taraf daha fazla güneş alıyor.\n🌤️ Sol taraf daha serin.'
        : '☀️ Sol taraf daha fazla güneş alıyor.\n🌤️ Sağ taraf daha serin.',
  };
}
```

- [ ] **Step 2: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

---

## Task 10: Son Kontrol ve Temizlik

- [ ] **Step 1: Tüm TypeScript hatalarını temizle**

```bash
npx tsc --noEmit 2>&1
```

Her hatayı sırayla düzelt.

- [ ] **Step 2: Kullanılmayan importları kontrol et**

```bash
grep -r "IZMIR_ROUTES\|izmir-routes\|getStopRoutes\|getLineStopsIndex" src/
```

Bulduğun her satırı kaldır.

- [ ] **Step 3: Commit**

```bash
git add scripts/build-gtfs.mjs src/data/gtfs/ src/data/gtfsData.ts src/services/gtfs/routingService.ts src/screens/HomeScreen.tsx src/screens/LinesScreen.tsx src/components/route/AiSummaryCard.tsx src/services/ai/groqService.ts src/screens/CommunityScreen.tsx src/components/common/MapPickerModal.tsx src/components/home/AddFavoriteModal.tsx src/services/sun/sunAnalysis.ts src/types/index.ts package.json
git commit -m "feat: GTFS direction-aware routing, GPS origin, stops screen, map picker, sun & AI fixes"
```

---

## Execution Order

**Sıralı (bağımlılık var):**
- Task 1 → Task 2 → Task 3

**Paralel (Task 3'ten sonra bağımsız):**
- Task 4, 5, 6, 7, 8, 9 paralel çalışabilir

**Son:**
- Task 10
