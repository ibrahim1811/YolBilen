import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Appbar, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import type { RootStackParamList, RouteStep } from '../types';
import { getLineBusPositions, type BusPosition } from '../services/iztek/iztekService';
import { analyzeSunExposureAlongRoute } from '../services/sun/sunAnalysis';
import type { SunAnalysis } from '../types';
import { getLineColor, getLineMode, lineTitle } from '../data/gtfsData';

type Props = NativeStackScreenProps<RootStackParamList, 'RouteMap'>;

const IZMIR_CENTER = [38.4192, 27.1287];

export function buildMapHtml(params: {
  boarding: { latitude: number; longitude: number; name: string } | null;
  alighting: { latitude: number; longitude: number; name: string } | null;
  center: [number, number];
  steps?: RouteStep[];
  busPositions?: BusPosition[];
  sunAnalysis?: SunAnalysis | null;
}): string {
  const { boarding, alighting, center, steps, busPositions = [], sunAnalysis } = params;
  const transitSteps = steps?.filter(s => s.type === 'transit') ?? [];
  const transitStep = transitSteps[0] ?? null;
  const midStops = transitStep?.intermediateStops ?? [];
  const boardStop = transitStep?.boardStop ?? null;
  const alightStop = transitStep?.alightStop ?? null;

  // Ara duraklar — turuncu küçük çember
  const intermediateJs = midStops
    .map(s =>
      `L.circleMarker([${s.latitude},${s.longitude}],` +
      `{radius:6,color:'#FF6D00',fillColor:'#FF6D00',fillOpacity:0.9,weight:2})` +
      `.bindPopup(${JSON.stringify(s.name)}).addTo(map);`
    ).join('\n');

  // Yürüyüş segmentleri — gri kesikli
  let walkLinesJs = '';
  const lastAlightStop = transitSteps[transitSteps.length - 1]?.alightStop ?? null;
  if (boardStop && lastAlightStop && boarding && alighting) {
    walkLinesJs =
      `L.polyline([[${boarding.latitude},${boarding.longitude}],[${boardStop.latitude},${boardStop.longitude}]],` +
      `{color:'#757575',weight:3,dashArray:'6,8',opacity:0.7}).addTo(map);\n` +
      `L.polyline([[${lastAlightStop.latitude},${lastAlightStop.longitude}],[${alighting.latitude},${alighting.longitude}]],` +
      `{color:'#757575',weight:3,dashArray:'6,8',opacity:0.7}).addTo(map);`;
  }

  // Otobüs güzergahı — durak koordinatlarından doğrudan çizilen polyline
  // (önceden OSRM demo sunucusuna bağımlıydı; o sunucu üretim için değil,
  // sık zaman aşımına uğrayıp kesikli çizgiye düşüyordu)
  const transitCoords: [number, number][] = boardStop && alightStop
    ? [
        [boardStop.latitude, boardStop.longitude],
        ...midStops.map(s => [s.latitude, s.longitude] as [number, number]),
        [alightStop.latitude, alightStop.longitude],
      ]
    : boarding && alighting
      ? [[boarding.latitude, boarding.longitude], [alighting.latitude, alighting.longitude]]
      : [];

  const routePolylineJs = transitCoords.length >= 2
    ? `L.polyline(${JSON.stringify(transitCoords)},{color:'${getLineColor(transitStep?.lineNumber ?? '') ?? '#1A73E8'}',weight:5,opacity:0.9,lineJoin:'round'}).addTo(map);`
    : '';

  // Aktarmalı rotada sonraki bacaklar — her biri hattın kendi renginde (yoksa pembe/mor sırayla)
  const LEG_FALLBACK_COLORS = ['#E91E63', '#9C27B0', '#00897B'];
  const extraLegCoords: [number, number][] = [];
  const route2PolylineJs = transitSteps.slice(1).map((t, i) => {
    if (!t.boardStop || !t.alightStop) return '';
    const color = getLineColor(t.lineNumber ?? '') ?? LEG_FALLBACK_COLORS[i % LEG_FALLBACK_COLORS.length];
    const coords: [number, number][] = [
      [t.boardStop.latitude, t.boardStop.longitude],
      ...(t.intermediateStops ?? []).map(s => [s.latitude, s.longitude] as [number, number]),
      [t.alightStop.latitude, t.alightStop.longitude],
    ];
    extraLegCoords.push(...coords);
    const prevAlight = transitSteps[i].alightStop;
    const transferWalk = prevAlight
      ? `L.polyline([[${prevAlight.latitude},${prevAlight.longitude}],[${t.boardStop.latitude},${t.boardStop.longitude}]],{color:'#757575',weight:3,dashArray:'6,8',opacity:0.7}).addTo(map);`
      : '';
    return `${transferWalk}L.polyline(${JSON.stringify(coords)},{color:'${color}',weight:5,opacity:0.9,lineJoin:'round'}).addTo(map);` +
      `L.circleMarker([${t.boardStop.latitude},${t.boardStop.longitude}],{radius:9,color:'#FB8C00',fillColor:'#FB8C00',fillOpacity:1,weight:3}).bindPopup(${JSON.stringify('🔁 Aktarma: ' + t.boardStop.name + ' · ' + lineTitle(t.lineNumber ?? ''))}).addTo(map);`;
  }).join('\n');
  const intermediate2Js = transitSteps.slice(1).flatMap((t, i) => {
    const color = getLineColor(t.lineNumber ?? '') ?? LEG_FALLBACK_COLORS[i % LEG_FALLBACK_COLORS.length];
    return (t.intermediateStops ?? []).map(s =>
      `L.circleMarker([${s.latitude},${s.longitude}],` +
      `{radius:5,color:'${color}',fillColor:'${color}',fillOpacity:0.7,weight:2})` +
      `.bindPopup(${JSON.stringify(s.name)}).addTo(map);`);
  }).join('\n');
  const finalAlight = transitSteps[transitSteps.length - 1]?.alightStop ?? alightStop;

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

  // GTFS biniş durağı — yeşil çember
  const boardStopJs = boardStop
    ? `L.circleMarker([${boardStop.latitude},${boardStop.longitude}],` +
      `{radius:10,color:'#34A853',fillColor:'#34A853',fillOpacity:1,weight:3})` +
      `.bindPopup(${JSON.stringify('🟢 Biniş Durağı: ' + boardStop.name)}).addTo(map);`
    : '';

  // GTFS iniş durağı — kırmızı çember
  const alightStopJs = finalAlight
    ? `L.circleMarker([${finalAlight.latitude},${finalAlight.longitude}],` +
      `{radius:10,color:'#EA4335',fillColor:'#EA4335',fillOpacity:1,weight:3})` +
      `.bindPopup(${JSON.stringify('🔴 İniş Durağı: ' + finalAlight.name)}).addTo(map);`
    : '';

  // Kullanıcı GPS biniş noktası — mavi pin
  const userBoardJs = boarding
    ? `L.marker([${boarding.latitude},${boarding.longitude}],{icon:userIcon})` +
      `.bindPopup(${JSON.stringify('📍 ' + boarding.name)}).addTo(map).openPopup();`
    : '';

  // Kullanıcı GPS iniş noktası — mor pin
  const userAlightJs = alighting
    ? `L.marker([${alighting.latitude},${alighting.longitude}],{icon:destIcon})` +
      `.bindPopup(${JSON.stringify('🏁 ' + alighting.name)}).addTo(map);`
    : '';

  const allPts: [number, number][] = [
    ...(boarding ? [[boarding.latitude, boarding.longitude] as [number, number]] : []),
    ...(alighting ? [[alighting.latitude, alighting.longitude] as [number, number]] : []),
    ...transitCoords,
    ...extraLegCoords,
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
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{attribution:'&copy; OpenStreetMap &copy; CARTO',maxZoom:19}).addTo(map);
${sunAnalysis ? `
var sunCtrl=L.control({position:'topright'});
sunCtrl.onAdd=function(){
  var d=L.DomUtil.create('div');
  d.style='background:rgba(255,255,255,0.92);padding:8px 12px;border-radius:10px;font-size:13px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,0.2);line-height:1.5;';
  d.innerHTML='☀️ Güneş: <b>${sunAnalysis.recommendedSide === 'left' ? 'SAĞ tarafta' : 'SOL tarafta'}</b><br><span style="font-weight:400;font-size:11px;">${sunAnalysis.recommendedSide === 'left' ? '← Sol tarafa oturun' : '→ Sağ tarafa oturun'}</span>';
  return d;
};
sunCtrl.addTo(map);` : ''}

var userIcon=L.divIcon({html:'<div style="background:#1A73E8;border:3px solid white;border-radius:50%;width:18px;height:18px;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>',iconSize:[18,18],iconAnchor:[9,9],className:''});
var destIcon=L.divIcon({html:'<div style="background:#9C27B0;border:3px solid white;border-radius:50%;width:18px;height:18px;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>',iconSize:[18,18],iconAnchor:[9,9],className:''});

${intermediateJs}
${intermediate2Js}
${walkLinesJs}
${boardStopJs}
${alightStopJs}
${busMarkersJs}
${userBoardJs}
${userAlightJs}
${boundsJs}
${routePolylineJs}
${route2PolylineJs}
</script>
</body>
</html>`;
}

export function RouteMapScreen({ navigation, route: navRoute }: Props) {
  const theme = useTheme();
  const { route } = navRoute.params;
  const boarding = route.boardingStop ?? null;
  const alighting = route.alightingStop ?? null;
  const isFocused = useIsFocused();
  const [busPositions, setBusPositions] = React.useState<BusPosition[]>([]);
  const [liveSunAnalysis, setLiveSunAnalysis] = React.useState<SunAnalysis | null>(null);

  const routeTransitSteps = route.steps?.filter(s => s.type === 'transit') ?? [];
  const routeTransitStep = routeTransitSteps[0] ?? null;
  const baseWaypoints: Array<{ latitude: number; longitude: number }> = routeTransitStep?.boardStop
    ? [routeTransitStep.boardStop, ...(routeTransitStep.intermediateStops ?? []), routeTransitStep.alightStop!]
    : [];

  React.useEffect(() => {
    let cancelled = false;
    async function fetchBuses() {
      let positions: BusPosition[];
      try {
        positions = await getLineBusPositions(route.lineNumber);
      } catch (e) {
        console.warn('[RouteMap] otobüs konumları alınamadı:', e);
        return;
      }
      if (cancelled) return;
      setBusPositions(positions);

      // Biniş durağına en yakın otobüsü bul → yönünü kullan
      if (baseWaypoints.length >= 2 && positions.length > 0) {
        const board = baseWaypoints[0];
        function d(b: BusPosition) {
          const dLat = b.lat - board.latitude;
          const dLon = b.lon - board.longitude;
          return dLat * dLat + dLon * dLon;
        }
        const nearest = positions.reduce((a, b) => d(a) < d(b) ? a : b);
        // Yon=1 → dönüş yönü → güzergahı ters çevir
        const waypoints = nearest.yon === 1 ? [...baseWaypoints].reverse() : baseWaypoints;
        setLiveSunAnalysis(analyzeSunExposureAlongRoute(waypoints, new Date()));
      }
    }
    // Canlı araç konumu yalnızca ESHOT otobüsleri için var
    if (!isFocused || getLineMode(route.lineNumber) !== 'bus' || route.isWalkOnly) return () => { cancelled = true; };
    fetchBuses();
    const interval = setInterval(fetchBuses, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [route.lineNumber, isFocused]);

  const transitStep = routeTransitStep;
  const center: [number, number] = transitStep?.boardStop
    ? [transitStep.boardStop.latitude, transitStep.boardStop.longitude]
    : boarding
    ? [boarding.latitude, boarding.longitude]
    : IZMIR_CENTER as [number, number];

  const html = React.useMemo(
    () =>
      buildMapHtml({
        boarding: boarding ? { latitude: boarding.latitude, longitude: boarding.longitude, name: boarding.name } : null,
        alighting: alighting ? { latitude: alighting.latitude, longitude: alighting.longitude, name: alighting.name } : null,
        center,
        steps: route.steps,
        busPositions,
        sunAnalysis: liveSunAnalysis ?? route.sunAnalysis,
      }),
    [boarding, alighting, center, route.steps, busPositions, liveSunAnalysis, route.sunAnalysis]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <Appbar.Header elevated>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={route.transfers.length > 0 ? 'Rota Haritası' : lineTitle(route.lineNumber)} subtitle={route.lineName} />
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
        <View style={styles.legendRow}>
          <View style={[styles.dot, { backgroundColor: '#34A853' }]} />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurface }}>
            {boarding?.name ?? 'Biniş'}
          </Text>
          <View style={[styles.dot, { backgroundColor: '#D93025', marginLeft: 12 }]} />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurface }}>
            {alighting?.name ?? 'İniş'}
          </Text>
        </View>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
          {transitStep?.intermediateStops ? `${transitStep.intermediateStops.length + 2} durak` : 'Hat güzergahı'} · Tahmini {route.estimatedDuration} dk
        </Text>
        {routeTransitSteps.length > 1 && (
          <Text variant="bodySmall" style={{ color: '#E91E63', marginTop: 2 }}>
            Aktarmalı rota — ikinci hat pembe ile gösterilir
          </Text>
        )}
        {(liveSunAnalysis ?? route.sunAnalysis) && (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
            {(liveSunAnalysis ?? route.sunAnalysis)!.recommendedSide === 'left'
              ? '☀️ Sağ taraf güneşli — sol tarafta otur'
              : '☀️ Sol taraf güneşli — sağ tarafta otur'}
            {liveSunAnalysis ? ' (canlı)' : ''}
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  legend: { padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.08)' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
