import React, { useState, useEffect, useCallback, useRef } from 'react';
import { trackScreenView, trackStopOpen } from '../services/telemetry/telemetryService';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Text, useTheme, Appbar, Surface, Chip, Snackbar, Divider, ActivityIndicator, IconButton, SegmentedButtons } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ArrivalRow } from '../components/stop/ArrivalRow';
import { useFavorites } from '../hooks/useFavorites';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps, NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, StopArrival } from '../types';
import { t } from '../i18n';
import { getApproachingBuses, resolveIztekStopId, estimateArrivalMins, isWaitingAtTerminal, IztekError } from '../services/iztek/iztekService';
import { getScheduledArrivalForStopId } from '../services/gtfs/routingService';
import {
  getRouteName, getStopRouteDirs, getOrderedStopsForDir, getRailArrivalMins, getLineMode, lineTitle, stopMode, TRANSIT_MODE_ICON,
} from '../data/gtfsData';
import { getLineFeedbacks } from '../services/firebase/firestore';
import * as Notifications from 'expo-notifications';

type Props = NativeStackScreenProps<RootStackParamList, 'StopDetail'>;

export function StopDetailScreen({ navigation, route }: Props) {
  const theme = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { stopId, stopName, latitude, longitude, lines } = route.params;

  useEffect(() => { trackScreenView('StopDetail'); trackStopOpen(stopId); }, [stopId]);

  const { favoriteLocations, addLocation, removeLocation } = useFavorites();
  const [arrivals, setArrivals] = useState<StopArrival[]>([]);
  const [schedule, setSchedule] = useState<StopArrival[]>([]);
  const [tab, setTab] = useState<'live' | 'schedule'>('live');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [snackbar, setSnackbar] = useState('');
  const [countdown, setCountdown] = useState(30);
  const [hourlyData, setHourlyData] = useState<number[]>(new Array(24).fill(0));

  const isSameStop = (f: { location: { name: string; latitude: number; longitude: number } }) =>
    f.location.name === stopName &&
    Math.abs(f.location.latitude - latitude) < 0.0001 &&
    Math.abs(f.location.longitude - longitude) < 0.0001;

  const isFavorited = favoriteLocations.some(isSameStop);

  const stopLines = lines && lines.length > 0
    ? lines
    : [...new Set((getStopRouteDirs()[stopId] ?? []).map(d => d.lineNum))];
  const requestSeq = useRef(0);
  const isRailStop = stopMode(stopId) !== 'bus';

  const loadArrivals = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      await loadArrivalsInner(seq);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [stopId, latitude, longitude, stopLines.join(',')]);

  const loadArrivalsInner = async (seq: number) => {
    const scheduleFallback = (): StopArrival[] => stopLines
      .flatMap(lineNum => {
        const mins = getScheduledArrivalForStopId(lineNum, stopId);
        if (mins === null || mins > 120) return [];
        const lineName = getRouteName(lineNum) ?? `Hat ${lineNum}`;
        return [{
          lineNumber: lineNum,
          lineName,
          minutesAway: mins,
          direction: lineName.split(' - ')[1] ?? 'Son Durak',
          isLive: false,
        }];
      })
      .sort((a, b) => a.minutesAway - b.minutesAway);

    if (!isRailStop) setSchedule(scheduleFallback());

    if (isRailStop) {
      const rail = (
        (getStopRouteDirs()[stopId] ?? [])
          .flatMap(({ lineNum, dir }) => {
            const stops = getOrderedStopsForDir(lineNum, dir);
            if (stops[stops.length - 1]?.id === stopId) return [];
            const first = getRailArrivalMins(lineNum, dir, stopId);
            if (first === null || first > 180) return [];
            const second = getRailArrivalMins(lineNum, dir, stopId, first + 1);
            const base = {
              lineNumber: lineNum,
              lineName: lineTitle(lineNum),
              direction: `${stops[stops.length - 1]?.name ?? 'Son durak'} yönü`,
              isLive: false,
            };
            return second !== null && second <= 180
              ? [{ ...base, minutesAway: first }, { ...base, minutesAway: second }]
              : [{ ...base, minutesAway: first }];
          })
          .sort((a, b) => a.minutesAway - b.minutesAway)
      );
      setArrivals(rail);
      setSchedule(rail);
      return;
    }

    const iztekId = resolveIztekStopId(stopId, latitude, longitude);
    if (!iztekId) {
      setArrivals(scheduleFallback());
      return;
    }
    let buses;
    try {
      buses = await getApproachingBuses(iztekId);
    } catch (e) {
      if (seq !== requestSeq.current) return;
      console.warn('[StopDetail] canlı veri alınamadı:', e);
      setSnackbar(e instanceof IztekError && e.rateLimited
        ? 'Canlı veri limiti doldu, tarife gösteriliyor.'
        : 'Canlı veri alınamadı, tarife gösteriliyor.');
      setArrivals(scheduleFallback());
      return;
    }
    if (seq !== requestSeq.current) return;
    const mapped: StopArrival[] = buses
      .filter(b => !isWaitingAtTerminal(b, stopId))
      .map(b => ({
        lineNumber: String(b.hatNumarasi),
        lineName: b.hatAdi || getRouteName(String(b.hatNumarasi)) || `Hat ${b.hatNumarasi}`,
        minutesAway: estimateArrivalMins(b, stopId),
        direction: b.hatAdi.split(' - ')[1] ?? 'Son Durak',
        isLive: true,
        distanceM: b.mesafeM,
      }))
      .sort((a, b) => a.minutesAway - b.minutesAway);
    setArrivals(mapped);
  };

  useEffect(() => () => { requestSeq.current++; }, []);

  useEffect(() => {
    if (!lines || lines.length === 0) return;
    Promise.all(lines.slice(0, 3).map(l => getLineFeedbacks(l))).then(results => {
      const counts = new Array(24).fill(0);
      results.flat().forEach(f => { counts[f.timestamp.getHours()]++; });
      setHourlyData(counts);
    }).catch(e => console.warn('[StopDetail] yoğunluk verisi alınamadı:', e));
  }, [lines?.join(',')]);

  const isFocused = useIsFocused();
  useEffect(() => {
    if (!isFocused) return;
    loadArrivals();
    setCountdown(30);
    const interval = setInterval(() => setCountdown(c => (c <= 1 ? 30 : c - 1)), 1000);
    const refresh = setInterval(loadArrivals, 30_000);
    return () => { clearInterval(interval); clearInterval(refresh); };
  }, [loadArrivals, isFocused]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadArrivals();
    setCountdown(30);
    setRefreshing(false);
  }

  async function scheduleReminder(a: StopArrival) {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') { setSnackbar('Bildirim izni verilmedi.'); return; }
      const leadMins = Math.min(2, Math.max(0, a.minutesAway - 1));
      const secs = Math.max(30, (a.minutesAway - leadMins) * 60);
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${a.lineNumber} Hattı Geliyor`,
          body: leadMins > 0
            ? `${stopName} durağına ~${leadMins} dakika kaldı.`
            : `${stopName} durağına geliyor.`,
          sound: true,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: secs },
      });
      setSnackbar(`${a.lineNumber} için hatırlatıcı kuruldu.`);
    } catch (e) {
      console.warn('[StopDetail] hatırlatıcı kurulamadı:', e);
      setSnackbar('Hatırlatıcı kurulamadı.');
    }
  }

  async function handleToggleFavorite() {
    try {
      if (isFavorited) {
        const fav = favoriteLocations.find(isSameStop);
        if (fav) {
          await removeLocation(fav.id);
          setSnackbar(t('stop_remove_favorite'));
        }
      } else {
        await addLocation('custom', stopName, {
          name: stopName,
          latitude,
          longitude,
        });
        setSnackbar(t('stop_favorited'));
      }
    } catch {
      setSnackbar('İşlem başarısız oldu. Tekrar deneyin.');
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header style={{ backgroundColor: theme.colors.background }} elevated={false}>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={t('stop_title')} titleStyle={styles.headerTitle} />
        <Appbar.Action
          icon={isFavorited ? 'star' : 'star-outline'}
          iconColor={isFavorited ? '#FBBC04' : theme.colors.onSurfaceVariant}
          onPress={handleToggleFavorite}
        />
      </Appbar.Header>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Durak başlığı (kompakt) */}
        <View style={styles.stopHeader}>
          <MaterialCommunityIcons name={isRailStop ? TRANSIT_MODE_ICON[stopMode(stopId)] : 'bus-stop'} size={22} color={theme.colors.primary} />
          <Text style={[styles.stopName, { color: theme.colors.onSurface }]} numberOfLines={1}>{stopName}</Text>
          <Text style={[styles.stopNo, { color: theme.colors.onSurfaceVariant }]}>#{stopId}</Text>
        </View>

        {/* Geçen Hatlar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.lineChips}>
          {stopLines.map((lineNum) => (
            <Chip
              key={lineNum}
              compact
              onPress={() => nav.navigate('LineDetail', {
                lineNumber: lineNum,
                lineName: getRouteName(lineNum) ?? lineNum,
              })}
              icon={getLineMode(lineNum) === 'bus' ? undefined : TRANSIT_MODE_ICON[getLineMode(lineNum)]}
              style={{ backgroundColor: theme.colors.primaryContainer }}
              textStyle={[styles.lineChipText, { color: theme.colors.primary }]}
            >
              {getLineMode(lineNum) === 'ferry' ? getRouteName(lineNum) ?? lineNum : lineNum}
            </Chip>
          ))}
        </ScrollView>

        {!isRailStop && (
          <SegmentedButtons
            value={tab}
            onValueChange={v => setTab(v as 'live' | 'schedule')}
            buttons={[
              { value: 'live', label: 'Yaklaşan Araçlar', icon: 'bus-clock' },
              { value: 'schedule', label: 'En Yakın Kalkış', icon: 'calendar-clock' },
            ]}
          />
        )}

        <Surface style={[styles.arrivalsCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <View style={styles.arrivalsHeader}>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
              {tab === 'live' && !isRailStop ? t('stop_arrivals') : 'En yakın kalkışlar (tarife)'}
            </Text>
            <View style={styles.refreshRow}>
              <Text style={[styles.countdownText, { color: theme.colors.onSurfaceVariant }]}>{countdown}s</Text>
              {loading ? (
                <ActivityIndicator size={20} style={styles.refreshSpinner} />
              ) : (
                <IconButton icon="refresh" mode="contained-tonal" size={20} onPress={handleRefresh} style={styles.refreshBtn} />
              )}
            </View>
          </View>

          <Divider />

          {(() => {
            const list = tab === 'live' && !isRailStop ? arrivals : schedule;
            if (list.length === 0) {
              return (
                <View style={styles.emptyArrivals}>
                  <MaterialCommunityIcons name="bus-alert" size={32} color={theme.colors.onSurfaceVariant} />
                  <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
                    {loading ? 'Yükleniyor…' : t('stop_no_arrivals')}
                  </Text>
                </View>
              );
            }
            return (
              <View style={styles.arrivalsList}>
                {list.map((a, i) => (
                  <ArrivalRow
                    key={`${a.lineNumber}-${i}`}
                    arrival={a}
                    onPress={() => nav.navigate('LineDetail', {
                      lineNumber: a.lineNumber,
                      lineName: getRouteName(a.lineNumber) ?? a.lineName,
                    })}
                    onRemind={() => scheduleReminder(a)}
                  />
                ))}
              </View>
            );
          })()}
        </Surface>

        {/* Saatlik Yoğunluk */}
        {hourlyData.some(v => v > 0) && (() => {
          const peak = Math.max(...hourlyData);
          const activeHours = [7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22];
          return (
            <Surface style={[styles.peakCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
              <View style={styles.peakHeader}>
                <MaterialCommunityIcons name="chart-bar" size={18} color={theme.colors.primary} />
                <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Saatlik Yoğunluk</Text>
              </View>
              <View style={styles.peakBars}>
                {activeHours.map(h => {
                  const ratio = peak > 0 ? hourlyData[h] / peak : 0;
                  const color = ratio > 0.66 ? '#EA4335' : ratio > 0.33 ? '#FBBC04' : '#34A853';
                  return (
                    <View key={h} style={styles.peakCol}>
                      <View style={styles.peakBarWrap}>
                        <View style={[styles.peakBar, { height: Math.max(4, Math.round(ratio * 48)), backgroundColor: ratio > 0 ? color : theme.colors.surfaceVariant }]} />
                      </View>
                      <Text style={[styles.peakLabel, { color: theme.colors.onSurfaceVariant }]}>{h}</Text>
                    </View>
                  );
                })}
              </View>
            </Surface>
          );
        })()}
      </ScrollView>

      <Snackbar
        visible={snackbar !== ''}
        onDismiss={() => setSnackbar('')}
        duration={2500}
      >
        {snackbar}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  scroll: { padding: 16, gap: 12, paddingBottom: 40 },
  stopHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stopName: { flex: 1, fontSize: 17, fontWeight: '700' },
  stopNo: { fontSize: 13, fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: '600' },
  lineChips: { gap: 8 },
  lineChipText: { fontWeight: '800', fontSize: 14 },
  arrivalsCard: { borderRadius: 16, overflow: 'hidden' },
  arrivalsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 8, paddingVertical: 6 },
  refreshRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  refreshBtn: { margin: 0 },
  refreshSpinner: { margin: 10 },
  countdownText: { fontSize: 12, fontWeight: '600' },
  arrivalsList: { paddingHorizontal: 16 },
  peakCard: { borderRadius: 16, padding: 16, gap: 12 },
  peakHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  peakBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 64 },
  peakCol: { flex: 1, alignItems: 'center', gap: 3 },
  peakBarWrap: { height: 48, justifyContent: 'flex-end' },
  peakBar: { width: '100%', borderRadius: 3 },
  peakLabel: { fontSize: 8 },
  emptyArrivals: { padding: 32, alignItems: 'center', gap: 10 },
  emptyText: { fontSize: 14, textAlign: 'center' },
});
