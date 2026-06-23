import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, Alert, ScrollView } from 'react-native';
import { Text, Button, useTheme, Surface } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import * as Location from 'expo-location';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, RouteStep } from '../types';
import { scheduleLocalNotification } from '../services/notifications/notificationService';
import { saveJourney } from '../services/firebase/journeyService';
import { useAppStore } from '../store/useAppStore';

type Props = NativeStackScreenProps<RootStackParamList, 'JourneyNavigation'>;
type Phase = 'walk' | 'waiting' | 'on_bus' | 'arrived';
type Stop = { name: string; latitude: number; longitude: number };

const BOARD_RADIUS_M = 50;
const ALIGHT_NOTIFY_M = 500;
const BOARD_SPEED_MS = 4.2;

function distMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

function buildNavHtml(steps?: RouteStep[], boarding?: Stop | null, alighting?: Stop | null): string {
  const transitStep = steps?.find(s => s.type === 'transit');
  const midStops = transitStep?.intermediateStops ?? [];

  const intermediateJs = midStops
    .map(s => `L.circleMarker([${s.latitude},${s.longitude}],{radius:5,color:'#1A73E8',fillColor:'#1A73E8',fillOpacity:0.8,weight:2}).bindPopup(${JSON.stringify(s.name)}).addTo(map);`)
    .join('\n');

  let walkLinesJs = '';
  if (transitStep?.boardStop && transitStep?.alightStop && boarding && alighting) {
    const b = transitStep.boardStop;
    const a = transitStep.alightStop;
    walkLinesJs =
      `L.polyline([[${boarding.latitude},${boarding.longitude}],[${b.latitude},${b.longitude}]],{color:'#888',weight:2,dashArray:'5,8'}).addTo(map);\n` +
      `L.polyline([[${a.latitude},${a.longitude}],[${alighting.latitude},${alighting.longitude}]],{color:'#888',weight:2,dashArray:'5,8'}).addTo(map);`;
  }

  let polylineJs = '';
  if (transitStep?.boardStop && transitStep?.alightStop) {
    const pts = [
      [transitStep.boardStop.latitude, transitStep.boardStop.longitude],
      ...midStops.map(s => [s.latitude, s.longitude]),
      [transitStep.alightStop.latitude, transitStep.alightStop.longitude],
    ];
    polylineJs = `L.polyline(${JSON.stringify(pts)},{color:'#1A73E8',weight:4}).addTo(map);`;
  } else if (boarding && alighting) {
    polylineJs = `L.polyline([[${boarding.latitude},${boarding.longitude}],[${alighting.latitude},${alighting.longitude}]],{color:'#1A73E8',weight:4,dashArray:'8,4'}).addTo(map);`;
  }

  const boardingJs = boarding
    ? `L.marker([${boarding.latitude},${boarding.longitude}],{icon:greenIcon}).bindPopup(${JSON.stringify('Biniş: ' + boarding.name)}).addTo(map);`
    : '';
  const alightingJs = alighting
    ? `L.marker([${alighting.latitude},${alighting.longitude}],{icon:redIcon}).bindPopup(${JSON.stringify('İniş: ' + alighting.name)}).addTo(map);`
    : '';

  const allPts: [number, number][] = [
    ...(transitStep?.boardStop ? [[transitStep.boardStop.latitude, transitStep.boardStop.longitude] as [number, number]] : []),
    ...midStops.map(s => [s.latitude, s.longitude] as [number, number]),
    ...(transitStep?.alightStop ? [[transitStep.alightStop.latitude, transitStep.alightStop.longitude] as [number, number]] : []),
    ...(boarding ? [[boarding.latitude, boarding.longitude] as [number, number]] : []),
    ...(alighting ? [[alighting.latitude, alighting.longitude] as [number, number]] : []),
  ];

  const boundsJs =
    allPts.length > 1
      ? `map.fitBounds(${JSON.stringify(allPts)},{padding:[40,40]});`
      : `map.setView([38.4192,27.1287],13);`;

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
var map=L.map('map',{zoomControl:false});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap',maxZoom:19}).addTo(map);
var greenIcon=L.icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',shadowUrl:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',iconSize:[25,41],iconAnchor:[12,41],popupAnchor:[1,-34]});
var redIcon=L.icon({iconUrl:'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',shadowUrl:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',iconSize:[25,41],iconAnchor:[12,41],popupAnchor:[1,-34]});
var userMarker=null;
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

function WalkPanel({
  walkMins,
  boardStopName,
  onManualArrive,
}: {
  walkMins: number;
  boardStopName: string;
  onManualArrive: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.phaseContainer}>
      <View style={styles.phaseHeader}>
        <View style={[styles.phaseIconBg, { backgroundColor: '#E8F5E9' }]}>
          <MaterialCommunityIcons name="walk" size={28} color="#34A853" />
        </View>
        <View style={styles.phaseTextGroup}>
          <Text style={[styles.phaseTitle, { color: theme.colors.onSurface }]}>
            {walkMins} dk yürüyün
          </Text>
          <Text style={[styles.phaseSub, { color: theme.colors.onSurfaceVariant }]}>
            Hedef: {boardStopName}
          </Text>
        </View>
      </View>
      <Button mode="outlined" onPress={onManualArrive} style={styles.phaseBtn}>
        Durağa Ulaştım
      </Button>
    </View>
  );
}

function WaitingPanel({
  lineNumber,
  nextArrival,
  onManualBoard,
}: {
  lineNumber: string;
  nextArrival: number;
  onManualBoard: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.phaseContainer}>
      <View style={styles.phaseHeader}>
        <View style={[styles.phaseIconBg, { backgroundColor: '#FFF3E0' }]}>
          <MaterialCommunityIcons name="bus-clock" size={28} color="#FB8C00" />
        </View>
        <View style={styles.phaseTextGroup}>
          <Text style={[styles.phaseTitle, { color: theme.colors.onSurface }]}>
            Duraktasın
          </Text>
          <Text style={[styles.phaseSub, { color: theme.colors.onSurfaceVariant }]}>
            Hat {lineNumber} · ~{nextArrival} dk sonra geliyor
          </Text>
        </View>
      </View>
      <Button mode="contained" icon="bus" onPress={onManualBoard} style={styles.phaseBtn}>
        Otobüse Bindim
      </Button>
    </View>
  );
}

