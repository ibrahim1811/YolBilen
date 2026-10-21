import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, Alert, ScrollView, TouchableOpacity } from 'react-native';
import { Text, Button, useTheme, Surface, Appbar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import * as Location from 'expo-location';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, RouteStep } from '../types';
import { scheduleLocalNotification } from '../services/notifications/notificationService';
import { saveJourney } from '../services/firebase/journeyService';
import { startAlightTracking, stopAlightTracking } from '../services/background/alightTask';
import { useAppStore } from '../store/useAppStore';
import { GamePlayModal } from '../components/games/GamePlayModal';
import { getLineColor, getLineMode, lineTitle, TRANSIT_MODE_ICON } from '../data/gtfsData';

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
  const transitSteps = (steps ?? []).filter(s => s.type === 'transit');
  const midStops = transitSteps.flatMap(s => s.intermediateStops ?? []);

  const intermediateJs = transitSteps
    .flatMap(t => {
      const color = getLineColor(t.lineNumber ?? '') ?? '#1A73E8';
      return (t.intermediateStops ?? []).map(s =>
        `L.circleMarker([${s.latitude},${s.longitude}],{radius:5,color:'${color}',fillColor:'${color}',fillOpacity:0.8,weight:2}).bindPopup(${JSON.stringify(s.name)}).addTo(map);`);
    })
    .join('\n');

  // Aktarma yürüyüşleri: bir bacağın iniş durağından sonrakinin biniş durağına
  const walkLinesJs = transitSteps.slice(1)
    .map((t, i) => {
      const a = transitSteps[i].alightStop;
      const b = t.boardStop;
      if (!a || !b) return '';
      return `L.polyline([[${a.latitude},${a.longitude}],[${b.latitude},${b.longitude}]],{color:'#888',weight:3,dashArray:'5,8'}).addTo(map);` +
        `L.marker([${b.latitude},${b.longitude}],{icon:orangeIcon}).bindPopup(${JSON.stringify('Aktarma: ' + b.name)}).addTo(map);`;
    })
    .join('\n');

  let polylineJs = transitSteps
    .filter(t => t.boardStop && t.alightStop)
    .map(t => {
      const pts = [
        [t.boardStop!.latitude, t.boardStop!.longitude],
        ...(t.intermediateStops ?? []).map(s => [s.latitude, s.longitude]),
        [t.alightStop!.latitude, t.alightStop!.longitude],
      ];
      return `L.polyline(${JSON.stringify(pts)},{color:'${getLineColor(t.lineNumber ?? '') ?? '#1A73E8'}',weight:5}).addTo(map);`;
    })
    .join('\n');
  if (!polylineJs && boarding && alighting) {
    polylineJs = `L.polyline([[${boarding.latitude},${boarding.longitude}],[${alighting.latitude},${alighting.longitude}]],{color:'#1A73E8',weight:4,dashArray:'8,4'}).addTo(map);`;
  }
  const transitStep = transitSteps[0];
  const lastTransit = transitSteps[transitSteps.length - 1];

  const boardingJs = boarding
    ? `L.marker([${boarding.latitude},${boarding.longitude}],{icon:greenIcon}).bindPopup(${JSON.stringify('Biniş: ' + boarding.name)}).addTo(map);`
    : '';
  const alightingJs = alighting
    ? `L.marker([${alighting.latitude},${alighting.longitude}],{icon:redIcon}).bindPopup(${JSON.stringify('İniş: ' + alighting.name)}).addTo(map);`
    : '';

  const allPts: [number, number][] = [
    ...(transitStep?.boardStop ? [[transitStep.boardStop.latitude, transitStep.boardStop.longitude] as [number, number]] : []),
    ...midStops.map(s => [s.latitude, s.longitude] as [number, number]),
    ...(lastTransit?.alightStop ? [[lastTransit.alightStop.latitude, lastTransit.alightStop.longitude] as [number, number]] : []),
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
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{attribution:'&copy; OpenStreetMap &copy; CARTO',maxZoom:19}).addTo(map);
var greenIcon=L.divIcon({html:'<div style="background:#34A853;border:3px solid white;border-radius:50%;width:18px;height:18px;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>',iconSize:[18,18],iconAnchor:[9,9],className:''});
var redIcon=L.divIcon({html:'<div style="background:#EA4335;border:3px solid white;border-radius:50%;width:18px;height:18px;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>',iconSize:[18,18],iconAnchor:[9,9],className:''});
var orangeIcon=L.divIcon({html:'<div style="background:#FB8C00;border:3px solid white;border-radius:50%;width:16px;height:16px;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>',iconSize:[16,16],iconAnchor:[8,8],className:''});
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
        <View style={[styles.phaseIconBg, { backgroundColor: '#34A85322' }]}>
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
        <View style={[styles.phaseIconBg, { backgroundColor: '#FB8C0022' }]}>
          <MaterialCommunityIcons name="bus-clock" size={28} color="#FB8C00" />
        </View>
        <View style={styles.phaseTextGroup}>
          <Text style={[styles.phaseTitle, { color: theme.colors.onSurface }]}>
            Duraktasın
          </Text>
          <Text style={[styles.phaseSub, { color: theme.colors.onSurfaceVariant }]}>
            {lineTitle(lineNumber)} · ~{nextArrival} dk sonra geliyor
          </Text>
        </View>
      </View>
      <Button mode="contained" icon={TRANSIT_MODE_ICON[getLineMode(lineNumber)]} onPress={onManualBoard} style={styles.phaseBtn}>
        Bindim
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
          <MaterialCommunityIcons name={TRANSIT_MODE_ICON[getLineMode(lineNumber)]} size={28} color={theme.colors.primary} />
        </View>
        <View style={styles.phaseTextGroup}>
          <Text style={[styles.phaseTitle, { color: theme.colors.onSurface }]}>
            {lineTitle(lineNumber)} · {stopsLeft} durak kaldı
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
  const incrementMissionProgress = useAppStore(s => s.incrementMissionProgress);
  const { route } = navRoute.params;
  const webRef = useRef<WebView>(null);
  const [gameModalVisible, setGameModalVisible] = useState(false);

  useEffect(() => {
    incrementMissionProgress('journeyStarted', 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Aktarmalı rotalarda her araç ayrı bir bacak; ekran sırayla ilerler.
  const allSteps = route.steps ?? [];
  const transitSteps = useMemo(() => allSteps.filter(s => s.type === 'transit'), [route]);
  const [legIdx, setLegIdx] = useState(0);
  const legIdxRef = useRef(0);
  const transitStep = transitSteps[legIdx];
  const isLastLeg = legIdx >= transitSteps.length - 1;
  const legLineNumber = transitStep?.lineNumber ?? route.lineNumber;
  const stepIdx = transitStep ? allSteps.indexOf(transitStep) : -1;
  const walkStep = stepIdx > 0 && allSteps[stepIdx - 1].type === 'walk' ? allSteps[stepIdx - 1] : undefined;

  const boarding: Stop | null = transitStep?.boardStop
    ?? (route.boardingStop ? { name: route.boardingStop.name, latitude: route.boardingStop.latitude, longitude: route.boardingStop.longitude } : null);

  const alighting: Stop | null = transitStep?.alightStop
    ?? (route.alightingStop ? { name: route.alightingStop.name, latitude: route.alightingStop.latitude, longitude: route.alightingStop.longitude } : null);

  const allStops: Stop[] = [
    ...(transitStep?.boardStop ? [transitStep.boardStop] : []),
    ...(transitStep?.intermediateStops ?? []),
    ...(transitStep?.alightStop ? [transitStep.alightStop] : []),
  ];

  const nowMinsForLeg = new Date().getHours() * 60 + new Date().getMinutes();
  const legNextArrival = legIdx === 0 || transitStep?.departureMins === undefined
    ? route.nextArrival
    : Math.max(0, transitStep.departureMins - nowMinsForLeg);

  const [phase, setPhase] = useState<Phase>('walk');
  const [nearestStopIdx, setNearestStopIdx] = useState(0);

  const phaseRef = useRef<Phase>('walk');
  const notifiedAlightRef = useRef(false);
  const boardingPromptedRef = useRef(false);
  const lastLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);
  // Konum dinleyicisi bir kez kurulur; güncel bacağı ref üzerinden okur.
  const legRef = useRef({ boarding, alighting, allStops, isLastLeg, lineNumber: legLineNumber });
  legRef.current = { boarding, alighting, allStops, isLastLeg, lineNumber: legLineNumber };

  function finishLeg() {
    if (!legRef.current.isLastLeg) {
      const next = legIdxRef.current + 1;
      legIdxRef.current = next;
      setLegIdx(next);
      notifiedAlightRef.current = false;
      boardingPromptedRef.current = false;
      setNearestStopIdx(0);
      setPhase('walk');
      phaseRef.current = 'walk';
      return;
    }
    setPhase('arrived');
    phaseRef.current = 'arrived';
  }
  const finishLegRef = useRef(finishLeg);
  finishLegRef.current = finishLeg;

  const html = useMemo(
    () => buildNavHtml(route.steps, boarding, transitSteps[transitSteps.length - 1]?.alightStop ?? alighting),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Otobüsteyken inme durağı arka planda da izlenir (telefon kilitliyken bildirim gelsin diye)
  const bgTrackingRef = useRef(false);
  const journeySavedRef = useRef(false);
  useEffect(() => {
    if (phase === 'arrived') {
      bgTrackingRef.current = false;
      stopAlightTracking().catch(e => console.warn('[JourneyNavigation] arka plan takibi durdurulamadı:', e));
      if (user && !user.isGuest && !journeySavedRef.current) {
        journeySavedRef.current = true;
        const now = new Date();
        const totalMeters = route.steps?.reduce((s, st) => s + (st.distanceMeters ?? 0), 0) ?? 0;
        saveJourney({
          userId: user.uid,
          lineNumber: route.lineNumber,
          lineName: route.lineName,
          originName: transitSteps[0]?.boardStop?.name ?? boarding?.name ?? '',
          destinationName: transitSteps[transitSteps.length - 1]?.alightStop?.name ?? alighting?.name ?? '',
          durationMins: route.estimatedDuration,
          distanceKm: Math.round((totalMeters / 1000) * 10) / 10,
          timestamp: now,
          dayOfWeek: now.getDay(),
          hourOfDay: now.getHours(),
        }).catch(e => {
          journeySavedRef.current = false;
          console.warn('[JourneyNavigation] yolculuk kaydedilemedi:', e);
          Alert.alert('Yolculuk kaydedilemedi', 'İnternet bağlantını kontrol et.');
        });
      }
      return;
    }
    if (phase !== 'on_bus' || !alighting) return;
    let cancelled = false;
    startAlightTracking({ name: alighting.name, latitude: alighting.latitude, longitude: alighting.longitude })
      .then(result => {
        if (cancelled) return;
        bgTrackingRef.current = result === 'started';
        if (result === 'foreground_only') {
          Alert.alert(
            'Arka plan konum izni yok',
            'İnme bildirimi yalnızca uygulama açıkken çalışacak. Telefon kilitliyken de gelmesi için konum iznini "Her zaman izin ver" yap.'
          );
        }
      })
      .catch(e => console.warn('[JourneyNavigation] arka plan takibi başlatılamadı:', e));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, legIdx]);

  useEffect(() => () => {
    stopAlightTracking().catch(e => console.warn('[JourneyNavigation] arka plan takibi durdurulamadı:', e));
  }, []);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== 'granted') {
        Alert.alert('Konum izni gerekli', 'Durağa varışını ve inme zamanını takip edebilmek için konum iznine ihtiyaç var.');
        return;
      }

      const s = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 4000, distanceInterval: 15 },
        loc => {
          const { latitude, longitude, speed } = loc.coords;
          lastLocationRef.current = { latitude, longitude };

          webRef.current?.injectJavaScript(
            `(function(){if(userMarker){map.removeLayer(userMarker);}userMarker=L.circleMarker([${latitude},${longitude}],{radius:8,color:'#4285F4',fillColor:'#4285F4',fillOpacity:1,weight:3}).addTo(map);})();true;`
          );

          const cur = phaseRef.current;
          const { boarding, alighting, allStops, lineNumber } = legRef.current;

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
              `${lineTitle(lineNumber)} aracına bindiğini tespit ettik.`,
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

            if (!notifiedAlightRef.current && alighting && !bgTrackingRef.current) {
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
                finishLegRef.current();
              }
            }
          }
        }
      );
      if (cancelled) { s.remove(); return; }
      sub = s;
    })().catch(e => {
      console.warn('[JourneyNavigation] konum takibi başlatılamadı:', e);
      if (!cancelled) Alert.alert('Konum alınamadı', 'Konum servislerinin açık olduğundan emin ol.');
    });

    return () => {
      cancelled = true;
      sub?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCenterOnMe() {
    let loc = lastLocationRef.current;
    if (!loc) {
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        lastLocationRef.current = loc;
      } catch {
        return;
      }
    }
    webRef.current?.injectJavaScript(
      `(function(){map.setView([${loc.latitude},${loc.longitude}],16,{animate:true});})();true;`
    );
  }

  function handleCancel() {
    Alert.alert(
      'Yolculuğu İptal Et',
      'Aktif yolculuğu iptal etmek istiyor musunuz?',
      [
        { text: 'Devam Et', style: 'cancel' },
        { text: 'İptal Et', style: 'destructive', onPress: () => navigation.goBack() },
      ]
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <Appbar.Header style={[styles.appbar, { backgroundColor: theme.colors.surface }]} elevated={false}>
        <Appbar.Content
          title={transitSteps.length > 1 ? `${lineTitle(legLineNumber)} · ${legIdx + 1}/${transitSteps.length}` : lineTitle(legLineNumber)}
          titleStyle={styles.appbarTitle}
        />
        <Appbar.Action icon="close-circle-outline" onPress={handleCancel} />
      </Appbar.Header>
      <WebView
        ref={webRef}
        style={styles.map}
        source={{ html }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
      />

      <TouchableOpacity
        style={[styles.locateFab, { backgroundColor: theme.colors.surface }]}
        onPress={handleCenterOnMe}
      >
        <MaterialCommunityIcons name="crosshairs-gps" size={24} color={theme.colors.primary} />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.gameFab, { backgroundColor: theme.colors.primary }]}
        onPress={() => setGameModalVisible(true)}
      >
        <MaterialCommunityIcons name="gamepad-variant" size={26} color="#fff" />
      </TouchableOpacity>

      <Surface style={[styles.panel, { backgroundColor: theme.colors.surface }]} elevation={4}>
        <View style={styles.panelHandle} />

        {phase === 'walk' && (
          <WalkPanel
            walkMins={walkStep?.durationMins ?? (legIdx > 0 ? 1 : 5)}
            boardStopName={legIdx > 0 ? `Aktarma: ${boarding?.name ?? ''} (${lineTitle(legLineNumber)})` : boarding?.name ?? ''}
            onManualArrive={() => {
              setPhase('waiting');
              phaseRef.current = 'waiting';
            }}
          />
        )}
        {phase === 'waiting' && (
          <WaitingPanel
            lineNumber={legLineNumber}
            nextArrival={legNextArrival}
            onManualBoard={() => {
              setPhase('on_bus');
              phaseRef.current = 'on_bus';
            }}
          />
        )}
        {phase === 'on_bus' && (
          <OnBusPanel
            lineNumber={legLineNumber}
            allStops={allStops}
            nearestIdx={nearestStopIdx}
            alightStopName={isLastLeg ? alighting?.name ?? '' : `${alighting?.name ?? ''} (aktarma)`}
            onManualAlight={finishLeg}
          />
        )}
        {phase === 'arrived' && (
          <ArrivedPanel
            alightStopName={alighting?.name ?? ''}
            onDone={() => navigation.popToTop()}
          />
        )}
      </Surface>

      <GamePlayModal
        visible={gameModalVisible}
        gameId="game2048"
        onDismiss={() => setGameModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  appbar: { elevation: 0 },
  appbarTitle: { fontSize: 16, fontWeight: '700' },
  map: { flex: 1 },
  gameFab: {
    position: 'absolute',
    right: 16,
    bottom: '48%',
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  locateFab: {
    position: 'absolute',
    right: 16,
    bottom: '48%',
    marginBottom: 64,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
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
