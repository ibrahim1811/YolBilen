# Rota Motoru Mimari İyileştirmeleri — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mevcut rota motorunu daha doğru, güvenilir ve ölçeklenebilir hale getirmek — 9 bağımsız geliştirme ile.

**Architecture:** routingService.ts tek orchestration noktası olarak kalır; her iyileştirme ya mevcut bir fonksiyonu güçlendirir ya da yeni bir katman ekler. Mevcut Route/RouteStep/RouteStop type'ları genişletilir, breaking change yapılmaz.

**Tech Stack:** TypeScript, React Native, Zustand, AsyncStorage, GTFS JSON veri katmanı, İZTEK REST API.

## Global Constraints

- TypeScript strict mode — `any` yok, tüm tipler explicit
- Mevcut `findRoutes()` / `findTransferRoutes()` public imzası değişmez (RouteSearchScreen çağırıyor)
- `src/data/gtfsData.ts` lazy loading pattern'i korunur
- Commit her task sonunda ayrı yapılır
- `npx tsc --noEmit` her commit öncesi geçmeli

---

## Dosya Haritası

| Dosya | Değişim Türü | Neden |
|---|---|---|
| `src/data/routeGraph.ts` | Modify | Edge'e `distanceMeters` ekle |
| `src/services/gtfs/routingService.ts` | Modify | Walk limitleri, dinamik skor, ETA, confidence |
| `src/services/cache/routeCache.ts` | Modify | Realtime vs static TTL ayrımı |
| `src/services/iztek/iztekService.ts` | Modify | Skor bazlı stop eşleşmesi |
| `src/store/useAppStore.ts` | Modify | `allowLongWalk` ayarı ekle |
| `src/types/index.ts` | Modify | `RouteConfidenceDetail`, `RouteScoreWeights` tipleri |
| `src/components/route/RouteCard.tsx` | Modify | Confidence badge + eksik veri uyarısı |
| `src/screens/RouteResultScreen.tsx` | Modify | Confidence detayı + eksik veri uyarısı |
| `src/screens/SettingsScreen.tsx` | Modify | "Uzun yürüyüşlere izin ver" toggle |

---

## Task 1: RouteGraph Edge'lerine Gerçek Mesafe Ekle

**Etkilenen dosyalar:**
- Modify: `src/data/routeGraph.ts`
- Modify: `src/types/index.ts` (GraphEdge export edilmiyorsa tip güncelle)

**Gerekçe:** Şu an her edge sabit `travelCost: 1.5` kullanıyor, gerçek duraklar arası mesafe yok. Dijkstra/A* için gerçek metre değeri şart.

**Mevcut durum:**
```typescript
// routeGraph.ts — şu anki GraphEdge
export interface GraphEdge {
  toStopId: string;
  lineNum: string;
  dir: 0 | 1;
  travelCost: number; // sadece sabit 1.5 dk
}
```

- [ ] **Adım 1: GraphEdge tipine `distanceMeters` ekle**

`src/data/routeGraph.ts` — `GraphEdge` interface:
```typescript
export interface GraphEdge {
  toStopId: string;
  lineNum: string;
  dir: 0 | 1;
  travelCost: number;     // tahmini dakika (haversine bazlı)
  distanceMeters: number; // gerçek duraklar arası mesafe
}
```

- [ ] **Adım 2: Graph build sırasında haversine hesapla**

`src/data/routeGraph.ts` — `getGraph()` fonksiyonu içinde edge push satırını güncelle:

```typescript
// Mevcut import'ların üstüne ekle:
import { getStopIndex } from './gtfsData';

// getGraph() içinde, edge push'u şöyle değiştir:
function haversineM(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
    Math.cos((b.lat * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

export function getGraph(): RouteGraph {
  if (_graph) return _graph;
  _graph = new Map();
  const lines = getAllLines();
  const stopIdx = getStopIndex(); // <— ekle

  for (const { lineNum } of lines) {
    for (const dir of [0, 1] as (0 | 1)[]) {
      const stops = getOrderedStopsForDir(lineNum, dir);
      for (let i = 0; i < stops.length - 1; i++) {
        const from = stops[i];
        const to = stops[i + 1];
        const fromStop = stopIdx.get(from.id);
        const toStop = stopIdx.get(to.id);
        const distanceMeters = fromStop && toStop
          ? Math.round(haversineM(fromStop, toStop))
          : 500; // fallback: şehir içi ortalama durak mesafesi
        const travelCost = Math.max(1, Math.round((distanceMeters / 1000 / 22) * 60));
        if (!_graph.has(from.id)) _graph.set(from.id, []);
        _graph.get(from.id)!.push({ toStopId: to.id, lineNum, dir, travelCost, distanceMeters });
      }
    }
  }
  return _graph;
}
```