function OnBusPanel({
  lineNumber,
  allStops,
  nearestIdx,
  alightStopName,
  onManualAlight,
}: {
  lineNumber: string;
  allStops: Stop[];
  nearestIdx: number;
  alightStopName: string;
  onManualAlight: () => void;
}) {
  const theme = useTheme();
  const alightIdx = allStops.length - 1;
  const stopsLeft = Math.max(0, alightIdx - nearestIdx);

  return (
    <View style={styles.phaseContainer}>
      <View style={styles.phaseHeader}>
        <View style={[styles.phaseIconBg, { backgroundColor: theme.colors.primaryContainer }]}>
          <MaterialCommunityIcons name="bus" size={28} color={theme.colors.primary} />
        </View>
        <View style={styles.phaseTextGroup}>
          <Text style={[styles.phaseTitle, { color: theme.colors.onSurface }]}>
            Hat {lineNumber} · {stopsLeft} durak kaldı
          </Text>
          <Text style={[styles.phaseSub, { color: theme.colors.onSurfaceVariant }]}>
            İniş: {alightStopName}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.stopsList} showsVerticalScrollIndicator={false}>
        {allStops.map((s, i) => {
          const isCurrent = i === nearestIdx;
          const isAlight = i === alightIdx;
          const isPassed = i < nearestIdx;
          return (
            <View key={i} style={styles.stopRow}>
              <View
                style={[
                  styles.stopDot,
                  isCurrent
                    ? { backgroundColor: theme.colors.primary, width: 12, height: 12, borderRadius: 6 }
                    : isAlight
                    ? { backgroundColor: '#D93025', width: 12, height: 12, borderRadius: 6 }
                    : isPassed
                    ? { backgroundColor: theme.colors.outlineVariant }
                    : { backgroundColor: theme.colors.outline },
                ]}
              />
              <Text
                style={[
                  styles.stopName,
                  {
                    color: isCurrent
                      ? theme.colors.primary
                      : isAlight
                      ? '#D93025'
                      : isPassed
                      ? theme.colors.outlineVariant
                      : theme.colors.onSurface,
                    fontWeight: isCurrent || isAlight ? '700' : '400',
                  },
                ]}
              >
                {s.name}
                {isCurrent ? '  ← şu an' : isAlight ? '  ← ineceksiniz' : ''}
              </Text>
            </View>
          );
        })}
      </ScrollView>

      <Button mode="contained" buttonColor="#D93025" onPress={onManualAlight} style={styles.phaseBtn}>
        İniyorum
      </Button>
    </View>
  );
}

