# Optimizasyon ve Yeni Özellikler — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yolbul uygulamasını performans, UX ve özellik açısından production seviyesine taşı.

**Architecture:** 8 bağımsız task — her biri ayrı commit, birbirini bozmaz. Task 3 (aktarmalı rota) en bağımsız, Task 1 (spatial cache) Task 3'ün temelini güçlendirir.

**Tech Stack:** React Native + Expo SDK 56, Firebase Firestore, AsyncStorage, expo-notifications, react-native-paper

## Global Constraints

- TypeScript strict — `undefined` Firestore'a gönderilmez
- `react-native-paper` component'leri kullan, custom style minimum tut
- Commit her task sonunda yapılır
- `npx tsc --noEmit` her task sonunda temiz olmalı

---

## Task 1: GTFS Spatial Cache — Hızlı Durak Arama

**Files:**
- Modify: `src/data/gtfsData.ts`

**Problem:** `getLinesNearOrigin` şu an tüm durağı (binlerce kayıt) her aramada O(n) tarar. Grid-based spatial index ekleyerek O(1) lookup yapacağız.

**Interfaces:**
- `getLinesNearOrigin(origin, radiusKm)` — imza değişmez, sadece içi hızlanır

- [ ] **Step 1: gtfsData.ts'e grid cache ekle**

`src/data/gtfsData.ts` dosyasında mevcut `let _stops` satırlarının altına ekle:

```typescript
let _grid: Map<string, IzmirStop[]> | null = null;
const GRID_SIZE = 0.02; // ~2km grid hücre

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
```

- [ ] **Step 2: getLinesNearOrigin'i grid kullanacak şekilde yeniden yaz**

`src/data/gtfsData.ts` dosyasında `getLinesNearOrigin` fonksiyonunu bul ve şununla değiştir:

```typescript
export function getLinesNearOrigin(
  origin: { lat: number; lon: number },
  radiusKm = 1.0
): string[] {
  const grid = getGrid();
  const srd = getStopRouteDirs();
  const seen = new Set<string>();
  const result: string[] = [];

  const cellRadius = Math.ceil(radiusKm / (GRID_SIZE * 111)) + 1;
  const centerCellLat = Math.floor(origin.lat / GRID_SIZE);
  const centerCellLon = Math.floor(origin.lon / GRID_SIZE);

  for (let dlat = -cellRadius; dlat <= cellRadius; dlat++) {
    for (let dlon = -cellRadius; dlon <= cellRadius; dlon++) {
      const key = `${centerCellLat + dlat},${centerCellLon + dlon}`;
      const stops = grid.get(key) ?? [];
      for (const stop of stops) {
        const dLat = (stop.lat - origin.lat) * 111;
        const dLon = (stop.lon - origin.lon) * 111 * Math.cos(origin.lat * Math.PI / 180);
        if (Math.sqrt(dLat * dLat + dLon * dLon) > radiusKm) continue;
        for (const rd of srd[stop.id] ?? []) {
          if (!seen.has(rd.lineNum)) {
            seen.add(rd.lineNum);
            result.push(rd.lineNum);
          }
        }
      }
    }
  }
  return result;
}
```

- [ ] **Step 3: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/data/gtfsData.ts
git commit -m "perf: GTFS spatial grid cache — O(n) durak taraması O(1) oldu"
```

---

## Task 2: Offline Route Cache

**Files:**
- Create: `src/services/cache/routeCache.ts`
- Modify: `src/screens/RouteSearchScreen.tsx`

**Interfaces:**
- `saveRouteCache(origin, destination, routes)` — AsyncStorage'a yazar
- `loadRouteCache(origin, destination)` — eşleşen cache döner veya null

- [ ] **Step 1: routeCache.ts oluştur**

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Route, Location } from '../../types';

const CACHE_KEY = 'route_cache_v1';
const MAX_ENTRIES = 10;
const TTL_MS = 30 * 60 * 1000; // 30 dakika

interface CacheEntry {
  originName: string;
  destinationName: string;
  routes: Route[];
  savedAt: number;
}

async function readAll(): Promise<CacheEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function writeAll(entries: CacheEntry[]): Promise<void> {
  try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entries)); } catch {}
}

export async function saveRouteCache(
  origin: Location,
  destination: Location,
  routes: Route[]
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
  });
  await writeAll(filtered.slice(0, MAX_ENTRIES));
}

export async function loadRouteCache(
  origin: Location,
  destination: Location
): Promise<Route[] | null> {
  const all = await readAll();
  const entry = all.find(
    e => e.originName === origin.name && e.destinationName === destination.name
  );
  if (!entry) return null;
  if (Date.now() - entry.savedAt > TTL_MS) return null;
  return entry.routes;
}
```

