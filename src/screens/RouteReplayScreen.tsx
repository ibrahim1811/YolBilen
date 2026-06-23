import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Appbar, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'RouteReplay'>;

function buildReplayHtml(waypoints: Array<{ lat: number; lon: number; label: string }>): string {
  const pts = JSON.stringify(waypoints.map(p => [p.lat, p.lon]));
  const labels = JSON.stringify(waypoints.map(p => p.label));

  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#map{margin:0;padding:0;height:100%;width:100%;}</style>
</head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var pts=${pts};
var labels=${labels};
var map=L.map('map',{zoomControl:true});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OSM'}).addTo(map);
L.polyline(pts,{color:'#1A73E8',weight:4,opacity:0.7}).addTo(map);
map.fitBounds(pts,{padding:[40,40]});
pts.forEach(function(p,i){
  L.circleMarker(p,{radius:5,color:'#1A73E8',fillColor:'#fff',fillOpacity:1,weight:2})
   .bindPopup(labels[i]).addTo(map);
});
var busIcon=L.divIcon({
  html:'<div style="font-size:26px;line-height:1;">🚌</div>',
  iconSize:[32,32],iconAnchor:[16,16],className:''
});
var busMarker=L.marker(pts[0],{icon:busIcon}).addTo(map);
var idx=0;
var timer=setInterval(function(){
  idx++;
  if(idx>=pts.length){clearInterval(timer);return;}
  busMarker.setLatLng(pts[idx]);
  map.panTo(pts[idx],{animate:true,duration:0.8});
},800);
</script></body></html>`;
}

export function RouteReplayScreen({ navigation, route: navRoute }: Props) {
  const theme = useTheme();
  const { route } = navRoute.params;

  const transitSteps = route.steps?.filter(s => s.type === 'transit') ?? [];
  const waypoints: Array<{ lat: number; lon: number; label: string }> = [];

  if (route.boardingStop) {
    waypoints.push({ lat: route.boardingStop.latitude, lon: route.boardingStop.longitude, label: '📍 Başlangıç' });
  }
  for (const step of transitSteps) {
    if (step.boardStop) {
      waypoints.push({ lat: step.boardStop.latitude, lon: step.boardStop.longitude, label: `🟢 Biniş: ${step.boardStop.name}` });
    }
    for (const mid of step.intermediateStops ?? []) {
      waypoints.push({ lat: mid.latitude, lon: mid.longitude, label: mid.name });
    }
    if (step.alightStop) {
      waypoints.push({ lat: step.alightStop.latitude, lon: step.alightStop.longitude, label: `🔴 İniş: ${step.alightStop.name}` });
    }
  }
  if (route.alightingStop) {
    waypoints.push({ lat: route.alightingStop.latitude, lon: route.alightingStop.longitude, label: '🏁 Varış' });
  }

  const html = buildReplayHtml(
    waypoints.length > 1 ? waypoints : [{ lat: 38.4189, lon: 27.1287, label: 'İzmir' }]
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <Appbar.Header elevated>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content
          title="Rota Replay"
          subtitle={`${route.lineNumber} · ${route.estimatedDuration} dk`}
        />
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
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          🚌 Otobüs rotası boyunca animasyonlu ilerliyor — {waypoints.length} durak
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  map: { flex: 1 },
  legend: { padding: 12, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.08)' },
});
