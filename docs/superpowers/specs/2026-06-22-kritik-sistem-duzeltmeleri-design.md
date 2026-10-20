# YolBilen Kritik Sistem Düzeltmeleri — Tasarım Spesifikasyonu

Tarih: 2026-06-22  
Kapsam: 8 madde, 5 grup  
Kısıt: Android Studio build bozulmamalı; yeni native paket eklenmeyecek.

---

## Grup A — GTFS Veri Katmanı Yeniden İnşası (Maddeler 1 + 2)

### Problem
`izmir-stop-routes.json`: stop → [hat_no] — yön bilgisi yok.  
Sonuç: karşı taraftaki duraklar seçilebiliyor, rota bozuluyor.

### Çözüm: Offline Build Script

`scripts/build-gtfs.mjs` (Node.js, tek seferlik):

```
INPUT:  C:\Users\Kayra\Downloads\bus-eshot-gtfs\*.txt
OUTPUT: src/data/gtfs/
  stops.json           — {id, name, lat, lon}[]
  stop-route-dirs.json — {[stopId]: {lineNum, dir}[]}
  route-stop-seqs.json — {"lineNum_0": stopId[], "lineNum_1": stopId[]}
  ring-routes.json     — string[]  (3 ring hat: yalnızca dir0)
  shapes.json          — {"lineNum_0": [lat, lon][]}  (Douglas-Peucker ile sadeleştirilmiş)
  route-meta.json      — {[lineNum]: {name: string}}
```

### Yön-Bilinçli Durak Seçimi

```
findBoardAlightPair(lineNum, origin, dest):
  dir0stops = route-stop-seqs["lineNum_0"]
  dir1stops = route-stop-seqs["lineNum_1"]

  for each direction:
    boardIdx = en küçük idx, origin'e en yakın durak
    alightIdx = en küçük idx > boardIdx, dest'e en yakın durak
    if boardIdx < alightIdx → geçerli çift

  Ring hatlar: alightIdx koşulu yok

  return en düşük (walkToBoard + walkFromAlight) olan çift
```

### Ring Tespiti
GTFS'de direction_id=0 olan ama direction_id=1 olmayan hat → ring.  
427 hattan 3'ü ring.

---

## Grup B — Hızlı UX (Maddeler 3, 5, 8)

### Madde 3 — GPS Otomatik Başlangıç
- HomeScreen mount: `origin === null` → `Location.getCurrentPositionAsync()`
- En yakın durak → origin olarak set et
- Hata/izin reddi → sessizce geç (kullanıcı manuel girebilir)

### Madde 5 — LinesScreen'e Duraklar
- `SectionList` ile iki bölüm: HATLAR + DURAKLAR
- Arama: hat numarası ∪ hat adı ∪ durak adı
- Hat'a tıkla → LineDetail, Durağa tıkla → StopDetail

### Madde 8 — AI Özeti Düzeltme
- `generateTravelSummary` boş string döndüğünde fallback metin göster
- Network hatası → retry butonu (mevcut) yeterli
- `AiSummaryCard`: `summary === ''` durumu ele al

---

## Grup C — Firebase Feedback (Madde 6)

### Problem Analizi
`submitFeedback` kodu doğru (auth guard, Firestore write, points increment).  
Muhtemel sebepler:
1. Firestore security rules `feedbacks` collection'ına yazıyı engelliyor
2. Zustand'daki `user` geçerli ama Firebase Auth session expired
3. `loadRecent()` fire-and-forget — liste yenilenmeyebilir

### Düzeltmeler
- Firestore rules: authenticated user (dahil anonymous) → write izni
- `handleSubmit` sonunda `await loadRecent()`
- Hata loglaması: console.error ile gerçek hatayı yakala

---

## Grup D — Harita Seçici (Madde 4)

### Yaklaşım: WebView + Leaflet (react-native-webview zaten yüklü)

Yeni `MapPickerModal` bileşeni:
- WebView içinde inline HTML: OSM tiles + Leaflet.js (CDN bağlantısı)
- Kullanıcı tıklar → `window.ReactNativeWebView.postMessage(JSON.stringify({lat, lon}))`
- Native tarafta `onMessage` → koordinat + reverse geocode (en yakın durak adı)
- "Kaydet" → Location nesnesi üretilir

`AddFavoriteModal` güncellemesi:
- MOCK_SUGGESTIONS kaldırılır
- `MapPickerModal` entegre edilir
- Kayıtlı konum Firestore'a yazılır (`favoriteLocations` collection)

### FavoriteLocationCard
- Kayıtlı konuma basılınca destination otomatik set edilir

---

## Grup E — Güneş Analizi (Madde 7)

### Mevcut Sorun
`analyzeSunExposureAlongRoute`: tek ağırlıklı ortalama bearing — güneşin zaman içindeki hareketi yoksayılıyor.

### Yeni Algoritma

```
for each segment (waypoints[i] → waypoints[i+1]):
  segTime = departureTime + Σ(önceki segmentlerin tahmini süresi)
  midLat, midLon = segmentin ortası
  sunPos = SunCalc.getPosition(segTime, midLat, midLon)
  bearing = getBearing(waypoints[i], waypoints[i+1])
  {side, intensity} = getSunRelativeAngle(sunAzimuth, bearing)
  weight = segmentDistKm * max(0, sin(sunPos.altitude))  // güneş alçaksa etki az

rightPct = Σ(side=right ? intensity*weight : 0) / Σ(weight)
leftPct  = 1 - rightPct
```

Güneş ufkun altındaysa (gece/şafak) → `altitude ≤ 0` → weight=0 → etki yok.

---

## Değişmeyen Dosyalar (Android Build Güvenliği)
- `android/` dizini: dokunulmaz
- `app.json`, `babel.config.js`: dokunulmaz
- Yeni native dependency: yok
- `package.json`: yalnızca `scripts.build:gtfs` eklenir

---

## Uygulama Sırası
1. Build script yaz + çalıştır (`scripts/build-gtfs.mjs`)
2. `gtfsData.ts` yeni fonksiyonlar
3. `routingService.ts` güncelle
4. Paralel: GPS origin, LinesScreen stops, AI fix, Feedback fix, Sun analysis, Map picker
