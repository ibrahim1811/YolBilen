import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Appbar, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, RouteStep } from '../types';
import { getLineStopsIndex } from '../data/gtfsData';

type Props = NativeStackScreenProps<RootStackParamList, 'RouteMap'>;

const IZMIR_CENTER = [38.4192, 27.1287];

function buildMapHtml(params: {
  stops: { id: string; name: string; lat: number; lon: number }[];
  polyline: [number, number][];
  boarding: { latitude: number; longitude: number; name: string } | null;
  alighting: { latitude: number; longitude: number; name: string } | null;
  center: [number, number];
  steps?: RouteStep[];
}): string {
  const { stops, polyline, boarding, alighting, center, steps } = params;

  const markersJs = stops
    .map(
      s =>
        `L.circleMarker([${s.lat},${s.lon}],{radius:5,color:'#FF9800',fillColor:'#FF9800',fillOpacity:0.9,weight:2}).bindPopup(${JSON.stringify(s.name)}).addTo(map);`
    )
    .join('\n');

  const transitStep = steps?.find(s => s.type === 'transit');

  // Intermediate stops — small blue dots
  const intermediateJs = (transitStep?.intermediateStops ?? [])
    .map(s => `L.circleMarker([${s.latitude},${s.longitude}],{radius:4,color:'#1A73E8',fillColor:'#1A73E8',fillOpacity:0.7,weight:1}).bindPopup(${JSON.stringify(s.name)}).addTo(map);`)
    .join('\n');

  // Walking segments — dashed gray lines
  let walkLinesJs = '';
  if (transitStep?.boardStop && transitStep?.alightStop && boarding && alighting) {
    const b = transitStep.boardStop;
    const a = transitStep.alightStop;
    walkLinesJs =
      `L.polyline([[${boarding.latitude},${boarding.longitude}],[${b.latitude},${b.longitude}]],{color:'#888',weight:2,dashArray:'5,8'}).addTo(map);\n` +
      `L.polyline([[${a.latitude},${a.longitude}],[${alighting.latitude},${alighting.longitude}]],{color:'#888',weight:2,dashArray:'5,8'}).addTo(map);`;
  }

  // Transit polyline through intermediate stops when available
  let polylineJs: string;
  if (transitStep?.boardStop && transitStep?.alightStop) {
    const pts: [number, number][] = [
      [transitStep.boardStop.latitude, transitStep.boardStop.longitude],
      ...(transitStep.intermediateStops ?? []).map(s => [s.latitude, s.longitude] as [number, number]),
      [transitStep.alightStop.latitude, transitStep.alightStop.longitude],
    ];
    polylineJs = `L.polyline(${JSON.stringify(pts)},{color:'#1A73E8',weight:3}).addTo(map);`;
  } else if (polyline.length > 1) {
    polylineJs = `L.polyline(${JSON.stringify(polyline)},{color:'#1A73E8',weight:3}).addTo(map);`;
  } else if (boarding && alighting) {
    polylineJs = `L.polyline([[${boarding.latitude},${boarding.longitude}],[${alighting.latitude},${alighting.longitude}]],{color:'#1A73E8',weight:3,dashArray:'8,4'}).addTo(map);`;
  } else {
    polylineJs = '';
  }

  const boardingJs = boarding
    ? `L.marker([${boarding.latitude},${boarding.longitude}],{icon:greenIcon}).bindPopup(${JSON.stringify('Biniş: ' + boarding.name)}).addTo(map).openPopup();`
    : '';

  const alightingJs = alighting
    ? `L.marker([${alighting.latitude},${alighting.longitude}],{icon:redIcon}).bindPopup(${JSON.stringify('İniş: ' + alighting.name)}).addTo(map);`
    : '';

  const allPts: [number, number][] = [
    ...(polyline.length > 1 ? polyline : []),
    ...(boarding ? [[boarding.latitude, boarding.longitude] as [number, number]] : []),
    ...(alighting ? [[alighting.latitude, alighting.longitude] as [number, number]] : []),
  ];
  const boundsJs =
    allPts.length > 1
      ? `map.fitBounds(${JSON.stringify(allPts)},{padding:[40,40]});`
      : `map.setView([${center[0]},${center[1]}],13);`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  html,body,#map{margin:0;padding:0;height:100%;width:100%;}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map=L.map('map',{zoomControl:true});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  attribution:'&copy; OpenStreetMap',maxZoom:19
}).addTo(map);

var greenIcon=L.icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',shadowUrl:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',iconSize:[25,41],iconAnchor:[12,41],popupAnchor:[1,-34]});
var redIcon=L.icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',shadowUrl:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',iconSize:[25,41],iconAnchor:[12,41],popupAnchor:[1,-34]});

${markersJs}
${intermediateJs}
${walkLinesJs}
${polylineJs}
${boardingJs}
${alightingJs}
${boundsJs}
</script>
</body>
</html>`;
}

export function RouteMapScreen({ navigation, route: navRoute }: Props) {
  const theme = useTheme();
  const { route } = navRoute.params;
  const boarding = route.boardingStop ?? null;
  const alighting = route.alightingStop ?? null;

  const lineStops = React.useMemo(() => {
    const idx = getLineStopsIndex();
    return (idx.get(route.lineNumber) ?? []).slice(0, 80);
  }, [route.lineNumber]);

  const polyline: [number, number][] = lineStops.map(s => [s.lat, s.lon]);

  const center: [number, number] =
    lineStops.length > 0
      ? [lineStops[Math.floor(lineStops.length / 2)].lat, lineStops[Math.floor(lineStops.length / 2)].lon]
      : boarding
      ? [boarding.latitude, boarding.longitude]
      : IZMIR_CENTER as [number, number];

  const html = React.useMemo(
    () =>
      buildMapHtml({
        stops: lineStops.map(s => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon })),
        polyline,
        boarding: boarding ? { latitude: boarding.latitude, longitude: boarding.longitude, name: boarding.name } : null,
        alighting: alighting ? { latitude: alighting.latitude, longitude: alighting.longitude, name: alighting.name } : null,
        center,
        steps: route.steps,
      }),
    [lineStops, boarding, alighting, route.steps]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <Appbar.Header elevated>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={`${route.lineNumber} Hattı`} subtitle={route.lineName} />
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
          {lineStops.length > 0 ? `${lineStops.length} durak` : 'Hat güzergahı'} · Tahmini {route.estimatedDuration} dk
        </Text>
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
