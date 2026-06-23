import React, { useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Portal, Modal, Button, Text, useTheme, TextInput } from 'react-native-paper';
import { WebView } from 'react-native-webview';

interface Props {
  visible: boolean;
  initialLat?: number;
  initialLon?: number;
  onSelect: (lat: number, lng: number) => void;
  onDismiss: () => void;
}

const MAP_HTML = (lat: number, lon: number) => `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{height:100%;width:100%;margin:0;padding:0;}</style>
</head>
<body>
<div id="map"></div>
<script>
var map = L.map('map').setView([${lat},${lon}],14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  attribution:'© OpenStreetMap'
}).addTo(map);
var marker=null;
map.on('click',function(e){
  if(marker)marker.remove();
  marker=L.marker([e.latlng.lat,e.latlng.lng]).addTo(map);
  window.ReactNativeWebView.postMessage(JSON.stringify({lat:e.latlng.lat,lng:e.latlng.lng}));
});
</script>
</body>
</html>`;

export function MapPickerModal({ visible, initialLat = 38.4189, initialLon = 27.1287, onSelect, onDismiss }: Props) {
  const theme = useTheme();
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null);
  const [webviewReady, setWebviewReady] = useState(false);
  const [placeName, setPlaceName] = useState('');

  function handleMessage(event: { nativeEvent: { data: string } }) {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (typeof data.lat === 'number' && typeof data.lng === 'number') {
        setPicked(data);
      }
    } catch {}
  }

  function handleConfirm() {
    if (!picked) return;
    onSelect(picked.lat, picked.lng);
    setPicked(null);
    setPlaceName('');
    onDismiss();
  }

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.container}>
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>
          Konumu Haritada Seç
        </Text>
        <Text style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>
          Haritaya dokunarak konum belirleyin
        </Text>
        <View style={styles.mapWrap}>
          {!webviewReady && (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          )}
          <WebView
            style={styles.map}
            source={{ html: MAP_HTML(initialLat, initialLon) }}
            onMessage={handleMessage}
            onLoad={() => setWebviewReady(true)}
            javaScriptEnabled
          />
        </View>
        {picked && (
          <View style={styles.bottom}>
            <TextInput
              label="Konum adı (isteğe bağlı)"
              value={placeName}
              onChangeText={setPlaceName}
              style={styles.nameInput}
              mode="outlined"
              dense
            />
            <Text style={[styles.coords, { color: theme.colors.onSurfaceVariant }]}>
              {picked.lat.toFixed(5)}, {picked.lng.toFixed(5)}
            </Text>
            <Button mode="contained" onPress={handleConfirm}>
              Bu Konumu Seç
            </Button>
          </View>
        )}
        <Button onPress={onDismiss} style={styles.cancel}>İptal</Button>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  container: { margin: 16, borderRadius: 16, overflow: 'hidden', backgroundColor: 'white', maxHeight: '90%' },
  title: { fontSize: 17, fontWeight: '700', padding: 16, paddingBottom: 4 },
  hint: { fontSize: 13, paddingHorizontal: 16, paddingBottom: 8 },
  mapWrap: { height: 340, position: 'relative' },
  loader: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  map: { flex: 1 },
  bottom: { padding: 16, gap: 8 },
  nameInput: { backgroundColor: 'white' },
  coords: { fontSize: 12 },
  cancel: { marginBottom: 8 },
});