- [ ] **Step 2: RouteSearchScreen'de cache entegrasyonu**

`src/screens/RouteSearchScreen.tsx` dosyasında import'a ekle:
```typescript
import { saveRouteCache, loadRouteCache } from '../services/cache/routeCache';
```

`handleSearch` (veya `findRoutes` çağrısı yapılan) fonksiyonunu bul. Şu an şöyle bir şey olmalı:
```typescript
// findRoutes çağrısının bulunduğu useEffect veya fonksiyon
const found = await findRoutes(origin, destination);
setRoutes(found);
```

Bunu şununla değiştir:
```typescript
let found: Route[] = [];
try {
  found = await findRoutes(origin, destination);
  if (found.length > 0) await saveRouteCache(origin, destination, found);
} catch {
  const cached = await loadRouteCache(origin, destination);
  if (cached) {
    found = cached;
    // Opsiyonel: kullanıcıya "çevrimdışı sonuç" göster
  }
}
setRoutes(found);
```

- [ ] **Step 3: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/services/cache/routeCache.ts src/screens/RouteSearchScreen.tsx
git commit -m "feat: offline route cache — son 10 arama 30 dk AsyncStorage'da saklanır"
```

---

## Task 3: Aktarmalı Rota Desteği

**Files:**
- Modify: `src/services/gtfs/routingService.ts`
- Modify: `src/types/index.ts` (Transfer interface zaten var)

**Algorithm:** Direkt hatlardan sonra, origin etrafındaki her hattın iniş duraklarından destination'a ulaşan ikinci hat aranır. Toplam yürüme < 2km, aktarma yürüme < 600m.

**Interfaces:**
- `findRoutes(origin, destination)` — aynı imza, artık transfer'lı rotaları da döner
- `Route.transfers` — zaten `Transfer[]` tipinde, dolduracağız

- [ ] **Step 1: Transfer tipini kontrol et**

`src/types/index.ts` dosyasında Transfer interface'ini bul:
```typescript
export interface Transfer {
  // mevcut alanlar
}
```

Eğer boşsa veya eksikse şununla değiştir/ekle:
```typescript
export interface Transfer {
  lineNumber: string;
  lineName: string;
  boardStop: RouteStop;
  alightStop: RouteStop;
  walkMins: number;
}
```

- [ ] **Step 2: routingService.ts'e findTransferRoutes ekle**

`src/services/gtfs/routingService.ts` dosyasında, `findRoutes` fonksiyonunun hemen üstüne ekle:

```typescript
const MAX_TRANSFER_WALK_KM = 0.6;
const MAX_TRANSFER_TOTAL_KM = 2.5;

