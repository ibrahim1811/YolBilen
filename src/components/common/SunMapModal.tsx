import React, { useRef } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Portal, Modal, Text, IconButton, useTheme } from 'react-native-paper';
import { WebView } from 'react-native-webview';

interface Props {
  visible: boolean;
  lat: number;
  lng: number;
  azimuth: number;   // derece, 0=Kuzey, 90=Doğu
  altitude: number;  // derece, negatif=ufkun altı
  onDismiss: () => void;
}

function cardinalLabel(az: number): string {
  const dirs = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'];
  return dirs[Math.round(az / 45) % 8];
}

const buildHtml = (lat: number, lng: number, azimuth: number) => `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html,body,#map { height:100%; width:100%; margin:0; padding:0; }
  #compass {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  #arrow-wrap {
    width: 80px;
    height: 80px;
    transform: rotate(${azimuth}deg);
    transition: transform 0.4s ease;
  }
  svg { width: 80px; height: 80px; }
  #dot {
    position: fixed;
    top: 50%;
    left: 50%;
    width: 12px;
    height: 12px;
    background: #1A73E8;
    border: 2px solid white;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    z-index: 1001;
    pointer-events: none;
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
  }
</style>
</head>
<body>
<div id="map"></div>
<div id="compass">
  <div id="arrow-wrap">
    <svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow">
          <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.4"/>
        </filter>
      </defs>
      <circle cx="40" cy="40" r="36" fill="rgba(255,255,255,0.85)" filter="url(#shadow)"/>
      <!-- ok yukarı = kuzey -->
      <polygon points="40,8 33,36 40,30 47,36" fill="#F4511E"/>
      <polygon points="40,72 33,44 40,50 47,44" fill="#9E9E9E"/>
      <!-- güneş simgesi -->
      <circle cx="40" cy="14" r="5" fill="#FFC107"/>
      <line x1="40" y1="4" x2="40" y2="8" stroke="#FFC107" stroke-width="2"/>
      <line x1="50" y1="7" x2="47" y2="10" stroke="#FFC107" stroke-width="2"/>
      <line x1="54" y1="14" x2="50" y2="14" stroke="#FFC107" stroke-width="2"/>
      <line x1="50" y1="21" x2="47" y2="18" stroke="#FFC107" stroke-width="2"/>
      <line x1="30" y1="7" x2="33" y2="10" stroke="#FFC107" stroke-width="2"/>
      <line x1="26" y1="14" x2="30" y2="14" stroke="#FFC107" stroke-width="2"/>
      <line x1="30" y1="21" x2="33" y2="18" stroke="#FFC107" stroke-width="2"/>
    </svg>
  </div>
</div>
<div id="dot"></div>
<script>
  var map = L.map('map', { zoomControl: true }).setView([${lat}, ${lng}], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(map);
</script>
</body>
</html>`;

export function SunMapModal({ visible, lat, lng, azimuth, altitude, onDismiss }: Props) {
  const theme = useTheme();
  const webviewReady = useRef(false);
  const below = altitude <= 0;

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.onSurface }]}>☀️ Güneşi Gör</Text>
          <IconButton icon="close" size={20} onPress={onDismiss} />
        </View>

        <View style={styles.mapWrap}>
          {!webviewReady.current && (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          )}
          <WebView
            style={styles.map}
            source={{ html: buildHtml(lat, lng, azimuth) }}
            onLoad={() => { webviewReady.current = true; }}
            javaScriptEnabled
            scrollEnabled={false}
          />
        </View>

        <View style={[styles.infoBar, { backgroundColor: theme.colors.surfaceVariant }]}>
          {below ? (
            <Text style={[styles.infoText, { color: theme.colors.onSurfaceVariant }]}>
              🌙 Güneş şu an ufkun altında
            </Text>
          ) : (
            <>
              <Text style={[styles.infoChip, { color: theme.colors.onSurface }]}>
                {cardinalLabel(azimuth)} · {Math.round(azimuth)}°
              </Text>
              <Text style={[styles.infoDivider, { color: theme.colors.outline }]}>|</Text>
              <Text style={[styles.infoChip, { color: theme.colors.onSurface }]}>
                Yükseklik: {Math.round(altitude)}°
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
  mapWrap: { height: 420, position: 'relative' },
  loader: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  map: { flex: 1 },
  infoBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 12 },
  infoText: { fontSize: 14 },
  infoChip: { fontSize: 14, fontWeight: '600' },
  infoDivider: { fontSize: 14 },
});
