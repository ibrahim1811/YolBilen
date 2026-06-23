# Otobüs Karnesi, Telemetri ve Harita İyileştirme — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Araç bazlı topluluk puanlama sistemi (Otobüs Karnesi), anonim kullanım telemetrisi ve rota haritasında yol-izleyen renkli polyline çizimi ekle.

**Architecture:** Firestore `bus_cards` koleksiyonu feedback gönderiminde güncellenir; telemetri fire-and-forget ile `telemetry` koleksiyonuna yazar; RouteMapScreen OSRM public API ile yolu takip eden polyline alır ve farklı renkli marker kullanır.

**Tech Stack:** React Native + Expo SDK 56, Firebase Firestore, Leaflet WebView, OSRM public routing API, AsyncStorage (session ID)

## Global Constraints

- TypeScript strict — `undefined` Firestore'a gönderilmez, conditional spread kullan
- Fire-and-forget: telemetri her zaman `try/catch` içinde, hata kullanıcıya gösterilmez
- OSRM public API: `https://router.project-osrm.org/route/v1/driving/{lon,lat;lon,lat}?overview=full&geometries=geojson`
- Leaflet CDN: `https://unpkg.com/leaflet@1.9.4/`
- Tüm yeni ekranlar `SafeAreaView` + `react-native-paper` ile yazılır
- Commit her task sonunda yapılır

---

## Task 1: Telemetri Servisi

**Files:**
- Create: `src/services/telemetry/telemetryService.ts`

**Interfaces:**
- Consumes: Firebase `db` from `src/services/firebase/config.ts`
- Produces:
  ```ts
  trackScreenView(screen: string): void
  trackRouteSearch(origin: string, destination: string): void
  trackLineOpen(lineNum: string): void
  trackStopOpen(stopId: string): void
  trackBusCardOpen(plate: string): void
  trackFeedbackSubmit(hasPlate: boolean): void
  ```

- [ ] **Step 1: telemetryService.ts oluştur**

```typescript
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import AsyncStorage from '@react-native-async-storage/async-storage';

const APP_VERSION = '1.0.0';
let _sessionId: string | null = null;

async function getSessionId(): Promise<string> {
  if (_sessionId) return _sessionId;
  try {
    const stored = await AsyncStorage.getItem('telemetry_session');
    if (stored) { _sessionId = stored; return stored; }
  } catch {}
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  _sessionId = id;
  try { await AsyncStorage.setItem('telemetry_session', id); } catch {}
  return id;
}

async function track(payload: Record<string, unknown>): Promise<void> {
  try {
    const sessionId = await getSessionId();
    await addDoc(collection(db, 'telemetry'), {
      ...payload,
      sessionId,
      appVersion: APP_VERSION,
      timestamp: Timestamp.now(),
    });
  } catch {}
}

export function trackScreenView(screen: string): void {
  void track({ type: 'screen_view', screen });
}

export function trackRouteSearch(origin: string, destination: string): void {
  void track({ type: 'route_search', origin, destination });
}

export function trackLineOpen(lineNum: string): void {
  void track({ type: 'line_open', lineNum });
}

export function trackStopOpen(stopId: string): void {
  void track({ type: 'stop_open', stopId });
}

export function trackBusCardOpen(plate: string): void {
  void track({ type: 'bus_card_open', plate });
}

export function trackFeedbackSubmit(hasPlate: boolean): void {
  void track({ type: 'feedback_submit', hasPlate });
}
```

- [ ] **Step 2: AsyncStorage paketinin kurulu olduğunu doğrula**

```bash
grep "@react-native-async-storage" package.json
```

Eğer yoksa: `npx expo install @react-native-async-storage/async-storage`

- [ ] **Step 3: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

Beklenen: hata yok.

- [ ] **Step 4: Ekranlara trackScreenView çağrıları ekle**

`src/screens/HomeScreen.tsx` — useEffect içinde:
```typescript
import { trackScreenView } from '../services/telemetry/telemetryService';
// useEffect içine ekle (bağımlılıksız, bir kez çalışır):
useEffect(() => { trackScreenView('HomeScreen'); }, []);
```

`src/screens/RouteResultScreen.tsx`:
```typescript
import { trackScreenView } from '../services/telemetry/telemetryService';
useEffect(() => { trackScreenView('RouteResult'); }, []);
```

`src/screens/CommunityScreen.tsx`:
```typescript
import { trackScreenView } from '../services/telemetry/telemetryService';
useEffect(() => { trackScreenView('CommunityScreen'); }, []);
```