async function findTransferRoutes(
  origin: Location,
  destination: Location
): Promise<Route[]> {
  const results: Route[] = [];
  const line1Candidates = getLinesNearOrigin(
    { lat: origin.latitude, lon: origin.longitude },
    MAX_WALK_KM
  );

  for (const line1 of line1Candidates) {
    if (results.length >= 3) break;
    const name1 = getRouteName(line1);
    if (!name1) continue;

    const pair1 = findBoardAlightPair(
      line1,
      { lat: origin.latitude, lon: origin.longitude },
      { lat: destination.latitude, lon: destination.longitude }
    );
    if (!pair1) continue;

    // İniş durağından itibaren destination'a yakın hat ara
    const transferOrigin = { lat: pair1.alight.lat, lon: pair1.alight.lon };
    const line2Candidates = getLinesNearOrigin(transferOrigin, MAX_TRANSFER_WALK_KM);

    for (const line2 of line2Candidates) {
      if (line2 === line1) continue;
      if (results.length >= 3) break;
      const name2 = getRouteName(line2);
      if (!name2) continue;

      const pair2 = findBoardAlightPair(
        line2,
        transferOrigin,
        { lat: destination.latitude, lon: destination.longitude }
      );
      if (!pair2) continue;

      const alightWalk = haversineKm(
        { lat: destination.latitude, lon: destination.longitude },
        { lat: pair2.alight.lat, lon: pair2.alight.lon }
      );
      if (alightWalk > MAX_WALK_KM) continue;

      const board1: RouteStop = { id: pair1.board.id, name: pair1.board.name, latitude: pair1.board.lat, longitude: pair1.board.lon };
      const alight1: RouteStop = { id: pair1.alight.id, name: pair1.alight.name, latitude: pair1.alight.lat, longitude: pair1.alight.lon };
      const board2: RouteStop = { id: pair2.board.id, name: pair2.board.name, latitude: pair2.board.lat, longitude: pair2.board.lon };
      const alight2: RouteStop = { id: pair2.alight.id, name: pair2.alight.name, latitude: pair2.alight.lat, longitude: pair2.alight.lon };

      const transferWalk = haversineKm(
        { lat: alight1.latitude, lon: alight1.longitude },
        { lat: board2.latitude, lon: board2.longitude }
      );
      const transferWalkMins = Math.round(transferWalk * 12);

      const steps1 = buildSteps(origin, { name: alight1.name, latitude: alight1.latitude, longitude: alight1.longitude }, line1, pair1.dir, board1, alight1, null);
      const steps2 = buildSteps({ name: board2.name, latitude: board2.latitude, longitude: board2.longitude }, destination, line2, pair2.dir, board2, alight2, null);

      const totalDuration = steps1.reduce((s, st) => s + st.durationMins, 0)
        + transferWalkMins
        + steps2.reduce((s, st) => s + st.durationMins, 0);

      results.push({
        id: `transfer-${line1}-${line2}`,
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
        nextArrival: null,
        crowdLevel: 'low',
        boardingStop: board1,
        alightingStop: alight2,
        steps: [...steps1, ...steps2],
      });
    }
  }
  return results;
}
```

- [ ] **Step 3: findRoutes içinde transfer rotaları birleştir**

`findRoutes` fonksiyonunda `return results;` satırından önce:

```typescript
  // Direkt rota bulunamazsa veya az bulunursa aktarmalı ara
  if (results.length < 3) {
    try {
      const transferRoutes = await findTransferRoutes(origin, destination);
      for (const tr of transferRoutes) {
        if (!results.find(r => r.lineNumber === tr.lineNumber)) {
          results.push(tr);
        }
      }
    } catch {}
  }