function ArrivedPanel({
  alightStopName,
  onDone,
}: {
  alightStopName: string;
  onDone: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.phaseContainer, styles.arrivedContainer]}>
      <MaterialCommunityIcons name="check-circle" size={56} color="#34A853" />
      <Text style={[styles.arrivedTitle, { color: theme.colors.onSurface }]}>
        Hedefinize Ulaştınız!
      </Text>
      <Text style={[styles.arrivedSub, { color: theme.colors.onSurfaceVariant }]}>
        {alightStopName}
      </Text>
      <Button mode="contained" onPress={onDone} style={styles.phaseBtn}>
        Yolculuğu Bitir
      </Button>
    </View>
  );
}

export function JourneyNavigationScreen({ navigation, route: navRoute }: Props) {
  const theme = useTheme();
  const user = useAppStore(s => s.user);
  const { route } = navRoute.params;
  const webRef = useRef<WebView>(null);

  const transitStep = route.steps?.find(s => s.type === 'transit');
  const walkStep = route.steps?.find(s => s.type === 'walk');

  const boarding: Stop | null = route.boardingStop
    ? { name: route.boardingStop.name, latitude: route.boardingStop.latitude, longitude: route.boardingStop.longitude }
    : transitStep?.boardStop ?? null;

  const alighting: Stop | null = route.alightingStop
    ? { name: route.alightingStop.name, latitude: route.alightingStop.latitude, longitude: route.alightingStop.longitude }
    : transitStep?.alightStop ?? null;

  const allStops: Stop[] = [
    ...(transitStep?.boardStop ? [transitStep.boardStop] : []),
    ...(transitStep?.intermediateStops ?? []),
    ...(transitStep?.alightStop ? [transitStep.alightStop] : []),
  ];

  const [phase, setPhase] = useState<Phase>('walk');
  const [nearestStopIdx, setNearestStopIdx] = useState(0);

  const phaseRef = useRef<Phase>('walk');
  const notifiedAlightRef = useRef(false);
  const boardingPromptedRef = useRef(false);

  const html = useMemo(
    () => buildNavHtml(route.steps, boarding, alighting),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 4000, distanceInterval: 15 },
        loc => {
          const { latitude, longitude, speed } = loc.coords;

          webRef.current?.injectJavaScript(
            `(function(){if(userMarker){map.removeLayer(userMarker);}userMarker=L.circleMarker([${latitude},${longitude}],{radius:8,color:'#4285F4',fillColor:'#4285F4',fillOpacity:1,weight:3}).addTo(map);})();true;`
          );

          const cur = phaseRef.current;

          if (cur === 'walk' && boarding) {
            if (distMeters(latitude, longitude, boarding.latitude, boarding.longitude) < BOARD_RADIUS_M) {
              setPhase('waiting');
              phaseRef.current = 'waiting';
            }
          }

          if (cur === 'waiting' && !boardingPromptedRef.current && (speed ?? 0) > BOARD_SPEED_MS) {
            boardingPromptedRef.current = true;
            Alert.alert(
              'Otobüse bindin mi?',
              `Hat ${route.lineNumber} otobüsüne bindiğini tespit ettik.`,
              [
                {
                  text: 'Evet, bindim!',
                  onPress: () => {
                    setPhase('on_bus');
                    phaseRef.current = 'on_bus';
                  },
                },
                {
                  text: 'Henüz hayır',
                  style: 'cancel',
                  onPress: () => {
                    boardingPromptedRef.current = false;
                  },
                },
              ]
            );
          }

          if (cur === 'on_bus') {
            if (allStops.length > 0) {
              let minDist = Infinity;
              let minIdx = 0;
              allStops.forEach((s, i) => {
                const d = distMeters(latitude, longitude, s.latitude, s.longitude);
                if (d < minDist) {
                  minDist = d;
                  minIdx = i;
                }
              });
              setNearestStopIdx(minIdx);
            }

            if (!notifiedAlightRef.current && alighting) {
              const d = distMeters(latitude, longitude, alighting.latitude, alighting.longitude);
              if (d < ALIGHT_NOTIFY_M) {
                notifiedAlightRef.current = true;
                scheduleLocalNotification(
                  'İnme zamanı yaklaşıyor!',
                  `${alighting.name} durağına ~${Math.round(d)} m kaldı. İnmeye hazırlanın!`,
                  'arrivals'
                );
              }
            }

            if (alighting) {
              if (distMeters(latitude, longitude, alighting.latitude, alighting.longitude) < 80) {
                setPhase('arrived');
                phaseRef.current = 'arrived';
              }
            }
          }
        }
      );
    })();

    return () => {
      sub?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <WebView
        ref={webRef}
        style={styles.map}
        source={{ html }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
      />

      <Surface style={[styles.panel, { backgroundColor: theme.colors.surface }]} elevation={4}>
        <View style={styles.panelHandle} />

        {phase === 'walk' && (
          <WalkPanel
            walkMins={walkStep?.durationMins ?? 5}
            boardStopName={boarding?.name ?? ''}
            onManualArrive={() => {
              setPhase('waiting');
              phaseRef.current = 'waiting';
            }}
          />
        )}
        {phase === 'waiting' && (
          <WaitingPanel
            lineNumber={route.lineNumber}
            nextArrival={route.nextArrival}
            onManualBoard={() => {
              setPhase('on_bus');
              phaseRef.current = 'on_bus';
            }}
          />
        )}
        {phase === 'on_bus' && (
          <OnBusPanel
            lineNumber={route.lineNumber}
            allStops={allStops}
            nearestIdx={nearestStopIdx}
            alightStopName={alighting?.name ?? ''}
            onManualAlight={() => {
              setPhase('arrived');
              phaseRef.current = 'arrived';
            }}
          />
        )}
        {phase === 'arrived' && (
          <ArrivedPanel
            alightStopName={alighting?.name ?? ''}
            onDone={() => {
              if (user && !user.isGuest) {
                const now = new Date();
                void saveJourney({
                  userId: user.uid,
                  lineNumber: route.lineNumber,
                  lineName: route.lineName,
                  originName: boarding?.name ?? '',
                  destinationName: alighting?.name ?? '',
                  durationMins: route.estimatedDuration,
                  distanceKm: 0,
                  timestamp: now,
                  dayOfWeek: now.getDay(),
                  hourOfDay: now.getHours(),
                });
              }
              navigation.popToTop();
            }}
          />
        )}
      </Surface>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  panel: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 8,
    maxHeight: '45%',
  },
  panelHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  phaseContainer: { gap: 12 },
  phaseHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  phaseIconBg: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  phaseTextGroup: { flex: 1, gap: 2 },
  phaseTitle: { fontSize: 18, fontWeight: '700' },
  phaseSub: { fontSize: 13 },
  phaseBtn: { borderRadius: 12 },
  stopsList: { maxHeight: 130 },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  stopDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  stopName: { fontSize: 13, flex: 1 },
  arrivedContainer: { alignItems: 'center', paddingTop: 8 },
  arrivedTitle: { fontSize: 22, fontWeight: '800', marginTop: 8 },
  arrivedSub: { fontSize: 14, marginBottom: 4 },
});