`src/screens/LineDetailScreen.tsx`:
```typescript
import { trackScreenView, trackLineOpen } from '../services/telemetry/telemetryService';
useEffect(() => { trackScreenView('LineDetail'); trackLineOpen(lineNumber); }, []);
```

`src/screens/StopDetailScreen.tsx`:
```typescript
import { trackScreenView, trackStopOpen } from '../services/telemetry/telemetryService';
useEffect(() => { trackScreenView('StopDetail'); trackStopOpen(stopId); }, []);
```

- [ ] **Step 5: RouteSearch'e trackRouteSearch ekle**

`src/screens/RouteSearchScreen.tsx` — rota arama tetiklendiğinde:
```typescript
import { trackRouteSearch } from '../services/telemetry/telemetryService';
// navigation.navigate çağrısının hemen üstüne:
trackRouteSearch(origin.name, destination.name);
```

- [ ] **Step 6: CommunityScreen'de trackFeedbackSubmit ekle**

`src/screens/CommunityScreen.tsx` — `setSnackbar('Teşekkürler...')` satırının hemen üstüne:
```typescript
import { trackFeedbackSubmit } from '../services/telemetry/telemetryService';
trackFeedbackSubmit(!!plateInput.trim());
```

- [ ] **Step 7: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add src/services/telemetry/telemetryService.ts src/screens/HomeScreen.tsx src/screens/RouteResultScreen.tsx src/screens/CommunityScreen.tsx src/screens/LineDetailScreen.tsx src/screens/StopDetailScreen.tsx src/screens/RouteSearchScreen.tsx
git commit -m "feat: telemetri servisi — fire-and-forget Firestore event tracking"
```

---

## Task 2: Otobüs Karnesi — Veri Modeli ve Firestore Servisi

**Files:**
- Create: `src/services/firebase/busCardService.ts`
- Modify: `src/types/index.ts`
- Modify: `src/services/firebase/firestore.ts` (feedback submit'te busCard güncelle)

**Interfaces:**
- Consumes: Firebase `db`, mevcut `submitFeedback()` fonksiyonu
- Produces:
  ```ts
  interface BusCard {
    plate: string;
    totalReports: number;
    climateScore: number;
    crowdScore: number;
    comfortScore: number;
    satisfactionScore: number;
    overallScore: number;
    updatedAt: Timestamp;
  }
  getBusCard(plate: string): Promise<BusCard | null>
  updateBusCardFromFeedback(feedback: Feedback): Promise<void>
  ```

- [ ] **Step 1: BusCard tipini types/index.ts'e ekle**

`src/types/index.ts` sonuna ekle:
```typescript
export interface BusCard {
  plate: string;
  totalReports: number;
  climateScore: number;
  crowdScore: number;
  comfortScore: number;
  satisfactionScore: number;
  overallScore: number;
  updatedAt: Date;
}
```

`RootStackParamList`'e şunu ekle:
```typescript
BusCard: { plate: string };
```

- [ ] **Step 2: busCardService.ts oluştur**

```typescript
import {
  doc, getDoc, runTransaction, Timestamp
} from 'firebase/firestore';
import { db } from './config';
import type { BusCard, Feedback } from '../../types';

function acScore(ac: Feedback['ac']): number {
  return ac === 'good' ? 10 : ac === 'medium' ? 5 : 0;
}
function crowdScore(crowd: Feedback['crowd']): number {
  return crowd === 'seated' ? 10 : crowd === 'standing' ? 5 : 0;
}
function comfortScore(comfort: Feedback['comfort']): number {
  return comfort === 'comfortable' ? 10 : comfort === 'medium' ? 5 : 0;
}
function tempScore(temp: Feedback['temperature']): number {
  return temp === 'cool' ? 10 : temp === 'normal' ? 7 : 3;
}

export async function getBusCard(plate: string): Promise<BusCard | null> {
  try {
    const snap = await getDoc(doc(db, 'bus_cards', plate));
    if (!snap.exists()) return null;
    const d = snap.data();
    return { ...d, updatedAt: d.updatedAt?.toDate() ?? new Date() } as BusCard;
  } catch {
    return null;
  }
}