```

- [ ] **Step 4: RouteCard'da aktarma göster**

`src/components/route/RouteCard.tsx` dosyasını bul ve aktarma bilgisi gösterecek kısım ekle. Önce mevcut yapıyı kontrol et:

```bash
grep -n "transfer\|lineName\|estimatedDuration" src/components/route/RouteCard.tsx | head -15
```

Eğer `transfers.length > 0` kontrolü yoksa, hat adı gösteriminin altına ekle:
```typescript
{route.transfers.length > 0 && (
  <Text style={{ fontSize: 12, color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
    🔄 Aktarma: {route.transfers[0].boardStop.name}
  </Text>
)}
```

- [ ] **Step 5: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/services/gtfs/routingService.ts src/types/index.ts src/components/route/RouteCard.tsx
git commit -m "feat: aktarmalı rota desteği — 1 aktarmalı rotalar otomatik bulunuyor"
```

---

## Task 4: Skeleton Loader Bileşeni

**Files:**
- Create: `src/components/common/SkeletonCard.tsx`
- Modify: `src/screens/RouteSearchScreen.tsx`
- Modify: `src/screens/LinesScreen.tsx`

**Interfaces:**
- `<SkeletonCard lines={3} />` — `lines` prop kadar gri satır gösterir

- [ ] **Step 1: SkeletonCard.tsx oluştur**

```typescript
import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';

interface Props {
  lines?: number;
  height?: number;
}

export function SkeletonCard({ lines = 3, height = 80 }: Props) {
  const theme = useTheme();
  const anim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [anim]);

  return (
    <Animated.View style={[styles.card, { backgroundColor: theme.colors.surfaceVariant, opacity: anim, minHeight: height }]}>
      {Array.from({ length: lines }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.line,
            { backgroundColor: theme.colors.outline, width: i === lines - 1 ? '60%' : '100%' },
          ]}
        />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 16, margin: 4, gap: 10 },
  line: { height: 12, borderRadius: 6 },
});
```

- [ ] **Step 2: RouteSearchScreen'de yükleme sırasında skeleton göster**

`src/screens/RouteSearchScreen.tsx` dosyasında:

```typescript
import { SkeletonCard } from '../components/common/SkeletonCard';
```

`isLoading` true iken route listesi yerine:
```typescript
{isLoading ? (
  <>
    <SkeletonCard lines={3} height={100} />
    <SkeletonCard lines={3} height={100} />
    <SkeletonCard lines={3} height={100} />
  </>
) : (
  /* mevcut FlatList */
)}
```

- [ ] **Step 3: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/common/SkeletonCard.tsx src/screens/RouteSearchScreen.tsx
git commit -m "feat: skeleton loader — rota yüklenirken animasyonlu placeholder"
```

---

## Task 5: Hata Ekranları — Retry Button

**Files:**
- Create: `src/components/common/ErrorView.tsx`
- Modify: `src/screens/RouteSearchScreen.tsx`
- Modify: `src/screens/CommunityScreen.tsx`

**Interfaces:**
- `<ErrorView message={string} onRetry={() => void} />` — merkezi hata bileşeni

- [ ] **Step 1: ErrorView.tsx oluştur**

```typescript
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
  message?: string;
  onRetry?: () => void;
}

export function ErrorView({ message = 'Bir hata oluştu.', onRetry }: Props) {
  const theme = useTheme();
  return (
    <View style={styles.root}>
      <MaterialCommunityIcons name="wifi-off" size={48} color={theme.colors.onSurfaceVariant} />
      <Text style={[styles.msg, { color: theme.colors.onSurfaceVariant }]}>{message}</Text>
      {onRetry && (
        <Button mode="contained-tonal" onPress={onRetry} style={styles.btn}>
          Tekrar Dene
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 32 },
  msg: { fontSize: 15, textAlign: 'center' },
  btn: { marginTop: 8 },
});
```

- [ ] **Step 2: RouteSearchScreen'de hata state ekle**

`src/screens/RouteSearchScreen.tsx` dosyasında:

```typescript
import { ErrorView } from '../components/common/ErrorView';
```

State'e ekle:
```typescript
const [searchError, setSearchError] = useState<string | null>(null);
```

`findRoutes` çağrısı olan blokta:
```typescript
try {
  setSearchError(null);
  // ... mevcut findRoutes çağrısı
} catch (e) {
  setSearchError('Rotalar yüklenemedi. İnternet bağlantınızı kontrol edin.');
}
```

JSX'te, routes boş ve error varsa:
```typescript
{searchError && routes.length === 0 ? (
  <ErrorView message={searchError} onRetry={() => { /* handleSearch tekrar çağır */ }} />
) : null}
```

- [ ] **Step 3: CommunityScreen'de hata gösterimi iyileştir**

`src/screens/CommunityScreen.tsx` dosyasında `loadRecent` fonksiyonundaki catch bloğunu:
```typescript
} catch {
  // mevcut boş catch
}
```

Şununla değiştir:
```typescript
} catch {
  setSnackbar('Veriler yüklenemedi. Bağlantınızı kontrol edin.');
}
```

- [ ] **Step 4: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/components/common/ErrorView.tsx src/screens/RouteSearchScreen.tsx src/screens/CommunityScreen.tsx
git commit -m "feat: ErrorView bileşeni — hata ekranları retry butonu ile iyileştirildi"
```

---

## Task 6: Onboarding Ekranı

**Files:**
- Create: `src/screens/OnboardingScreen.tsx`
- Modify: `src/navigation/AppNavigator.tsx`
- Modify: `src/types/index.ts`

**Logic:** AsyncStorage'da `onboarding_done` key'i yoksa OnboardingScreen göster, sonra Login'e yönlendir.

- [ ] **Step 1: OnboardingScreen.tsx oluştur**