- [ ] **Adım 3: TypeScript kontrolü**

```bash
npx tsc --noEmit
```
Beklenen: 0 hata

- [ ] **Adım 4: Commit**

```bash
git add src/data/routeGraph.ts
git commit -m "feat(graph): add distanceMeters to RouteGraph edges via haversine"
```

---

## Task 2: Walk Mesafesi Limitlerini Yeniden Tasarla

**Etkilenen dosyalar:**
- Modify: `src/services/gtfs/routingService.ts`
- Modify: `src/store/useAppStore.ts`

**Gerekçe:** `MAX_WALK_KM = 1.5` (1500 m) gerçekçi değil. Normal kullanıcı 700 m, tercihe göre 1200 m yürümeli.

- [ ] **Adım 1: Store'a `allowLongWalk` ekle**

`src/store/useAppStore.ts`:
```typescript
interface AppState {
  // ... mevcut alanlar ...
  allowLongWalk: boolean;
  setAllowLongWalk: (v: boolean) => void;
}

// create() içinde:
allowLongWalk: false,
setAllowLongWalk: (allowLongWalk) => set({ allowLongWalk }),

// partialize içine ekle:
allowLongWalk: state.allowLongWalk,
```

- [ ] **Adım 2: routingService sabitlerini güncelle**

`src/services/gtfs/routingService.ts` — dosyanın başındaki sabitleri değiştir:

```typescript
// Eskiler:
// const MAX_WALK_KM = 1.5;
// const MAX_TRANSFER_WALK_KM = 0.6;

// Yeniler:
const WALK_NORMAL_M = 700;
const WALK_EXTENDED_M = 1200;
const TRANSFER_WALK_M = 600;
```

- [ ] **Adım 3: `findRoutes()` imzasını genişlet (geriye dönük uyumlu)**

```typescript
export async function findRoutes(
  origin: Location,
  destination: Location,
  options: { allowLongWalk?: boolean } = {}
): Promise<Route[]> {
  const maxWalkM = options.allowLongWalk ? WALK_EXTENDED_M : WALK_NORMAL_M;
  const maxWalkKm = maxWalkM / 1000;

  const candidateLines = getLinesNearOrigin(
    { lat: origin.latitude, lon: origin.longitude },
    maxWalkKm  // <— değişti
  );

  // ... valid filtresi:
  const valid = pairs.filter(({ pair }) => {
    const boardWalk = haversineKm(...) * 1000; // metre cinsinden
    const alightWalk = haversineKm(...) * 1000;
    return boardWalk <= maxWalkM && alightWalk <= maxWalkM;
  }).slice(0, 5);
```

- [ ] **Adım 4: RouteSearchScreen'de store'dan oku ve geç**

`src/screens/RouteSearchScreen.tsx`:
```typescript
const allowLongWalk = useAppStore((s) => s.allowLongWalk);

// useEffect içinde:
findRoutes(origin, destination, { allowLongWalk })
```

- [ ] **Adım 5: SettingsScreen'e toggle ekle**

`src/screens/SettingsScreen.tsx` içinde mevcut switch/toggle alanına ekle:
```tsx
const { allowLongWalk, setAllowLongWalk } = useAppStore();

<List.Item
  title="Uzun yürüyüşlere izin ver"
  description="Durağa 1.2 km'ye kadar yürümeyi kabul et"
  right={() => (
    <Switch value={allowLongWalk} onValueChange={setAllowLongWalk} />
  )}
/>
```

- [ ] **Adım 6: TypeScript kontrolü + commit**

```bash
npx tsc --noEmit
git add src/services/gtfs/routingService.ts src/store/useAppStore.ts src/screens/RouteSearchScreen.tsx src/screens/SettingsScreen.tsx
git commit -m "feat(routing): configurable walk distance limits (700m normal, 1200m extended)"
```

---

## Task 3: İZTEK Durak Eşleşmesini Güçlendir

**Etkilenen dosyalar:**
- Modify: `src/services/iztek/iztekService.ts`
- Modify: `src/services/gtfs/routingService.ts` (çağrı noktası)

**Gerekçe:** `nearestIztekStopId(lat, lon)` sadece mesafeye bakıyor; karşı yönde aynı konumdaki durağı seçebilir. lineNum + direction ile skor filtresi eklemek gerekiyor.

**Mevcut imza:** `nearestIztekStopId(lat: number, lon: number): number | null`

- [ ] **Adım 1: İZTEK stop verisine hat/yön alanları var mı kontrol et**

`src/data/iztek-stops.json` yapısına bak:
```bash
# PowerShell ile ilk 3 girişi gör:
Get-Content src/data/iztek-stops.json | Select-Object -First 5
```