export async function updateBusCardFromFeedback(feedback: Feedback): Promise<void> {
  if (!feedback.plateNumber) return;
  const plate = feedback.plateNumber.trim();
  if (!plate) return;

  const ref = doc(db, 'bus_cards', plate);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const newAc = acScore(feedback.ac);
    const newCrowd = crowdScore(feedback.crowd);
    const newComfort = comfortScore(feedback.comfort);
    const newSat = tempScore(feedback.temperature);

    if (!snap.exists()) {
      const overall = Math.round((newAc + newCrowd + newComfort + newSat) / 4 * 10) / 10;
      tx.set(ref, {
        plate,
        totalReports: 1,
        climateScore: newAc,
        crowdScore: newCrowd,
        comfortScore: newComfort,
        satisfactionScore: newSat,
        overallScore: overall,
        updatedAt: Timestamp.now(),
      });
    } else {
      const d = snap.data();
      const n = d.totalReports as number;
      const avg = (old: number, val: number) =>
        Math.round(((old * n + val) / (n + 1)) * 10) / 10;
      const climate = avg(d.climateScore, newAc);
      const crowd = avg(d.crowdScore, newCrowd);
      const comfort = avg(d.comfortScore, newComfort);
      const sat = avg(d.satisfactionScore, newSat);
      const overall = Math.round((climate + crowd + comfort + sat) / 4 * 10) / 10;
      tx.update(ref, {
        totalReports: n + 1,
        climateScore: climate,
        crowdScore: crowd,
        comfortScore: comfort,
        satisfactionScore: sat,
        overallScore: overall,
        updatedAt: Timestamp.now(),
      });
    }
  });
}
```

- [ ] **Step 3: submitFeedback sonrasında busCard güncelle**

`src/services/firebase/firestore.ts` — `submitFeedback` fonksiyonunu bul, sonuna ekle:
```typescript
import { updateBusCardFromFeedback } from './busCardService';

// submitFeedback içinde, addDoc çağrısından SONRA:
void updateBusCardFromFeedback(feedback);
```

- [ ] **Step 4: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/services/firebase/busCardService.ts src/services/firebase/firestore.ts
git commit -m "feat: BusCard veri modeli ve Firestore servisi"
```

---

## Task 3: BusCardScreen — Karne Ekranı ve Arama

**Files:**
- Create: `src/screens/BusCardScreen.tsx`
- Modify: `src/navigation/AppNavigator.tsx`
- Modify: `src/screens/LinesScreen.tsx` (arama kutusu yanına plaka arama ekle)

**Interfaces:**
- Consumes: `getBusCard(plate)` from busCardService
- Consumes: `trackBusCardOpen(plate)` from telemetryService
- Produces: `BusCardScreen` navigasyon ekranı

- [ ] **Step 1: BusCardScreen.tsx oluştur**

```typescript
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Appbar, Surface, ProgressBar, useTheme, ActivityIndicator } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, BusCard } from '../types';
import { getBusCard } from '../services/firebase/busCardService';
import { trackBusCardOpen } from '../services/telemetry/telemetryService';

type Props = NativeStackScreenProps<RootStackParamList, 'BusCard'>;

function ScoreRow({ label, score, color }: { label: string; score: number; color: string }) {
  const theme = useTheme();
  return (
    <View style={styles.scoreRow}>
      <View style={styles.scoreLabelRow}>
        <Text style={[styles.scoreLabel, { color: theme.colors.onSurface }]}>{label}</Text>
        <Text style={[styles.scoreValue, { color }]}>{score.toFixed(1)}</Text>
      </View>
      <ProgressBar progress={score / 10} color={color} style={styles.bar} />
    </View>
  );
}

export function BusCardScreen({ navigation, route }: Props) {
  const theme = useTheme();
  const { plate } = route.params;
  const [card, setCard] = useState<BusCard | null | 'loading'>('loading');

  useEffect(() => {
    trackBusCardOpen(plate);
    getBusCard(plate).then(setCard);
  }, [plate]);

  const overallColor = (s: number) =>
    s >= 8 ? '#34A853' : s >= 6 ? '#FBBC04' : '#EA4335';

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <Appbar.Header elevated={false}>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Otobüs Karnesi" />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>
        {card === 'loading' ? (
          <ActivityIndicator style={{ marginTop: 60 }} />
        ) : card === null ? (
          <Surface style={[styles.emptyCard, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
            <Text style={[styles.plateText, { color: theme.colors.onSurface }]}>{plate}</Text>
            <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}>
              Bu araç için henüz değerlendirme yok.{'\n'}İlk sen değerlendir!
            </Text>
          </Surface>
        ) : (
          <>
            <Surface style={[styles.headerCard, { backgroundColor: theme.colors.primaryContainer }]} elevation={0}>
              <Text style={[styles.plateText, { color: theme.colors.primary }]}>{card.plate}</Text>
              <Text style={[styles.overallScore, { color: overallColor(card.overallScore) }]}>
                {card.overallScore.toFixed(1)}
              </Text>
              <Text style={[styles.overallLabel, { color: theme.colors.onPrimaryContainer }]}>
                Genel Puan
              </Text>
              <Text style={[styles.reportCount, { color: theme.colors.onSurfaceVariant }]}>
                {card.totalReports} değerlendirme
              </Text>
            </Surface>

            <Surface style={[styles.scoresCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
              <ScoreRow label="❄️  Klima" score={card.climateScore} color="#1A73E8" />
              <ScoreRow label="👥  Kalabalık" score={card.crowdScore} color="#9C27B0" />
              <ScoreRow label="💺  Konfor" score={card.comfortScore} color="#34A853" />
              <ScoreRow label="😊  Memnuniyet" score={card.satisfactionScore} color="#FF6D00" />
            </Surface>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 16 },
  headerCard: { borderRadius: 20, padding: 28, alignItems: 'center', gap: 4 },
  plateText: { fontSize: 22, fontWeight: '800', letterSpacing: 2 },
  overallScore: { fontSize: 64, fontWeight: '900', lineHeight: 72, marginTop: 8 },
  overallLabel: { fontSize: 14, fontWeight: '600' },
  reportCount: { fontSize: 13, marginTop: 4 },
  scoresCard: { borderRadius: 16, padding: 20, gap: 20 },
  scoreRow: { gap: 6 },
  scoreLabelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  scoreLabel: { fontSize: 15, fontWeight: '500' },
  scoreValue: { fontSize: 15, fontWeight: '700' },
  bar: { height: 8, borderRadius: 4 },
  emptyCard: { borderRadius: 16, padding: 32, alignItems: 'center', marginTop: 40 },
});
```

