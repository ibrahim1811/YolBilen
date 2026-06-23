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

function crowdLabel(crowd: Feedback['crowd']): string {
  return crowd === 'seated' ? 'Boş' : crowd === 'standing' ? 'Kalabalık' : 'Çok Doluydu';
}

function buildHtml(feedbacks: Feedback[]): string {
  const markers = feedbacks
    .filter(f => f.latitude !== undefined && f.longitude !== undefined)
    .map(f =>
      `L.circleMarker([${f.latitude},${f.longitude}],` +
      `{radius:12,color:'${crowdColor(f.crowd)}',fillColor:'${crowdColor(f.crowd)}',fillOpacity:0.6,weight:2})` +
      `.bindPopup('${f.lineNumber} · ${crowdLabel(f.crowd)}').addTo(map);`
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
    getRecentFeedbacks(50)
      .then(f => { setFeedbacks(f); setLoading(false); })
      .catch(() => setLoading(false));
  }, [visible]);

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={[styles.container, { backgroundColor: theme.colors.surface }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.onSurface }]}>🗺️ Yoğunluk Haritası</Text>
          <IconButton icon="close" size={20} onPress={onDismiss} />
        </View>
        <View style={styles.legend}>
          {[['#34A853', 'Boş'], ['#FBBC04', 'Kalabalık'], ['#EA4335', 'Çok Doluydu']].map(([c, l]) => (
            <View key={l} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: c }]} />
              <Text style={{ fontSize: 12, color: theme.colors.onSurfaceVariant }}>{l}</Text>
            </View>
          ))}
        </View>
        <View style={styles.mapWrap}>
          {loading
            ? <ActivityIndicator style={{ flex: 1 }} />
            : <WebView source={{ html: buildHtml(feedbacks) }} javaScriptEnabled style={{ flex: 1 }} />
          }
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  container: { margin: 12, borderRadius: 16, overflow: 'hidden', maxHeight: '90%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 4 },
  title: { fontSize: 16, fontWeight: '700' },
  legend: { flexDirection: 'row', gap: 16, paddingHorizontal: 16, paddingBottom: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  mapWrap: { height: 420 },
});