Eğer iztek-stops.json'da `lineNums` / `dir` bilgisi **yoksa** (muhtemelen yok — sadece id/lat/lon var), o zaman yakınlık + GTFS stop sequence ile dolaylı skor kullanılacak.

- [ ] **Adım 2: Skor bazlı eşleşme fonksiyonu ekle**

`src/services/iztek/iztekService.ts` sonuna ekle:

```typescript
import { getOrderedStopsForDir, getStopIndex } from '../../data/gtfsData';

interface StopMatchCandidate {
  id: number;
  distKm: number;
  sequenceScore: number; // 0-1: stop sequence'de ne kadar yerinde
}

export function bestIztekStopId(
  lat: number,
  lon: number,
  lineNum: string,
  dir: 0 | 1,
  boardStopId: string
): number | null {
  // KD-Tree ile 5 en yakın adayı bul (radius 0.5 km)
  const candidates = kdNearestN(getKDTree(), lat, lon, 5, 0.5);
  if (candidates.length === 0) return null;

  const orderedStops = getOrderedStopsForDir(lineNum, dir);
  const boardIdx = orderedStops.findIndex(s => s.id === boardStopId);
  const stopIdx = getStopIndex();

  const scored = candidates.map(c => {
    // İZTEK stop id'yi GTFS stop id'ye çevir (koordinat eşleşmesi)
    const gtfsMatch = orderedStops.find(s => {
      const gs = stopIdx.get(s.id);
      return gs && distKm(gs.lat, gs.lon, c.lat, c.lon) < 0.05;
    });
    const seqIdx = gtfsMatch ? orderedStops.findIndex(s => s.id === gtfsMatch.id) : -1;
    // Biniş durağına yakın sequence pozisyonu daha iyi
    const sequenceScore = seqIdx >= 0 && boardIdx >= 0
      ? Math.max(0, 1 - Math.abs(seqIdx - boardIdx) / orderedStops.length)
      : 0;
    return { id: c.id, distKm: c.dist, sequenceScore };
  });

  // Ağırlıklı skor: %60 mesafe yakınlığı, %40 sequence uyumu
  const best = scored.sort((a, b) => {
    const scoreA = (1 - Math.min(a.distKm / 0.5, 1)) * 0.6 + a.sequenceScore * 0.4;
    const scoreB = (1 - Math.min(b.distKm / 0.5, 1)) * 0.6 + b.sequenceScore * 0.4;
    return scoreB - scoreA;
  })[0];

  return best.distKm < 0.3 ? best.id : null;
}
```

- [ ] **Adım 3: `kdNearestN` yardımcı fonksiyonu ekle** (mevcut `kdNearest` sadece 1 sonuç veriyor)

```typescript
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
    if (d <= maxDistKm) {
      results.push({ id: node.id, lat: node.lat, lon: node.lon, dist: d });
    }
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
```

- [ ] **Adım 4: routingService'te `liveNextArrival` güncelle**

`src/services/gtfs/routingService.ts` — `liveNextArrival` fonksiyonu:

```typescript
async function liveNextArrival(
  lineNum: string,
  lat: number,
  lon: number,
  dir: 0 | 1,
  boardStopId?: string   // <— yeni parametre
): Promise<number> {
  const iztekId = boardStopId
    ? bestIztekStopId(lat, lon, lineNum, dir, boardStopId)  // <— skor bazlı
    : nearestIztekStopId(lat, lon);                          // fallback: eski davranış
  if (iztekId) {
    try {
      const buses = await getApproachingBuses(iztekId, dir);
      const match = buses.find(b => String(b.hatNumarasi) === lineNum);
      if (match) return minsFromRemainingStops(match.kalanDurakSayisi);
    } catch {}
  }
  return getNextArrivalMins(lineNum);
}
```

Import güncelle:
```typescript
import { getApproachingBuses, nearestIztekStopId, bestIztekStopId, minsFromRemainingStops } from '../iztek/iztekService';
```

- [ ] **Adım 5: `liveNextArrival` çağrılarında boardStopId geç**

`findRoutes()` içindeki `arrivals` Promise.all:
```typescript
const arrivals = await Promise.all(valid.map(({ pair, lineNum }) =>
  liveNextArrival(lineNum, pair!.board.lat, pair!.board.lon, pair!.dir, pair!.board.id)
));
```

- [ ] **Adım 6: TypeScript kontrolü + commit**

```bash
npx tsc --noEmit
git add src/services/iztek/iztekService.ts src/services/gtfs/routingService.ts
git commit -m "feat(iztek): score-based stop matching using distance + GTFS sequence"
```