- [ ] **Step 2: AppNavigator'a BusCardScreen ekle**

`src/navigation/AppNavigator.tsx`:
```typescript
import { BusCardScreen } from '../screens/BusCardScreen';

// Stack.Screen listesine ekle:
<Stack.Screen name="BusCard" component={BusCardScreen} options={{ animation: 'slide_from_right' }} />
```

- [ ] **Step 3: LinesScreen'e plaka arama ekle**

`src/screens/LinesScreen.tsx` — mevcut arama TextInput'unun altına, HATLAR sekmesi görünümüne bir "Plaka ile Ara" Surface ekle:

Önce navigasyon hook'unu ekle:
```typescript
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
```

Component içinde:
```typescript
const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
const [plateSearch, setPlateSearch] = useState('');
```

JSX'te (SectionList'in üstüne):
```typescript
<Surface style={styles.plateSearch} elevation={0}>
  <TextInput
    label="Plaka ile otobüs ara (ör: 35 DB 1234)"
    value={plateSearch}
    onChangeText={text => setPlateSearch(text.toUpperCase())}
    mode="outlined"
    right={
      plateSearch.trim().length >= 5 ? (
        <TextInput.Icon
          icon="arrow-right"
          onPress={() => {
            navigation.navigate('BusCard', { plate: plateSearch.trim() });
            setPlateSearch('');
          }}
        />
      ) : undefined
    }
    autoCapitalize="characters"
    style={styles.plateInput}
  />
</Surface>
```

StyleSheet'e ekle:
```typescript
plateSearch: { margin: 12, borderRadius: 12, backgroundColor: 'transparent' },
plateInput: { backgroundColor: 'transparent' },
```

- [ ] **Step 4: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/screens/BusCardScreen.tsx src/navigation/AppNavigator.tsx src/screens/LinesScreen.tsx
git commit -m "feat: BusCardScreen karne ekranı, plaka arama LinesScreen'de"
```

---

## Task 4: Rota Haritası İyileştirme — OSRM + Renkli Marker

**Files:**
- Modify: `src/screens/RouteMapScreen.tsx`

**Interfaces:**
- Consumes: OSRM public API — `https://router.project-osrm.org/route/v1/driving/{coords}?overview=full&geometries=geojson`
- Mevcut: `buildMapHtml()` fonksiyonu, Leaflet WebView

**Renk şeması:**
- Kullanıcı GPS konumu (biniş/iniş noktası): **mavi** `#1A73E8` — büyük pin
- Biniş durağı: **yeşil** `#34A853` — numbered circle  
- İniş durağı: **kırmızı** `#EA4335` — numbered circle
- Ara duraklar: **turuncu** `#FF6D00` — küçük circle
- Yürüme segmenti: **gri kesikli** `#757575`
- Otobüs güzergahı (OSRM): **mavi** `#1A73E8`, kalın