```typescript
import React, { useRef, useState } from 'react';
import { View, StyleSheet, Dimensions, FlatList } from 'react-native';
import { Text, Button, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    icon: 'bus' as const,
    title: 'İzmir\'de Kolay Ulaşım',
    desc: 'Binlerce ESHOT hattı, gerçek zamanlı araç konumları ve aktarmalı rota önerileri.',
    color: '#1A73E8',
  },
  {
    icon: 'white-balance-sunny' as const,
    title: 'Serin Tarafı Bul',
    desc: 'Güneş analizi ile otobüste hangi tarafın daha serin olduğunu öğren.',
    color: '#FF8F00',
  },
  {
    icon: 'account-group' as const,
    title: 'Topluluk Deneyimleri',
    desc: 'Otobüs konforunu değerlendir, diğer yolcuların yorumlarını gör.',
    color: '#34A853',
  },
];

export function OnboardingScreen({ navigation }: Props) {
  const theme = useTheme();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  async function finish() {
    await AsyncStorage.setItem('onboarding_done', '1');
    navigation.replace('Login');
  }

  function next() {
    if (index < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: index + 1 });
      setIndex(index + 1);
    } else {
      finish();
    }
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={[styles.iconWrap, { backgroundColor: item.color + '20' }]}>
              <MaterialCommunityIcons name={item.icon} size={72} color={item.color} />
            </View>
            <Text style={[styles.title, { color: theme.colors.onSurface }]}>{item.title}</Text>
            <Text style={[styles.desc, { color: theme.colors.onSurfaceVariant }]}>{item.desc}</Text>
          </View>
        )}
      />

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, { backgroundColor: i === index ? theme.colors.primary : theme.colors.outline }]}
          />
        ))}
      </View>

      <View style={styles.footer}>
        {index < SLIDES.length - 1 && (
          <Button onPress={finish} textColor={theme.colors.onSurfaceVariant}>Atla</Button>
        )}
        <Button mode="contained" onPress={next} style={styles.nextBtn}>
          {index === SLIDES.length - 1 ? 'Başla' : 'Devam'}
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  slide: { alignItems: 'center', justifyContent: 'center', padding: 40, gap: 24 },
  iconWrap: { width: 140, height: 140, borderRadius: 70, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  desc: { fontSize: 16, textAlign: 'center', lineHeight: 24 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24 },
  nextBtn: { flex: 1, marginLeft: 8 },
});
```

- [ ] **Step 2: RootStackParamList'e Onboarding ekle**

`src/types/index.ts` dosyasında `RootStackParamList`'e:
```typescript
Onboarding: undefined;
```

- [ ] **Step 3: AppNavigator'da onboarding kontrolü**

`src/navigation/AppNavigator.tsx` dosyasında:

```typescript
import { OnboardingScreen } from '../screens/OnboardingScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
```

`AppNavigator` component içinde state ekle:
```typescript
const [onboardingDone, setOnboardingDone] = React.useState<boolean | null>(null);

React.useEffect(() => {
  AsyncStorage.getItem('onboarding_done').then(val => setOnboardingDone(!!val));
}, []);

if (onboardingDone === null) return null; // splash bekle
```

Navigator'ın unauthenticated branch'ine, `Login` screen'den önce ekle:
```typescript
{!onboardingDone && (
  <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} />
)}
<Stack.Screen name="Login" component={LoginScreen} />
```

`initialRouteName` belirle:
```typescript
<Stack.Navigator
  screenOptions={{ headerShown: false }}
  initialRouteName={!onboardingDone ? 'Onboarding' : 'Login'}
>
```