---

## Task 4: Cache Stratejisini Ayır (Realtime vs Static TTL)

**Etkilenen dosyalar:**
- Modify: `src/services/cache/routeCache.ts`
- Modify: `src/screens/RouteSearchScreen.tsx` (saveRouteCache çağrısı)

**Gerekçe:** İZTEK canlı verisi olan rotalar 30 dk cache'te kalırsa eski varış süreleri gösterilir.

- [ ] **Adım 1: CacheEntry'ye `cacheType` ekle**

`src/services/cache/routeCache.ts`:

```typescript
const CACHE_KEY = 'route_cache_v2'; // v1'den v2'ye — eski cache otomatik invalidate
const MAX_ENTRIES = 10;
const TTL_REALTIME_MS = 5 * 60 * 1000;   // 5 dk: canlı veri içeren rotalar
const TTL_STATIC_MS = 30 * 60 * 1000;    // 30 dk: sadece GTFS/tarife rotaları

type CacheType = 'realtime' | 'static';

interface CacheEntry {
  originName: string;
  destinationName: string;
  routes: Route[];
  savedAt: number;
  cacheType: CacheType;
}
```

- [ ] **Adım 2: `saveRouteCache` imzasını güncelle**

```typescript
export async function saveRouteCache(
  origin: Location,
  destination: Location,
  routes: Route[],
  cacheType: CacheType = 'static'
): Promise<void> {
  const all = await readAll();
  const filtered = all.filter(
    e => !(e.originName === origin.name && e.destinationName === destination.name)
  );
  filtered.unshift({
    originName: origin.name,
    destinationName: destination.name,
    routes,
    savedAt: Date.now(),
    cacheType,
  });
  await writeAll(filtered.slice(0, MAX_ENTRIES));
}
```

- [ ] **Adım 3: `loadRouteCache` TTL'yi cacheType'a göre hesaplasın**

```typescript
export async function loadRouteCache(
  origin: Location,
  destination: Location
): Promise<Route[] | null> {
  const all = await readAll();
  const entry = all.find(
    e => e.originName === origin.name && e.destinationName === destination.name
  );
  if (!entry) return null;
  const ttl = entry.cacheType === 'realtime' ? TTL_REALTIME_MS : TTL_STATIC_MS;
  if (Date.now() - entry.savedAt > ttl) return null;
  return entry.routes;
}
```

- [ ] **Adım 4: RouteSearchScreen'de cacheType belirle**

`src/screens/RouteSearchScreen.tsx` — `findRoutes` sonucu işlenirken:

```typescript
.then(async r => {
  if (cancelled) return;
  // Rotalardan herhangi biri canlı veri içeriyor mu?
  const hasLive = r.some(route => route.confidence !== undefined && route.confidence > 70);
  const cacheType = hasLive ? 'realtime' : 'static';
  if (r.length > 0) void saveRouteCache(origin, destination, r, cacheType);
  setRoutes(r);
})
```

- [ ] **Adım 5: TypeScript kontrolü + commit**

```bash
npx tsc --noEmit
git add src/services/cache/routeCache.ts src/screens/RouteSearchScreen.tsx
git commit -m "feat(cache): split realtime (5min) vs static (30min) TTL for route cache"
```

---

## Task 5: Route Score Sistemini Profil Bazlı Yap

**Etkilenen dosyalar:**
- Modify: `src/services/gtfs/routingService.ts`
- Modify: `src/types/index.ts`

**Gerekçe:** Sabit ağırlıklar her filtre modunda aynı sonucu üretiyor; "En Serin" seçildiğinde güneş ağırlığı artmalı.

- [ ] **Adım 1: `RouteScoreWeights` tipini types/index.ts'e ekle**

```typescript
export interface RouteScoreWeights {
  duration: number;   // toplam 100 olmalı
  walk: number;
  transfer: number;
  crowd: number;
  sun: number;
}
```

- [ ] **Adım 2: routingService'te ağırlık tablosu tanımla**

`src/services/gtfs/routingService.ts` dosyasının üstüne ekle:

```typescript
import type { RouteScoreWeights } from '../../types';

const SCORE_WEIGHTS: Record<RouteFilterMode, RouteScoreWeights> = {
  fastest:         { duration: 60, walk: 15, transfer: 15, crowd: 5,  sun: 5  },
  comfortable:     { duration: 25, walk: 15, transfer: 15, crowd: 25, sun: 20 },
  cool:            { duration: 20, walk: 10, transfer: 10, crowd: 20, sun: 40 },
  least_transfers: { duration: 20, walk: 10, transfer: 60, crowd: 5,  sun: 5  },
  night_safe:      { duration: 20, walk: 35, transfer: 35, crowd: 5,  sun: 5  },
};

const DEFAULT_WEIGHTS: RouteScoreWeights = SCORE_WEIGHTS.fastest;
```