- [ ] **Step 1: RouteMapScreen.tsx — buildMapHtml fonksiyonunu tamamen yeniden yaz**

`src/screens/RouteMapScreen.tsx` dosyasında `buildMapHtml` fonksiyonunu (`function buildMapHtml(` başından kapanan `}` a kadar) şununla değiştir:

```typescript
function buildMapHtml(params: {
  boarding: { latitude: number; longitude: number; name: string } | null;
  alighting: { latitude: number; longitude: number; name: string } | null;
  center: [number, number];
  steps?: RouteStep[];
  busPositions?: BusPosition[];
}): string {
  const { boarding, alighting, center, steps, busPositions = [] } = params;
  const transitStep = steps?.find(s => s.type === 'transit');
  const midStops = transitStep?.intermediateStops ?? [];

  // Biniş durağı (otobüsün binileceği durak) — GTFS durağı
  const boardStop = transitStep?.boardStop ?? null;
  const alightStop = transitStep?.alightStop ?? null;

  // Ara durak marker'ları — turuncu küçük çember
  const intermediateJs = midStops
    .map(s =>
      `L.circleMarker([${s.latitude},${s.longitude}],` +
      `{radius:6,color:'#FF6D00',fillColor:'#FF6D00',fillOpacity:0.9,weight:2})` +
      `.bindPopup(${JSON.stringify(s.name)}).addTo(map);`
    )
    .join('\n');

  // Yürüyüş segmentleri — gri kesikli
  let walkLinesJs = '';
  if (boardStop && alightStop && boarding && alighting) {
    walkLinesJs =
      `L.polyline([[${boarding.latitude},${boarding.longitude}],[${boardStop.latitude},${boardStop.longitude}]],` +
      `{color:'#757575',weight:3,dashArray:'6,8',opacity:0.7}).addTo(map);\n` +
      `L.polyline([[${alightStop.latitude},${alightStop.longitude}],[${alighting.latitude},${alighting.longitude}]],` +
      `{color:'#757575',weight:3,dashArray:'6,8',opacity:0.7}).addTo(map);`;
  }

  // Otobüs güzergahı — OSRM ile yol takip eden polyline
  const transitCoords: [number, number][] = boardStop && alightStop
    ? [
        [boardStop.latitude, boardStop.longitude],
        ...midStops.map(s => [s.latitude, s.longitude] as [number, number]),
        [alightStop.latitude, alightStop.longitude],
      ]
    : boarding && alighting
      ? [[boarding.latitude, boarding.longitude], [alighting.latitude, alighting.longitude]]
      : [];

  // OSRM koordinat formatı: "lon,lat;lon,lat"
  const osrmCoords = transitCoords.map(([lat, lon]) => `${lon},${lat}`).join(';');

  const osrmFetchJs = transitCoords.length >= 2
    ? `