- [ ] **Step 4: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/screens/OnboardingScreen.tsx src/navigation/AppNavigator.tsx src/types/index.ts
git commit -m "feat: onboarding ekranı — ilk açılışta 3 slaytlık tanıtım"
```

---

## Task 7: Durak Bildirim Aboneliği

**Files:**
- Modify: `src/screens/StopDetailScreen.tsx`

**Logic:** Kullanıcı bir hat için "Bildir" butonuna basar → expo-notifications ile 1 dakika sonra kontrol eden bir alarm kurulur → hat yakınsa bildirim gönderilir.

- [ ] **Step 1: StopDetailScreen'e bildirim butonu ekle**

`src/screens/StopDetailScreen.tsx` dosyasında import ekle:
```typescript
import * as Notifications from 'expo-notifications';
```

Her `ArrivalRow` veya hat listesi öğesinin yanına buton ekle. Önce mevcut satır render pattern'ını bul:
```bash
grep -n "ArrivalRow\|minutesAway\|lineNumber" src/screens/StopDetailScreen.tsx | head -10
```

Hat listesi render bloğunda, her öğenin yanına:
```typescript
<Button
  mode="text"
  compact
  icon="bell-outline"
  onPress={async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${arrival.lineNumber} Hattı Geliyor`,
        body: `${stopName} durağına yaklaşık ${arrival.minutesAway} dakika kaldı.`,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(30, (arrival.minutesAway - 2) * 60),
      },
    });
    // Kullanıcıya snackbar göster
  }}
>
  Hatırlat
</Button>
```

- [ ] **Step 2: Snackbar state ekle**

StopDetailScreen'de mevcut state'lere:
```typescript
const [notifSnack, setNotifSnack] = useState('');
```

JSX'in sonuna (SafeAreaView kapanmadan önce):
```typescript
<Snackbar
  visible={!!notifSnack}
  onDismiss={() => setNotifSnack('')}
  duration={3000}
>
  {notifSnack}
</Snackbar>
```

Buton onPress'te `scheduleNotificationAsync` sonrasına:
```typescript
setNotifSnack(`${arrival.lineNumber} için hatırlatıcı kuruldu.`);
```

- [ ] **Step 3: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/screens/StopDetailScreen.tsx
git commit -m "feat: durak bildirim aboneliği — hat geliş zamanı hatırlatıcısı"
```

---

## Task 8: Yoğunluk Haritası (CommunityScreen)

**Files:**
- Create: `src/components/community/CrowdMapModal.tsx`
- Modify: `src/screens/CommunityScreen.tsx`

**Logic:** Son 50 feedback'ten konum + kalabalık bilgisini çeker, Leaflet haritasında renk kodlu çemberler olarak gösterir.

- [ ] **Step 1: CrowdMapModal.tsx oluştur**

```typescript
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Portal, Modal, Text, IconButton, useTheme } from 'react-native-paper';
import { WebView } from 'react-native-webview';
import { getRecentFeedbacks } from '../../services/firebase/firestore';
import type { Feedback } from '../../types';

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

function crowdColor(crowd: Feedback['crowd']): string {
  return crowd === 'seated' ? '#34A853' : crowd === 'standing' ? '#FBBC04' : '#EA4335';
}

