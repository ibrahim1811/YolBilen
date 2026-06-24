import React, { useState, useEffect, useCallback } from 'react';
import { trackScreenView, trackStopOpen } from '../services/telemetry/telemetryService';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Text, useTheme, Appbar, Surface, Chip, Button, Snackbar, Divider, ActivityIndicator } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ArrivalRow } from '../components/stop/ArrivalRow';
import { useFavorites } from '../hooks/useFavorites';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps, NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, StopArrival } from '../types';
import { t } from '../i18n';
import { getApproachingBuses, nearestIztekStopId, minsFromRemainingStops } from '../services/iztek/iztekService';
import { getNextArrivalMins } from '../services/firebase/scheduleService';
import { getRouteName } from '../data/gtfsData';
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
  const [refreshing, setRefreshing] = useState(false);
  const [snackbar, setSnackbar] = useState('');
  const [countdown, setCountdown] = useState(30);
  const [hourlyData, setHourlyData] = useState<number[]>(new Array(24).fill(0));

  const isFavorited = favoriteLocations.some((f) => f.location.name === stopName);

  const loadArrivals = useCallback(async () => {
    const iztekId = nearestIztekStopId(latitude, longitude);
    if (!iztekId) {
      const fallback: StopArrival[] = (lines ?? [])
        .map(lineNum => {
          const lineName = getRouteName(lineNum) ?? `Hat ${lineNum}`;
          const mins = getNextArrivalMins(lineNum);
          return {
            lineNumber: lineNum,
            lineName,
            minutesAway: mins,
            direction: lineName.split(' - ')[1] ?? 'Son Durak',
          };
        })
        .filter(a => a.minutesAway < 999)
        .sort((a, b) => a.minutesAway - b.minutesAway);
      setArrivals(fallback);
      return;
    }
    const buses = await getApproachingBuses(iztekId);
    const mapped: StopArrival[] = buses.map(b => {
      return {
        lineNumber: String(b.hatNumarasi),
        lineName: b.hatAdi || getRouteName(String(b.hatNumarasi)) || `Hat ${b.hatNumarasi}`,
        minutesAway: minsFromRemainingStops(b.kalanDurakSayisi),
        direction: b.hatAdi.split(' - ')[1] ?? 'Son Durak',
      };
    });
    setArrivals(mapped);
  }, [latitude, longitude, lines]);

  useEffect(() => {
    if (!lines || lines.length === 0) return;
    Promise.all(lines.slice(0, 3).map(l => getLineFeedbacks(l))).then(results => {
      const counts = new Array(24).fill(0);
      results.flat().forEach(f => { counts[f.timestamp.getHours()]++; });
      setHourlyData(counts);
    }).catch(() => {});
  }, [lines?.join(',')]);

  useEffect(() => {
    loadArrivals();
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { loadArrivals(); return 30; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [loadArrivals]);

  async function handleRefresh() {
    setRefreshing(true);
    loadArrivals();
    setCountdown(30);
    setRefreshing(false);
  }

  async function handleToggleFavorite() {
    if (isFavorited) {
      const fav = favoriteLocations.find((f) => f.location.name === stopName);
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
        {/* Durak Hero */}
        <Surface style={[styles.heroCard, { backgroundColor: theme.colors.surface }]} elevation={2}>
          <View style={[styles.heroIcon, { backgroundColor: theme.colors.primaryContainer }]}>
            <MaterialCommunityIcons name="bus-stop" size={36} color={theme.colors.primary} />
          </View>
          <Text style={[styles.stopName, { color: theme.colors.onSurface }]}>{stopName}</Text>
          <Text style={[styles.stopCoords, { color: theme.colors.onSurfaceVariant }]}>
            {latitude.toFixed(4)}, {longitude.toFixed(4)}
          </Text>

          <Button
            mode={isFavorited ? 'outlined' : 'contained-tonal'}
            onPress={handleToggleFavorite}
            icon={isFavorited ? 'star' : 'star-outline'}
            style={styles.favBtn}
            compact
          >
            {isFavorited ? t('stop_remove_favorite') : t('stop_add_favorite')}
          </Button>
        </Surface>

        {/* Geçen Hatlar */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
            {t('stop_passing_lines')}
          </Text>
          <View style={styles.lineChips}>
            {(lines ?? []).map((lineNum) => (
              <Chip
                key={lineNum}
                onPress={() => nav.navigate('LineDetail', {
                  lineNumber: lineNum,
                  lineName: lineNum,
                })}
                style={[styles.lineChip, { backgroundColor: theme.colors.primaryContainer }]}
                textStyle={[styles.lineChipText, { color: theme.colors.primary }]}
              >
                {lineNum}
              </Chip>
            ))}
          </View>
        </View>

        {/* Yaklaşan Araçlar */}
        <Surface style={[styles.arrivalsCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <View style={styles.arrivalsHeader}>
            <View style={styles.arrivalsTitle}>
              <MaterialCommunityIcons name="bus-clock" size={20} color={theme.colors.primary} />
              <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                {t('stop_arrivals')}
              </Text>
            </View>
            <View style={[styles.countdown, { backgroundColor: theme.colors.surfaceVariant }]}>
              <MaterialCommunityIcons name="refresh" size={12} color={theme.colors.onSurfaceVariant} />
              <Text style={[styles.countdownText, { color: theme.colors.onSurfaceVariant }]}>
                {countdown}s
              </Text>
            </View>
          </View>

          <Divider />

          {arrivals.length === 0 ? (
            <View style={styles.emptyArrivals}>
              <MaterialCommunityIcons name="bus-alert" size={32} color={theme.colors.onSurfaceVariant} />
              <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
                {t('stop_no_arrivals')}
              </Text>
            </View>
          ) : (
            <View style={styles.arrivalsList}>
              {arrivals.map((a, i) => (
                <View key={`${a.lineNumber}-${i}`} style={styles.arrivalRowWrap}>
                  <View style={styles.arrivalRowFlex}>
                    <ArrivalRow
                      arrival={a}
                      onPress={() => nav.navigate('LineDetail', {
                        lineNumber: a.lineNumber,
                        lineName: a.lineName,
                      })}
                    />
                  </View>
                  <Chip
                    icon="bell-outline"
                    compact
                    onPress={async () => {
                      const { status } = await Notifications.requestPermissionsAsync();
                      if (status !== 'granted') { setSnackbar('Bildirim izni verilmedi.'); return; }
                      const secs = Math.max(30, (a.minutesAway - 2) * 60);
                      await Notifications.scheduleNotificationAsync({
                        content: {
                          title: `${a.lineNumber} Hattı Geliyor`,
                          body: `${stopName} durağına ~${a.minutesAway} dakika kaldı.`,
                          sound: true,
                        },
                        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: secs },
                      });
                      setSnackbar(`${a.lineNumber} için hatırlatıcı kuruldu.`);
                    }}
                    style={styles.bellChip}
                  >
                    Hatırlat
                  </Chip>
                </View>
              ))}
            </View>
          )}
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
  scroll: { padding: 20, gap: 16, paddingBottom: 40 },
  heroCard: { borderRadius: 20, padding: 24, alignItems: 'center', gap: 12 },
  heroIcon: { width: 72, height: 72, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  stopName: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  stopCoords: { fontSize: 12 },
  favBtn: { borderRadius: 20, marginTop: 4 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '600' },
  lineChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  lineChip: { height: 36 },
  lineChipText: { fontWeight: '800', fontSize: 15 },
  arrivalsCard: { borderRadius: 16, overflow: 'hidden' },
  arrivalsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  arrivalsTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countdown: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  countdownText: { fontSize: 12, fontWeight: '600' },
  arrivalsList: { paddingHorizontal: 16 },
  arrivalRowWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  arrivalRowFlex: { flex: 1 },
  bellChip: { flexShrink: 0 },
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