fetch('https://router.project-osrm.org/route/v1/driving/${osrmCoords}?overview=full&geometries=geojson')
  .then(r => r.json())
  .then(data => {
    if (data.routes && data.routes[0]) {
      var coords = data.routes[0].geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
      L.polyline(coords, {color:'#1A73E8', weight:5, opacity:0.85, lineJoin:'round'}).addTo(map);
    } else {
      L.polyline(${JSON.stringify(transitCoords)}, {color:'#1A73E8', weight:5, opacity:0.85, dashArray:'10,5'}).addTo(map);
    }
  })
  .catch(function() {
    L.polyline(${JSON.stringify(transitCoords)}, {color:'#1A73E8', weight:5, opacity:0.85, dashArray:'10,5'}).addTo(map);
  });`
    : '';

  // Canlı otobüs marker'ları
  const busMarkersJs = busPositions.map(b => {
    const color = b.yon === 0 ? '#1A73E8' : '#FF6D00';
    const label = b.yon === 0 ? 'Gidiş' : 'Dönüş';
    return (
      `L.marker([${b.lat},${b.lon}],{icon:L.divIcon({` +
      `html:'<div style="background:${color};color:#fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 8px rgba(0,0,0,0.4)">🚌</div>',` +
      `iconSize:[30,30],iconAnchor:[15,15],className:''})}).bindPopup('🚌 #${b.otobusId} · ${label}').addTo(map);`
    );
  }).join('\n');

  // Kullanıcı GPS biniş noktası — büyük mavi pin
  const userBoardJs = boarding
    ? `L.marker([${boarding.latitude},${boarding.longitude}],{icon:userIcon})` +
      `.bindPopup(${JSON.stringify('📍 ' + boarding.name)}).addTo(map).openPopup();`
    : '';

  // Kullanıcı GPS iniş noktası — büyük mor pin
  const userAlightJs = alighting
    ? `L.marker([${alighting.latitude},${alighting.longitude}],{icon:destIcon})` +
      `.bindPopup(${JSON.stringify('🏁 ' + alighting.name)}).addTo(map);`
    : '';

  // GTFS biniş durağı — yeşil numbered
  const boardStopJs = boardStop
    ? `L.circleMarker([${boardStop.latitude},${boardStop.longitude}],` +
      `{radius:10,color:'#34A853',fillColor:'#34A853',fillOpacity:1,weight:3})` +
      `.bindPopup(${JSON.stringify('🟢 Biniş Durağı: ' + boardStop.name)}).addTo(map);`
    : '';

  // GTFS iniş durağı — kırmızı numbered
  const alightStopJs = alightStop
    ? `L.circleMarker([${alightStop.latitude},${alightStop.longitude}],` +
      `{radius:10,color:'#EA4335',fillColor:'#EA4335',fillOpacity:1,weight:3})` +
      `.bindPopup(${JSON.stringify('🔴 İniş Durağı: ' + alightStop.name)}).addTo(map);`
    : '';

  const allPts: [number, number][] = [
    ...(boarding ? [[boarding.latitude, boarding.longitude] as [number, number]] : []),
    ...(alighting ? [[alighting.latitude, alighting.longitude] as [number, number]] : []),
    ...transitCoords,
  ];
  const boundsJs = allPts.length > 1
    ? `map.fitBounds(${JSON.stringify(allPts)},{padding:[60,60]});`
    : `map.setView([${center[0]},${center[1]}],14);`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#map{margin:0;padding:0;height:100%;width:100%;}</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map=L.map('map',{zoomControl:true});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap',maxZoom:19}).addTo(map);

var userIcon=L.divIcon({html:'<div style="background:#1A73E8;border:3px solid white;border-radius:50%;width:18px;height:18px;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>',iconSize:[18,18],iconAnchor:[9,9],className:''});
var destIcon=L.divIcon({html:'<div style="background:#9C27B0;border:3px solid white;border-radius:50%;width:18px;height:18px;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>',iconSize:[18,18],iconAnchor:[9,9],className:''});

${intermediateJs}
${walkLinesJs}
${boardStopJs}
${alightStopJs}
${busMarkersJs}
${userBoardJs}
${userAlightJs}
${boundsJs}
${osrmFetchJs}
</script>
</body>
</html>`;
}
```

- [ ] **Step 2: TypeScript kontrolü**

```bash
npx tsc --noEmit
```

Beklenen: hata yok.

- [ ] **Step 3: Commit**

```bash
git add src/screens/RouteMapScreen.tsx
git commit -m "feat: rota haritası OSRM yol-izleyen polyline, renk kodlu marker sistemi"
```

---

## Self-Review

**Spec coverage:**
- ✅ bus_cards Firestore koleksiyonu — Task 2
- ✅ plate bazlı scoring (klimf/kalabalık/konfor/memnuniyet) — Task 2 busCardService
- ✅ BusCardScreen modern kart tasarımı — Task 3
- ✅ Plaka arama — Task 3 LinesScreen
- ✅ 0-10 arası skor, genel puan ortalaması — Task 2
- ✅ telemetry koleksiyonu, sessionId, appVersion — Task 1
- ✅ screen_view, route_search, line_open, stop_open, bus_card_open, feedback_submit — Task 1
- ✅ Fire-and-forget, try/catch — Task 1 `track()` fonksiyonu
- ✅ OSRM yol takip eden polyline, fallback düz çizgi — Task 4
- ✅ Farklı renkli marker: GPS mavi, biniş yeşil, iniş kırmızı, ara turuncu — Task 4

**Type consistency:**
- `BusCard` interface Task 2 Step 1'de tanımlanıyor, Task 3'te import ediliyor ✅
- `RootStackParamList.BusCard` Task 2 Step 1'de ekleniyor, Task 3'te navigate ediliyor ✅
- `trackBusCardOpen` Task 1'de export ediliyor, Task 3'te import ediliyor ✅
