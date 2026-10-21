import React, { useEffect } from 'react';
import SunCalc from 'suncalc';
import { trackScreenView } from '../services/telemetry/telemetryService';
import { View, StyleSheet, ScrollView, Share, TouchableOpacity } from 'react-native';
import WebView from 'react-native-webview';
import { buildMapHtml } from './RouteMapScreen';
import { Text, useTheme, Appbar, Surface, Button } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CrowdBadge } from '../components/common/CrowdBadge';
import { SunSideCard } from '../components/sun/SunSideCard';
import { ComfortScoreCard } from '../components/lines/ComfortScoreCard';
import { getLineComfortScore } from '../services/firebase/lineStats';
import { lineTitle } from '../data/gtfsData';
import { useWeather } from '../hooks/useWeather';
import { JourneyTimeline, buildTimeline, hhmm } from '../components/route/JourneyTimeline';
import type { ComfortScore, Route, RouteStep } from '../types';
import { useAppStore } from '../store/useAppStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'RouteResults'>;

export function RouteResultScreen({ navigation }: Props) {
  const theme = useTheme();
  const selectedRoute = useAppStore((s) => s.selectedRoute);
  const origin = useAppStore((s) => s.origin);
  const destination = useAppStore((s) => s.destination);
  const [comfortScore, setComfortScore] = React.useState<ComfortScore | null>(null);
  const weather = useWeather();

  function handleStartJourney() {
    navigation.navigate('JourneyNavigation', { route: selectedRoute! });
  }

  useEffect(() => { trackScreenView('RouteResult'); }, []);

  React.useEffect(() => {
    if (!selectedRoute || selectedRoute.isWalkOnly) return;
    let cancelled = false;
    getLineComfortScore(selectedRoute.lineNumber)
      .then(score => { if (!cancelled) setComfortScore(score); })
      .catch(e => {
        console.warn('[RouteResult] konfor puanı alınamadı:', e);
        if (!cancelled) setComfortScore(null);
      });
    return () => { cancelled = true; };
  }, [selectedRoute?.lineNumber]);

  const mapHtml = React.useMemo(() => {
    if (!selectedRoute) return '';
    const b = selectedRoute.boardingStop;
    const a = selectedRoute.alightingStop;
    return buildMapHtml({
      boarding: b ? { latitude: b.latitude, longitude: b.longitude, name: b.name } : null,
      alighting: a ? { latitude: a.latitude, longitude: a.longitude, name: a.name } : null,
      center: b ? [b.latitude, b.longitude] : [38.4192, 27.1287],
      steps: selectedRoute.steps,
    });
  }, [selectedRoute]);

  if (!selectedRoute) return null;
  const isWalk = !!selectedRoute.isWalkOnly;

  const lat = selectedRoute.boardingStop?.latitude ?? 38.4192;
  const lon = selectedRoute.boardingStop?.longitude ?? 27.1287;
  const sunTimes = SunCalc.getTimes(new Date(), lat, lon);
  const now = Date.now();
  const isSunUp = now >= sunTimes.sunrise.getTime() && now <= sunTimes.sunset.getTime();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header style={{ backgroundColor: theme.colors.background }} elevated={false}>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Rota Detayı" titleStyle={styles.headerTitle} />
        <Appbar.Action
          icon="share-variant"
          accessibilityLabel="Rotayı paylaş"
          onPress={() => {
            Share.share({ message: buildShareText(selectedRoute, origin?.name, destination?.name) })
              .catch(e => console.warn('[RouteResult] paylaşılamadı:', e));
          }}
        />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {!isWalk && (
          <View style={styles.mapPreview}>
            <WebView
              style={styles.mapWeb}
              source={{ html: mapHtml }}
              originWhitelist={['*']}
              javaScriptEnabled
              scrollEnabled={false}
            />
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={0.9}
              onPress={() => navigation.navigate('RouteMap', { route: selectedRoute })}
              accessibilityLabel="Haritayı büyüt"
            >
              <View style={[styles.mapExpand, { backgroundColor: theme.colors.surface }]}>
                <MaterialCommunityIcons name="arrow-expand" size={16} color={theme.colors.onSurface} />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {selectedRoute.steps && selectedRoute.steps.length > 0 && (
          <RouteStepsCard
            steps={selectedRoute.steps}
            startMins={selectedRoute.departAtMins}
            originName={origin?.name}
            destinationName={destination?.name}
          />
        )}

        <View style={styles.infoChips}>
          {!isWalk && <CrowdBadge level={selectedRoute.crowdLevel} />}
          {!isWalk && (
            <View style={[styles.infoChip, { backgroundColor: theme.colors.surfaceVariant }]}>
              <MaterialCommunityIcons name="transfer" size={14} color={theme.colors.onSurfaceVariant} />
              <Text style={[styles.infoChipText, { color: theme.colors.onSurfaceVariant }]}>
                {selectedRoute.transfers.length === 0 ? 'Aktarmasız' : `${selectedRoute.transfers.length} aktarma`}
              </Text>
            </View>
          )}
          {selectedRoute.confidenceDetail && (
            <View style={[styles.infoChip, { backgroundColor: theme.colors.surfaceVariant }]}>
              <MaterialCommunityIcons
                name={selectedRoute.confidenceDetail.hasLiveData ? 'access-point' : 'calendar-clock'}
                size={14}
                color={selectedRoute.confidenceDetail.hasLiveData ? '#188038' : theme.colors.onSurfaceVariant}
              />
              <Text style={[styles.infoChipText, { color: theme.colors.onSurfaceVariant }]}>
                {selectedRoute.confidenceDetail.hasLiveData ? 'Canlı konum' : 'Tarifeye göre'}
              </Text>
            </View>
          )}
          {isWalk && (
            <View style={[styles.infoChip, { backgroundColor: theme.colors.surfaceVariant }]}>
              <MaterialCommunityIcons name="walk" size={14} color={theme.colors.onSurfaceVariant} />
              <Text style={[styles.infoChipText, { color: theme.colors.onSurfaceVariant }]}>
                {((selectedRoute.steps?.[0]?.distanceMeters ?? 0) / 1000).toFixed(1)} km yürüyüş
              </Text>
            </View>
          )}
        </View>

        {comfortScore && (
          <ComfortScoreCard score={comfortScore} compact />
        )}

        {weather.data?.isHot && (
          <Surface style={[styles.weatherAlert, { backgroundColor: '#FF6D00' }]} elevation={0}>
            <MaterialCommunityIcons name="thermometer-high" size={20} color="#FFF" />
            <View style={styles.weatherAlertText}>
              <Text style={styles.weatherAlertTitle}>
                Hava çok sıcak — {weather.data.temperature}°C
              </Text>
              <Text style={styles.weatherAlertSub}>
                Güneşli taraftan kaçının, serin tarafı tercih edin.
              </Text>
            </View>
          </Surface>
        )}

        {weather.data?.isRainy && (
          <Surface style={[styles.weatherAlert, { backgroundColor: '#1A73E8' }]} elevation={0}>
            <MaterialCommunityIcons name="umbrella" size={20} color="#FFF" />
            <View style={styles.weatherAlertText}>
              <Text style={styles.weatherAlertTitle}>{weather.data.description}</Text>
              <Text style={styles.weatherAlertSub}>Şemsiye almayı unutmayın.</Text>
            </View>
          </Surface>
        )}

        {isSunUp && <SunSideCard analysis={selectedRoute.sunAnalysis ?? null} />}

        {selectedRoute.hasIncompleteData && (
          <Surface style={[styles.infoAlert, { backgroundColor: '#FEF3C7' }]} elevation={0}>
            <MaterialCommunityIcons name="calendar-remove" size={20} color="#D97706" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#92400E', fontWeight: '700', fontSize: 14 }}>
                Bu hat için tam sefer verisi mevcut değil
              </Text>
              <Text style={{ color: '#92400E', fontSize: 12, marginTop: 2 }}>
                Varış süresi tahminidir. Gerçek sefer saatleri değişebilir.
              </Text>
            </View>
          </Surface>
        )}

        {!isWalk && (
          <>
            <Button
              mode="contained"
              style={styles.startBtn}
              contentStyle={styles.startBtnContent}
              icon="navigation"
              labelStyle={styles.startBtnLabel}
              onPress={handleStartJourney}
            >
              Yolculuğu Başlat
            </Button>
            <Button
              mode="outlined"
              icon="play-circle"
              style={{ marginTop: 8, marginHorizontal: 16 }}
              onPress={() => navigation.navigate('RouteReplay', { route: selectedRoute! })}
            >
              Rotayı Oynat
            </Button>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function buildShareText(route: Route, originName?: string, destinationName?: string): string {
  const { items, leaveAt, arriveAt } = buildTimeline(route.steps ?? [], route.departAtMins);
  const lines = [
    `🧭 ${originName ?? 'Başlangıç'} → ${destinationName ?? 'Varış'}`,
    `${hhmm(leaveAt)} çıkış · ${hhmm(arriveAt)} varış (${arriveAt - leaveAt} dk)`,
    '',
  ];
  for (const { step, start, end } of items) {
    if (step.type === 'walk') {
      if (step.durationMins > 0) lines.push(`🚶 ${hhmm(start)} ${step.durationMins} dk yürü → ${step.toStopName ?? ''}`);
    } else {
      lines.push(`${MODE_EMOJI[step.mode ?? 'bus']} ${hhmm(start)} ${step.boardStop?.name}: ${lineTitle(step.lineNumber ?? '')}${step.headsign ? ` (${step.headsign} yönü)` : ''}`);
      lines.push(`   ${hhmm(end)} ${step.alightStop?.name} durağında in`);
    }
  }
  lines.push('', 'YolBilen ile planlandı');
  return lines.join('\n');
}

const MODE_EMOJI: Record<NonNullable<RouteStep['mode']>, string> = {
  bus: '🚌', metro: '🚇', tram: '🚊', rail: '🚆', ferry: '⛴️',
};

function RouteStepsCard({ steps, startMins, originName, destinationName }: {
  steps: RouteStep[];
  startMins?: number;
  originName?: string;
  destinationName?: string;
}) {
  const theme = useTheme();
  const { leaveAt, arriveAt } = buildTimeline(steps, startMins);
  const total = arriveAt - leaveAt;
  return (
    <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
      <View style={styles.planHeader}>
        <Text style={[styles.planTimes, { color: theme.colors.onSurface }]}>{hhmm(leaveAt)} – {hhmm(arriveAt)}</Text>
        <Text style={[styles.planTotal, { color: theme.colors.onSurface }]}>
          {total >= 60 ? `${Math.floor(total / 60)} sa ${total % 60} dk` : `${total} dk`}
        </Text>
      </View>
      <JourneyTimeline steps={steps} startMins={startMins} originName={originName} destinationName={destinationName} />
      <Text style={[styles.planNote, { color: theme.colors.onSurfaceVariant }]}>
        Saatler canlı veri ve tarifeye göre tahminidir; birkaç dakika sapabilir.
      </Text>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  scroll: { padding: 20, gap: 16, paddingBottom: 40 },
  card: { borderRadius: 16, padding: 20, gap: 16 },
  lineHeader: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  lineBadge: {
    width: 60,
    height: 60,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lineNumber: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  lineName: { fontSize: 17, fontWeight: '700' },
  lineSubtitle: { fontSize: 13, marginTop: 2 },
  divider: {},
  statsGrid: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center', gap: 4 },
  statValue: { fontSize: 16, fontWeight: '700' },
  statLabel: { fontSize: 12 },
  crowdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  crowdLabel: { fontSize: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '600' },
  transferRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  transferBadge: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transferLine: { fontSize: 14, fontWeight: '700' },
  transferInfo: { gap: 2 },
  transferStop: { fontSize: 15, fontWeight: '500' },
  transferWait: { fontSize: 13 },
  weatherAlert: { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  weatherAlertText: { flex: 1, gap: 3 },
  weatherAlertTitle: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  weatherAlertSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12 },
  startBtn: { borderRadius: 12 },
  startBtnContent: { height: 56 },
  startBtnLabel: { fontSize: 16, fontWeight: '700' },
  mapBtn: { borderRadius: 12 },
  infoAlert: { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  mapPreview: { height: 200, borderRadius: 16, overflow: 'hidden' },
  mapWeb: { flex: 1 },
  mapExpand: { position: 'absolute', top: 10, right: 10, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', elevation: 3 },
  infoChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  infoChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  infoChipText: { fontSize: 12, fontWeight: '600' },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  planTimes: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  planTotal: { fontSize: 16, fontWeight: '600' },
  planNote: { fontSize: 12 },
});
