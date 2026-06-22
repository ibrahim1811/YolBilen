import React, { useState, useEffect, useCallback } from 'react';
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

type Props = NativeStackScreenProps<RootStackParamList, 'StopDetail'>;

export function StopDetailScreen({ navigation, route }: Props) {
  const theme = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { stop } = route.params;

  const { favoriteLocations, addLocation, removeLocation } = useFavorites();
  const [arrivals, setArrivals] = useState<StopArrival[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [snackbar, setSnackbar] = useState('');
  const [countdown, setCountdown] = useState(30);

  const isFavorited = favoriteLocations.some((f) => f.location.name === stop.name);

  const loadArrivals = useCallback(async () => {
    const iztekId = nearestIztekStopId(stop.latitude, stop.longitude);
    if (!iztekId) {
      const fallback: StopArrival[] = (stop.lines ?? [])
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
  }, [stop.latitude, stop.longitude, stop.lines]);

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
      const fav = favoriteLocations.find((f) => f.location.name === stop.name);
      if (fav) {
        await removeLocation(fav.id);
        setSnackbar(t('stop_remove_favorite'));
      }
    } else {
      await addLocation('custom', stop.name, {
        name: stop.name,
        latitude: stop.latitude,
        longitude: stop.longitude,
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
          <Text style={[styles.stopName, { color: theme.colors.onSurface }]}>{stop.name}</Text>
          <Text style={[styles.stopCoords, { color: theme.colors.onSurfaceVariant }]}>
            {stop.latitude.toFixed(4)}, {stop.longitude.toFixed(4)}
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
            {stop.lines.map((lineNum) => (
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
                <ArrivalRow
                  key={`${a.lineNumber}-${i}`}
                  arrival={a}
                  onPress={() => nav.navigate('LineDetail', {
                    lineNumber: a.lineNumber,
                    lineName: a.lineName,
                  })}
                />
              ))}
            </View>
          )}
        </Surface>
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
  emptyArrivals: { padding: 32, alignItems: 'center', gap: 10 },
  emptyText: { fontSize: 14, textAlign: 'center' },
});
