# Routing Enhancement — Durak Durak Güzergah & Yürüme Süresi

**Tarih:** 2026-06-19  
**Kapsam:** Faz 1 — Gelişmiş Rota Verisi + Harita Güncellemesi  
**Yaklaşım:** Mevcut `routingService.ts` genişletme (client-side, sunucu gerektirmez)

---

## Özet

Mevcut rota algoritması boarding/alighting stop dışında adım bilgisi üretmiyor. Bu tasarım:
- Kullanıcı → biniş durağı yürüme süresi
- Otobüs güzergahındaki ara duraklar (yaklaşık sıra)
- İniş durağı → varış yürüme süresi
- RouteResultScreen'de adım adım liste
- RouteMapScreen'de tüm duraklar + yürüme segmentleri

---

## Veri Kısıtı

`izmir-stop-routes.json`: durak → hat listesi (hangi durak hangi hattan geçiyor).  
`izmir-stops.json`: durak koordinatları ve isimleri.  
**GTFS `stop_times.txt` mevcut değil** — gerçek durak sırası bilinmiyor.

**Çözüm:** Bir hattın tüm duraklarını, origin→destination vektörüne projeksiyon ile sıralayarak yaklaşık güzergah oluştur.

---

## Tip Değişiklikleri — `src/types/index.ts`

```typescript
export interface RouteStep {
  type: 'walk' | 'transit';
  durationMins: number;
  // walk
  toStopName?: string;
  distanceMeters?: number;
  // transit
  lineNumber?: string;
  boardStop?: { name: string; latitude: number; longitude: number };
  alightStop?: { name: string; latitude: number; longitude: number };
  intermediateStops?: Array<{ name: string; latitude: number; longitude: number }>;
  departureTime?: string;
}

// Route tipine eklenir:
// steps?: RouteStep[];
```

---

## routingService.ts Değişiklikleri

### Yeni yardımcı fonksiyonlar

**`walkMins(from, to)`**  
Haversine mesafe / 84 m/dak (ortalama yürüyüş hızı). Döner: dakika (integer, min 1).

**`intermediateStops(lineNum, board, alight)`**  
1. `getStopRoutes()` tersine çevir → hat → durak listesi oluştur  
2. Her durağı origin→dest vektörüne projeksiyon skoru ile sırala  
3. Boarding ve alighting arasındaki durakları döndür (max 30 durak)

**`buildSteps(origin, destination, lineNum, boardStop, alightStop)`**  
```
steps = [
  { type:'walk', durationMins: walkMins(origin, boardStop), toStopName: boardStop.name, distanceMeters },
  { type:'transit', lineNumber, boardStop, alightStop, intermediateStops, departureTime },
  { type:'walk', durationMins: walkMins(alightStop, destination), toStopName: destination.name, distanceMeters }
]
```

`departureTime`: `getNextArrivalMins` mevcut fonksiyonundan türetilir — mevcut saat + nextArrivalMins.

### findRoutes() değişikliği

Her `Route` nesnesine `steps: buildSteps(...)` eklenir. Aktarmalı rotalarda iki `transit` adımı ve aralarında bir `walk` adımı olur.

---

## RouteResultScreen Değişiklikleri

Mevcut kartlar korunur. En alta **"Güzergah Adımları"** Surface kartı eklenir:

```
┌─────────────────────────────────┐
│ Güzergah Adımları               │
│                                 │
│ 🚶  3 dk yürüyün                │
│     → Alsancak Meydan Durağı    │
│     (240 m)                     │
│                                 │
│ 🚌  08:45 — Hat 470             │
│     Alsancak → Bornova [▼]      │
│     ┌─ Alsancak Meydan          │
│     ├─ Cumhuriyet Bulvarı       │
│     ├─ ...                      │
│     └─ Bornova Terminal         │
│                                 │
│ 🚶  5 dk yürüyün                │
│     → Varış Noktası (420 m)     │
└─────────────────────────────────┘
```

- Ara duraklar `[▼]` ile collapsible
- `scheduleLoading` benzeri state: ilk render'da steps mevcut (sync)

---

## RouteMapScreen Değişiklikleri

`buildMapHtml()` fonksiyonu genişletilir:

**Yeni parametreler:** `steps: RouteStep[]`

**HTML/JS değişiklikleri:**
- Ara duraklar: küçük mavi `circleMarker` (radius 4), popup: durak adı
- Yürüme segmentleri: kesik çizgi polyline (`dashArray: '5,8'`, gri)
- Transit segmenti: mevcut mavi polyline, ama artık ara duraklar üzerinden geçer
- Biniş/iniş marker'ları: büyük (radius 10), yeşil/kırmızı (mevcut)

---

## Etkilenen Dosyalar

| Dosya | Değişiklik |
|-------|------------|
| `src/types/index.ts` | `RouteStep` interface, `Route.steps` alanı |
| `src/services/gtfs/routingService.ts` | `walkMins`, `intermediateStops`, `buildSteps`, `findRoutes` güncelleme |
| `src/screens/RouteResultScreen.tsx` | "Güzergah Adımları" bölümü |
| `src/screens/RouteMapScreen.tsx` | `buildMapHtml` ara durak + yürüme segmenti |

Diğer dosyalar **değişmez**.

---

## Sınırlar & Bilinen Kısıtlar

- Ara durak sırası: GTFS stop_times olmadığı için projeksiyon tabanlı yaklaşım. Kıvrımlı hatlarda yanlış olabilir.
- `departureTime`: mevcut saat + nextArrivalMins ile tahmin edilir, gerçek kalkış saati değil.
- Aktarma noktası: "Aktarma Durağı" sabit ismi yerine gerçek stop ismi gelecek (intermediateStops'tan).

---

## Test Senaryoları

1. Origin/Destination aynı hattı paylaşan iki nokta → 1 transit adım + 2 walk adım
2. Aktarmalı rota → 2 transit + 3 walk adım
3. Fallback rota → steps mevcut, intermediateStops boş olabilir
4. RouteMap açıldığında ara duraklar görünüyor, popup çalışıyor
5. Collapsible durak listesi açılıp kapanıyor