function buildHtml(feedbacks: Feedback[]): string {
  const markers = feedbacks
    .filter(f => f.latitude !== undefined && f.longitude !== undefined)
    .map(f =>
      `L.circleMarker([${(f as any).latitude},${(f as any).longitude}],` +
      `{radius:12,color:'${crowdColor(f.crowd)}',fillColor:'${crowdColor(f.crowd)}',fillOpacity:0.6,weight:2})` +
      `.bindPopup('${f.lineNumber} · ${f.crowd === 'seated' ? 'Boş' : f.crowd === 'standing' ? 'Kalabalık' : 'Çok Doluydu'}').addTo(map);`
    ).join('\n');

  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#map{margin:0;padding:0;height:100%;width:100%;}</style>
</head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map=L.map('map').setView([38.4189,27.1287],12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OSM'}).addTo(map);
${markers}
</script></body></html>`;
}

export function CrowdMapModal({ visible, onDismiss }: Props) {
  const theme = useTheme();
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    getRecentFeedbacks(50).then(f => { setFeedbacks(f); setLoading(false); }).catch(() => setLoading(false));
  }, [visible]);

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.onSurface }]}>🗺️ Yoğunluk Haritası</Text>
          <IconButton icon="close" size={20} onPress={onDismiss} />
        </View>
        <View style={styles.legend}>
          {[['#34A853','Boş'],['#FBBC04','Kalabalık'],['#EA4335','Çok Doluydu']].map(([c,l]) => (
            <View key={l} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: c }]}/>
              <Text style={{ fontSize: 12, color: theme.colors.onSurfaceVariant }}>{l}</Text>
            </View>
          ))}
        </View>
        <View style={styles.mapWrap}>
          {loading ? (
            <ActivityIndicator style={{ flex: 1 }} />
          ) : (
            <WebView source={{ html: buildHtml(feedbacks) }} javaScriptEnabled style={{ flex: 1 }} />
          )}
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  container: { margin: 12, borderRadius: 16, overflow: 'hidden', backgroundColor: 'white', maxHeight: '90%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 4 },
  title: { fontSize: 16, fontWeight: '700' },
  legend: { flexDirection: 'row', gap: 16, paddingHorizontal: 16, paddingBottom: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  mapWrap: { height: 420 },
});
```

**Not:** Feedback kayıtlarında konum bilgisi şu an yok. `submitFeedback` çağrısında kullanıcının mevcut konumunu da kaydetmek gerekir. Şimdilik haritada durak koordinatları kullanılacak — bunun için boarding stop koordinatlarını feedback'e ekle.

- [ ] **Step 2: Feedback tipine konum ekle**

`src/types/index.ts` dosyasında `Feedback` interface'ine ekle:
```typescript
latitude?: number;
longitude?: number;
```

- [ ] **Step 3: CommunityScreen'de feedback submit'e konum ekle**

`src/screens/CommunityScreen.tsx` dosyasında, feedback submit'e seçilen hattın boarding stop'undan koordinat ekle. Önce `selectedLine` state'ine bak — stop koordinatı yoksa GPS al:

```typescript
// handleSubmit içinde, addDoc çağrısından önce:
let feedbackLat: number | undefined;
let feedbackLon: number | undefined;
try {
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  feedbackLat = pos.coords.latitude;
  feedbackLon = pos.coords.longitude;
} catch {}
```

Submit payload'a:
```typescript
...(feedbackLat !== undefined ? { latitude: feedbackLat, longitude: feedbackLon } : {}),
```

- [ ] **Step 4: CommunityScreen'e harita butonu ekle**

`src/screens/CommunityScreen.tsx` dosyasında:
```typescript
import { CrowdMapModal } from '../components/community/CrowdMapModal';
```

State ekle:
```typescript
const [showCrowdMap, setShowCrowdMap] = useState(false);
```

"Topluluk Uyarıları" başlığının yanına buton ekle:
```typescript
<View style={styles.sectionHeader}>
  <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Topluluk Uyarıları</Text>
  <IconButton icon="map-marker-multiple" size={20} onPress={() => setShowCrowdMap(true)} />
</View>
```

JSX sonuna:
```typescript
<CrowdMapModal visible={showCrowdMap} onDismiss={() => setShowCrowdMap(false)} />
```

- [ ] **Step 5: expo-location import ekle (yoksa)**

`src/screens/CommunityScreen.tsx` dosyasında:
```typescript
import * as Location from 'expo-location';
```

- [ ] **Step 6: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/components/community/CrowdMapModal.tsx src/screens/CommunityScreen.tsx src/types/index.ts
git commit -m "feat: yoğunluk haritası — topluluk feedback'leri Leaflet haritasında gösteriliyor"
```

---

## Self-Review

**Spec coverage:**
- ✅ GTFS spatial cache — Task 1
- ✅ Offline route cache — Task 2
- ✅ Aktarmalı rota — Task 3
- ✅ Skeleton loader — Task 4
- ✅ Error screens + retry — Task 5
- ✅ Onboarding — Task 6
- ✅ Bus arrival notifications — Task 7
- ✅ Yoğunluk haritası — Task 8

**Kapsam dışı (gerektirir native/external):**
- Widget — Expo Widgets ayrı native module
- WebView → react-native-maps geçişi — büyük refactor, ayrı plan gerektirir
- Firestore composite index — Firebase Console'dan manuel eklenmeli
- Bundle boyutu — ayrı Firestore migration planı gerektirir

**Type consistency:**
- `Transfer` interface Task 3'te güncelleniyor, Task 3 kendi içinde kullanıyor ✅
- `SkeletonCard` Task 4'te oluşturulup Task 4'te kullanılıyor ✅
- `CrowdMapModal` Task 8'de oluşturulup Task 8'de CommunityScreen'e ekleniyor ✅
- `Feedback.latitude/longitude` Task 8 Step 2'de ekleniyor, Step 3'te kullanılıyor ✅
