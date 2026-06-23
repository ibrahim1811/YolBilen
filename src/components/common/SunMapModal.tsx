import React from 'react';
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
  }
  #compass svg { width: 140px; height: 140px; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.25)); }
  #dot {
    position: fixed;
    top: 50%;
    left: 50%;
    width: 10px;
    height: 10px;
    background: #1A73E8;
    border: 2px solid white;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    z-index: 1002;
    pointer-events: none;
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
  }
</style>
</head>
<body>
<div id="map"></div>
<div id="compass">
  <svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="bg" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="rgba(255,255,255,0.97)"/>
        <stop offset="100%" stop-color="rgba(240,240,240,0.92)"/>
      </radialGradient>
      <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#FFF9C4"/>
        <stop offset="100%" stop-color="#FFC107" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <!-- Arkaplan çember -->
    <circle cx="70" cy="70" r="66" fill="url(#bg)" stroke="#E0E0E0" stroke-width="1.5"/>
    <!-- Derece çizgileri (her 30°) -->
    <g stroke="#BDBDBD" stroke-width="1">
      <line x1="70" y1="10" x2="70" y2="18"/>
      <line x1="70" y1="122" x2="70" y2="130"/>
      <line x1="10" y1="70" x2="18" y2="70"/>
      <line x1="122" y1="70" x2="130" y2="70"/>
      <line x1="27" y1="27" x2="32.6" y2="32.6"/>
      <line x1="107.4" y1="107.4" x2="113" y2="113"/>
      <line x1="113" y1="27" x2="107.4" y2="32.6"/>
      <line x1="27" y1="113" x2="32.6" y2="107.4"/>
    </g>
    <!-- Yön etiketleri -->
    <text x="70" y="9" text-anchor="middle" font-size="11" font-weight="700" fill="#424242" font-family="sans-serif">K</text>
    <text x="70" y="136" text-anchor="middle" font-size="11" font-weight="700" fill="#424242" font-family="sans-serif">G</text>
    <text x="135" y="74" text-anchor="middle" font-size="11" font-weight="700" fill="#424242" font-family="sans-serif">D</text>
    <text x="5" y="74" text-anchor="middle" font-size="11" font-weight="700" fill="#424242" font-family="sans-serif">B</text>
    <!-- Dönen ok grubu — sivri uç güneşin yönünü gösterir -->
    <g transform="rotate(${azimuth}, 70, 70)">
      <!-- Kuyruk (küt, gri) -->
      <polygon points="70,100 64,75 76,75" fill="#9E9E9E" opacity="0.8"/>
      <!-- Gövde -->
      <rect x="68" y="45" width="4" height="30" rx="2" fill="#9E9E9E" opacity="0.6"/>
      <!-- Baş (sivri, güneş rengi) -->
      <polygon points="70,22 62,50 78,50" fill="#FFA726"/>
      <!-- Güneş parlaması -->
      <circle cx="70" cy="26" r="14" fill="url(#sunGlow)" opacity="0.7"/>
      <!-- Güneş çekirdeği -->
      <circle cx="70" cy="22" r="8" fill="#FFC107"/>
      <circle cx="70" cy="22" r="5" fill="#FF8F00"/>
      <!-- Işın çizgileri -->
      <line x1="70" y1="9"  x2="70" y2="13"  stroke="#FFC107" stroke-width="2" stroke-linecap="round"/>
      <line x1="79" y1="13" x2="77" y2="15"  stroke="#FFC107" stroke-width="2" stroke-linecap="round"/>
      <line x1="61" y1="13" x2="63" y2="15"  stroke="#FFC107" stroke-width="2" stroke-linecap="round"/>
      <line x1="82" y1="22" x2="79" y2="22"  stroke="#FFC107" stroke-width="2" stroke-linecap="round"/>
      <line x1="58" y1="22" x2="61" y2="22"  stroke="#FFC107" stroke-width="2" stroke-linecap="round"/>
    </g>
    <!-- Merkez nokta -->
    <circle cx="70" cy="70" r="5" fill="#37474F"/>
    <circle cx="70" cy="70" r="3" fill="#ECEFF1"/>
  </svg>
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
  const [webviewReady, setWebviewReady] = React.useState(false);
  const below = altitude <= 0;

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.onSurface }]}>☀️ Güneşi Gör</Text>
          <IconButton icon="close" size={20} onPress={onDismiss} />
        </View>

        <View style={styles.mapWrap}>
          {!webviewReady && (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          )}
          <WebView
            style={styles.map}
            source={{ html: buildHtml(lat, lng, azimuth) }}
            onLoad={() => setWebviewReady(true)}
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