- [ ] **Adım 3: `calcRouteScore` fonksiyonunu güncelle**

```typescript
function calcRouteScore(
  estimatedDuration: number,
  walkMeters: number,
  transferCount: number,
  crowdLevel: CrowdLevel,
  sunAnalysis: SunAnalysis | undefined,
  weights: RouteScoreWeights = DEFAULT_WEIGHTS
): number {
  const crowdPenalty: Record<CrowdLevel, number> = { low: 0, medium: 5, high: 15, very_high: 30 };
  const sunPenalty = sunAnalysis
    ? Math.max(sunAnalysis.leftPercentage, sunAnalysis.rightPercentage) - 50
    : 0;
  const total = weights.duration + weights.walk + weights.transfer + weights.crowd + weights.sun;
  const norm = total > 0 ? 100 / total : 1; // normalize et, toplam 100 olmayan durumlar için

  return (
    estimatedDuration             * (weights.duration  / 100) * norm * 0.4 +
    (walkMeters / 1000) * 20      * (weights.walk      / 100) * norm * 0.2 +
    transferCount * 15            * (weights.transfer  / 100) * norm * 0.2 +
    crowdPenalty[crowdLevel]      * (weights.crowd     / 100) * norm * 0.1 +
    Math.max(0, sunPenalty)       * (weights.sun       / 100) * norm * 0.1
  );
}
```

- [ ] **Adım 4: `findRoutes`'a `filterMode` parametresi ekle (opsiyonel, geriye dönük uyumlu)**

```typescript
export async function findRoutes(
  origin: Location,
  destination: Location,
  options: { allowLongWalk?: boolean; filterMode?: RouteFilterMode } = {}
): Promise<Route[]> {
  const weights = options.filterMode ? SCORE_WEIGHTS[options.filterMode] : DEFAULT_WEIGHTS;
  // ...
  // calcRouteScore çağrılarına weights geç:
  const score = calcRouteScore(estimatedDuration, walkMeters, 0, crowdLevel, sunAnalysis, weights);
```

- [ ] **Adım 5: RouteSearchScreen'de filterMode geç**

