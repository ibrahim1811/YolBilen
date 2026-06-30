import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Portal, Modal, Text, IconButton, useTheme } from 'react-native-paper';
import { WebView } from 'react-native-webview';
import SunCalc from 'suncalc';
import type { IzmirStop } from '../../data/gtfsData';

interface Props {
  visible: boolean;
  lineNumber: string;
  stops: IzmirStop[];
  onDismiss: () => void;
}

function cardinalLabel(az: number): string {
  const dirs = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'];
  return dirs[Math.round(az / 45) % 8];
}

function buildHtml(stops: IzmirStop[], azimuth: number): string {
  const center = stops[Math.floor(stops.length / 2)];
  const latlng = `[${center.lat}, ${center.lon}]`;
  const polylinePoints = JSON.stringify(stops.map(s => [s.lat, s.lon]));
  const firstMarker = `[${stops[0].lat}, ${stops[0].lon}]`;
  const lastMarker = `[${stops[stops.length - 1].lat}, ${stops[stops.length - 1].lon}]`;
  const firstName = JSON.stringify(stops[0].name);
  const lastName = JSON.stringify(stops[stops.length - 1].name);

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html,body,#map { height:100%; width:100%; margin:0; padding:0; }
  #compass {
    position: fixed; bottom: 16px; right: 16px;
    pointer-events: none; z-index: 1000;
  }
  #compass svg { width: 100px; height: 100px; filter: drop-shadow(0 3px 8px rgba(0,0,0,0.3)); }
</style>
</head>
<body>
<div id="map"></div>
<div id="compass">
  <svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg">
    <circle cx="70" cy="70" r="66" fill="rgba(255,255,255,0.93)" stroke="#E0E0E0" stroke-width="1.5"/>
    <text x="70" y="14" text-anchor="middle" font-size="12" font-weight="700" fill="#424242" font-family="sans-serif">K</text>
    <text x="70" y="134" text-anchor="middle" font-size="12" font-weight="700" fill="#424242" font-family="sans-serif">G</text>
    <text x="133" y="74" text-anchor="middle" font-size="12" font-weight="700" fill="#424242" font-family="sans-serif">D</text>
    <text x="7" y="74" text-anchor="middle" font-size="12" font-weight="700" fill="#424242" font-family="sans-serif">B</text>
    <g transform="rotate(${azimuth}, 70, 70)">
      <polygon points="70,100 64,78 76,78" fill="#9E9E9E" opacity="0.7"/>
      <polygon points="70,22 62,50 78,50" fill="#FFA726"/>
      <circle cx="70" cy="22" r="8" fill="#FFC107"/>
      <circle cx="70" cy="22" r="5" fill="#FF8F00"/>
    </g>
    <circle cx="70" cy="70" r="4" fill="#37474F"/>
  </svg>
</div>
<script>
  var map = L.map('map', {zoomControl:true}).setView(${latlng}, 13);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{attribution:'&copy; OpenStreetMap &copy; CARTO',maxZoom:19}).addTo(map);
  var pts = ${polylinePoints};
  L.polyline(pts, {color:'#1A73E8', weight:4, opacity:0.85}).addTo(map);
  var greenIcon = L.divIcon({className:'',html:'<div style="width:12px;height:12px;background:#34A853;border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',iconSize:[12,12],iconAnchor:[6,6]});
  var redIcon = L.divIcon({className:'',html:'<div style="width:12px;height:12px;background:#D93025;border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',iconSize:[12,12],iconAnchor:[6,6]});
  L.marker(${firstMarker}, {icon:greenIcon}).bindPopup(${firstName}).addTo(map);
  L.marker(${lastMarker}, {icon:redIcon}).bindPopup(${lastName}).addTo(map);
  map.fitBounds(pts, {padding:[20,20]});
</script>
</body>
</html>`;
}

export function LineRouteMapModal({ visible, lineNumber, stops, onDismiss }: Props) {
  const theme = useTheme();
  const [ready, setReady] = React.useState(false);

  if (stops.length < 2) return null;

  const center = stops[Math.floor(stops.length / 2)];
  const sp = SunCalc.getPosition(new Date(), center.lat, center.lon);
  const azimuth = ((sp.azimuth * 180) / Math.PI + 180 + 360) % 360;
  const altitude = (sp.altitude * 180) / Math.PI;
  const below = altitude <= 0;

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.onSurface }]}>
            🗺️ Hat {lineNumber} Rotası
          </Text>
          <IconButton icon="close" size={20} onPress={onDismiss} />
        </View>

        <View style={styles.mapWrap}>
          {!ready && (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          )}
          <WebView
            style={styles.map}
            source={{ html: buildHtml(stops, azimuth) }}
            onLoad={() => setReady(true)}
            javaScriptEnabled
            scrollEnabled={false}
          />
        </View>

        <View style={[styles.infoBar, { backgroundColor: theme.colors.surfaceVariant }]}>
          {below ? (
            <Text style={[styles.chip, { color: theme.colors.onSurfaceVariant }]}>🌙 Güneş battı</Text>
          ) : (
            <>
              <Text style={[styles.chip, { color: theme.colors.onSurface }]}>
                ☀️ {cardinalLabel(azimuth)} · {Math.round(azimuth)}°
              </Text>
              <Text style={[styles.divider, { color: theme.colors.outline }]}>|</Text>
              <Text style={[styles.chip, { color: theme.colors.onSurface }]}>
                Yükseklik: {Math.round(altitude)}°
              </Text>
              <Text style={[styles.divider, { color: theme.colors.outline }]}>|</Text>
              <Text style={[styles.chip, { color: theme.colors.onSurface }]}>
                {stops.length} durak
              </Text>
            </>
          )}
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  container: { margin: 12, borderRadius: 16, overflow: 'hidden', backgroundColor: 'white', maxHeight: '92%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 4, paddingVertical: 4 },
  title: { fontSize: 16, fontWeight: '700' },
  mapWrap: { height: 400, position: 'relative' },
  loader: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  map: { flex: 1 },
  infoBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 12, flexWrap: 'wrap' },
  chip: { fontSize: 13, fontWeight: '600' },
  divider: { fontSize: 13 },
});