`src/screens/RouteSearchScreen.tsx`:
```typescript
findRoutes(origin, destination, { allowLongWalk, filterMode })
```
(filterMode zaten state'te var)

- [ ] **Adım 6: TypeScript kontrolü + commit**

```bash
npx tsc --noEmit
git add src/services/gtfs/routingService.ts src/types/index.ts src/screens/RouteSearchScreen.tsx
git commit -m "feat(routing): profile-based score weights per filter mode"
```

---

## Task 6: Canlı Varış Tahminini Geliştir

**Etkilenen dosyalar:**
- Modify: `src/services/iztek/iztekService.ts`

**Gerekçe:** `kalanDurak * 1.5` sabit dakika kullanıyor; sabah/akşam yoğun saatlerde otobüsler çok daha yavaş ilerler.

- [ ] **Adım 1: Gün tipi + saat bazlı çarpan tablosu ekle**

`src/services/iztek/iztekService.ts`:

```typescript
function getTrafficMultiplier(): number {
  const now = new Date();
  const h = now.getHours();
  const dow = now.getDay(); // 0=Pazar, 6=Cumartesi
  const isWeekend = dow === 0 || dow === 6;

  if (isWeekend) {
    if (h >= 11 && h < 20) return 1.15; // hafta sonu öğleden sonra
    return 1.0;
  }
  // Hafta içi
  if ((h >= 7 && h < 9) || (h >= 17 && h < 19)) return 1.45; // sabah/akşam zirve
  if ((h >= 9 && h < 12) || (h >= 19 && h < 21)) return 1.20; // orta yoğun
  if (h >= 22 || h < 6) return 0.85; // gece saatleri, trafik az
  return 1.0;
}
```

- [ ] **Adım 2: `minsFromRemainingStops` güncellensin**

```typescript
export function minsFromRemainingStops(kalanDurak: number): number {
  const multiplier = getTrafficMultiplier();
  return Math.max(1, Math.round(kalanDurak * MINS_PER_STOP * multiplier));
}
```

- [ ] **Adım 3: `estimateArrivalFromPosition` güncelle**

```typescript
export function estimateArrivalFromPosition(
  buses: BusPosition[],
  stopLat: number,
  stopLon: number
): number | null {
  if (buses.length === 0) return null;
  const minDist = Math.min(...buses.map(b => distKm(b.lat, b.lon, stopLat, stopLon)));
  const multiplier = getTrafficMultiplier();
  return Math.max(1, Math.round((minDist / BUS_SPEED_KMH) * 60 * multiplier));
}
```

- [ ] **Adım 4: TypeScript kontrolü + commit**

```bash
npx tsc --noEmit
git add src/services/iztek/iztekService.ts
git commit -m "feat(eta): time-of-day and day-type traffic multiplier for arrival estimates"
```

---

## Task 7: Eksik Sefer Verisi Uyarısı Göster

**Etkilenen dosyalar:**
- Modify: `src/types/index.ts` (`Route` tipine alan ekle)
- Modify: `src/services/gtfs/routingService.ts` (Route oluştururken flag)
- Modify: `src/components/route/RouteCard.tsx` (uyarı UI)
- Modify: `src/screens/RouteResultScreen.tsx` (detay uyarısı)

**Gerekçe:** 14 hat schedules.json'da eksik. Kullanıcı neden "yarın" ya da belirsiz süre gördüğünü bilmeli.

- [ ] **Adım 1: Route tipine `hasIncompleteData` ekle**

`src/types/index.ts` — `Route` interface:
```typescript
export interface Route {
  // ... mevcut alanlar ...
  hasIncompleteData?: boolean;  // sefer verisi eksik hat
}
```

- [ ] **Adım 2: routingService'te flag'i set et**

`src/services/gtfs/routingService.ts` — `findRoutes()` içinde Route objesi oluştururken:

```typescript
import { hasSchedule } from '../../data/scheduleData';

// results.push() içinde:
results.push({
  id: `direct-${lineNum}-${pair!.dir}`,
  // ... mevcut alanlar ...
  hasIncompleteData: !hasSchedule(lineNum),
});
```

Transfer rotalar için de:
```typescript
results.push({
  id: `transfer-${line1}-${line2}-${dir1}-${midIdx}`,
  // ...
  hasIncompleteData: !hasSchedule(line1) || !hasSchedule(line2),
});
```

- [ ] **Adım 3: RouteCard'da uyarı chip'i göster**

`src/components/route/RouteCard.tsx` içinde, kart içeriğinin en altına:

```tsx
{route.hasIncompleteData && (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
    <MaterialCommunityIcons name="information-outline" size={14} color="#F59E0B" />
    <Text style={{ fontSize: 11, color: '#F59E0B' }}>
      Tam sefer verisi mevcut değil
    </Text>
  </View>
)}
```

- [ ] **Adım 4: RouteResultScreen'de açıklayıcı banner ekle**

`src/screens/RouteResultScreen.tsx` — `selectedRoute.steps` bloğunun üstüne:

```tsx
{selectedRoute.hasIncompleteData && (
  <Surface style={[styles.infoAlert, { backgroundColor: '#FEF3C7' }]} elevation={0}>
    <MaterialCommunityIcons name="calendar-remove" size={20} color="#D97706" />
    <View style={{ flex: 1 }}>
      <Text style={{ color: '#92400E', fontWeight: '700', fontSize: 14 }}>
        Bu hat için tam sefer verisi mevcut değil
      </Text>
      <Text style={{ color: '#92400E', fontSize: 12, marginTop: 2 }}>
        Varış süresi tahminidir. Gerçek sefer saatleri değişebilir.
      </Text>
    </View>
  </Surface>
)}
```

StyleSheet'e ekle:
```typescript
infoAlert: { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
```

- [ ] **Adım 5: TypeScript kontrolü + commit**

```bash
npx tsc --noEmit
git add src/types/index.ts src/services/gtfs/routingService.ts src/components/route/RouteCard.tsx src/screens/RouteResultScreen.tsx
git commit -m "feat(routing): show incomplete schedule data warning on affected routes"
```

---

## Task 8: Route Confidence Sistemini Geliştir

**Etkilenen dosyalar:**
- Modify: `src/types/index.ts` (`RouteConfidenceDetail` tipi)
- Modify: `src/services/gtfs/routingService.ts` (`calcConfidence` genişletilir)
- Modify: `src/components/route/RouteCard.tsx` (confidence badge)
- Modify: `src/screens/RouteResultScreen.tsx` (detay gösterimi)

**Gerekçe:** Mevcut `calcConfidence` sadece `hasLiveData + totalReports` kullanıyor. 5 faktörlü, açıklayıcı bir sisteme gereksinim var.

- [ ] **Adım 1: `RouteConfidenceDetail` tipini ekle**

`src/types/index.ts`:

```typescript
export interface RouteConfidenceDetail {
  score: number; // 0-100
  hasLiveData: boolean;
  hasScheduleData: boolean;
  directionVerified: boolean;
  stopMatchQuality: 'high' | 'medium' | 'low';
  reasons: string[]; // kullanıcıya gösterilecek kısa açıklamalar
}

// Route interface'e ekle:
export interface Route {
  // ... mevcut ...
  confidenceDetail?: RouteConfidenceDetail;
}
```

- [ ] **Adım 2: `calcConfidence` fonksiyonunu genişlet**

`src/services/gtfs/routingService.ts`:

```typescript
function calcConfidenceDetail(
  hasLiveData: boolean,
  hasScheduleData: boolean,
  boardWalkM: number,
  alightWalkM: number,
  directionVerified: boolean
): RouteConfidenceDetail {
  let score = 0;
  const reasons: string[] = [];

  // Canlı veri: +40 puan
  if (hasLiveData) {
    score += 40;
    reasons.push('Canlı konum verisi mevcut');
  } else {
    reasons.push('Canlı veri yok — tarife kullanıldı');
  }

  // Sefer verisi: +20 puan
  if (hasScheduleData) {
    score += 20;
    reasons.push('Sefer tarihi doğrulandı');
  } else {
    reasons.push('Sefer tarihi eksik');
  }

  // Yön doğrulaması: +20 puan
  if (directionVerified) {
    score += 20;
    reasons.push('Yön doğrulandı');
  } else {
    reasons.push('Yön tahmini');
  }

  // Durak yakınlığı: +20 puan
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

  return {
    score: Math.min(100, score),
    hasLiveData,
    hasScheduleData,
    directionVerified,
    stopMatchQuality,
    reasons,
  };
}
```

- [ ] **Adım 3: `findRoutes()` içinde her Route'a `confidenceDetail` ekle**

`buildSteps` çağrısından sonra:
```typescript
const boardWalkM = steps[0]?.distanceMeters ?? 0;
const alightWalkM = steps[steps.length - 1]?.distanceMeters ?? 0;
const confidenceDetail = calcConfidenceDetail(
  hasLiveData,
  hasSchedule(lineNum),
  boardWalkM,
  alightWalkM,
  pair!.dir !== undefined // dir her zaman doğrulanmış
);

results.push({
  // ...
  confidence: confidenceDetail.score,
  confidenceDetail,
});
```

- [ ] **Adım 4: RouteCard'da confidence badge**

`src/components/route/RouteCard.tsx`:

```tsx
{route.confidence !== undefined && (
  <View style={{
    backgroundColor: route.confidence >= 80 ? '#D1FAE5' : route.confidence >= 60 ? '#FEF3C7' : '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  }}>
    <MaterialCommunityIcons
      name={route.confidence >= 80 ? 'shield-check' : route.confidence >= 60 ? 'shield-half-full' : 'shield-alert'}
      size={12}
      color={route.confidence >= 80 ? '#065F46' : route.confidence >= 60 ? '#92400E' : '#991B1B'}
    />
    <Text style={{
      fontSize: 11,
      fontWeight: '700',
      color: route.confidence >= 80 ? '#065F46' : route.confidence >= 60 ? '#92400E' : '#991B1B',
    }}>
      %{route.confidence}
    </Text>
  </View>
)}
```

- [ ] **Adım 5: RouteResultScreen'de confidence detay kartı**

`src/screens/RouteResultScreen.tsx` — stats grid'in altına:

```tsx
{selectedRoute.confidenceDetail && (
  <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Güvenilirlik</Text>
      <Text style={{
        fontSize: 20,
        fontWeight: '800',
        color: selectedRoute.confidenceDetail.score >= 80 ? '#10B981'
          : selectedRoute.confidenceDetail.score >= 60 ? '#F59E0B' : '#EF4444',
      }}>
        %{selectedRoute.confidenceDetail.score}
      </Text>
    </View>
    {selectedRoute.confidenceDetail.reasons.map((r, i) => (
      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <MaterialCommunityIcons
          name={selectedRoute.confidenceDetail!.score >= 70 ? 'check-circle' : 'information'}
          size={14}
          color={theme.colors.onSurfaceVariant}
        />
        <Text style={{ fontSize: 13, color: theme.colors.onSurfaceVariant }}>{r}</Text>
      </View>
    ))}
  </Surface>
)}
```

- [ ] **Adım 6: TypeScript kontrolü + commit**

```bash
npx tsc --noEmit
git add src/types/index.ts src/services/gtfs/routingService.ts src/components/route/RouteCard.tsx src/screens/RouteResultScreen.tsx
git commit -m "feat(routing): 5-factor confidence scoring with UI display"
```

---

## Task 9: Performans — `getLinesNearOrigin` Memoization

**Etkilenen dosyalar:**
- Modify: `src/data/gtfsData.ts`

**Gerekçe:** `findTransferRoutes` içinde `getLinesNearOrigin` her aktarma adayı için tekrar çağrılıyor. Grid zaten var ama sonuçlar memoize edilmiyor.

**Mevcut durum analizi:**
- `getLinesNearOrigin` → grid lookup — O(komşu hücre adedi * durak sayısı). Her transfer noktası için tekrar çağrılıyor.
- `getOrderedStopsForDir` → `route-stop-seqs.json`'dan string[] → IzmirStop[] dönüşümü. Tekrarlı çağrılarda aynı iş yapılıyor.
- `nearestIztekStopId` → KD-Tree, zaten O(log N) ✓
- `getLinesNearOrigin` → Grid zaten O(1) lookup ✓ ama `findTransferRoutes` döngüsünde tekrar çağrılıyor.

- [ ] **Adım 1: `getLinesNearOrigin` sonuçlarını in-memory memoize et**

`src/data/gtfsData.ts`:

```typescript
const _linesNearCache = new Map<string, string[]>();

function linesNearCacheKey(lat: number, lon: number, radiusKm: number): string {
  // 0.01 derece (~1km) hassasiyetinde yuvarla — aynı bölge sorguları cache'e çarpsın
  return `${(lat * 100 | 0)},${(lon * 100 | 0)},${radiusKm}`;
}

export function getLinesNearOrigin(
  origin: { lat: number; lon: number },
  radiusKm: number
): string[] {
  const key = linesNearCacheKey(origin.lat, origin.lon, radiusKm);
  if (_linesNearCache.has(key)) return _linesNearCache.get(key)!;

  // ... mevcut grid lookup kodu ...
  const result = /* mevcut hesaplama */;
  _linesNearCache.set(key, result);
  return result;
}

// Arama bitince cache'i temizle (bellek sızıntısı önleme)
export function clearLinesNearCache(): void {
  _linesNearCache.clear();
}
```

- [ ] **Adım 2: `getOrderedStopsForDir` sonuçlarını memoize et**

```typescript
const _orderedStopsCache = new Map<string, IzmirStop[]>();

export function getOrderedStopsForDir(lineNum: string, dir: 0 | 1): IzmirStop[] {
  const key = `${lineNum}_${dir}`;
  if (_orderedStopsCache.has(key)) return _orderedStopsCache.get(key)!;

  // ... mevcut hesaplama ...
  const result = /* mevcut kod */;
  _orderedStopsCache.set(key, result);
  return result;
}
```

- [ ] **Adım 3: routingService'te arama sonrası cache temizle**

`src/services/gtfs/routingService.ts` — `findRoutes()` sonunda:

```typescript
import { clearLinesNearCache } from '../../data/gtfsData';

export async function findRoutes(...): Promise<Route[]> {
  try {
    // ... mevcut kod ...
    return results;
  } finally {
    clearLinesNearCache(); // her arama için cache'i temizle
  }
}
```

- [ ] **Adım 4: TypeScript kontrolü + commit**

```bash
npx tsc --noEmit
git add src/data/gtfsData.ts src/services/gtfs/routingService.ts
git commit -m "perf(routing): memoize getLinesNearOrigin and getOrderedStopsForDir"
```

---

## Spec Kapsamı Kontrol Listesi

| # | Gereksinim | Task | Durum |
|---|---|---|---|
| 1 | RouteGraph katmanı, distanceMeters'lı edge | Task 1 | ✅ |
| 2 | Walk limitleri 700m/1200m + kullanıcı ayarı | Task 2 | ✅ |
| 3 | İZTEK skor bazlı stop eşleşmesi | Task 3 | ✅ |
| 4 | Realtime 5dk / Static 30dk cache ayrımı | Task 4 | ✅ |
| 5 | Profil bazlı dinamik skor ağırlıkları | Task 5 | ✅ |
| 6 | Trafik çarpanlı ETA tahmini | Task 6 | ✅ |
| 7 | Eksik sefer verisi uyarısı (14 hat) | Task 7 | ✅ |
| 8 | 5 faktörlü confidence sistemi + UI | Task 8 | ✅ |
| 9 | Performans: memoization | Task 9 | ✅ |

## Önerilen Uygulama Sırası

1 → 7 → 9 → 2 → 4 → 6 → 3 → 5 → 8

**Neden bu sıra:**
- Task 1 diğerleri için zemin kurar (graph altyapı)
- Task 7 bağımsız, hızlı kazanım
- Task 9 hızlı ve risksiz
- Task 2-4-6 bağımsız çekirdek geliştirmeler
- Task 3 iztekService değişikliği, Task 8 confidence için Task 3 çıktısını kullanıyor → son sıraya bırak
