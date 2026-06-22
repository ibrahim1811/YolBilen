import React from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { Text, Surface, useTheme, Appbar, Chip, TouchableRipple } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { getStops, getStopRouteDirs } from '../data/gtfsData';
import { minsToArrivalLabel } from '../services/firebase/scheduleService';
import {
  getApproachingBuses,
  getLineBusPositions,
  estimateArrivalFromPosition,
  minsFromRemainingStops,
  nearestIztekStopId,
} from '../services/iztek/iztekService';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'NearbyStops'>;

interface NearbyStop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distanceMeters: number;
  lines: string[];
  nextArrivals: Array<{ line: string; mins: number }>;
}

function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}


export function NearbyStopsScreen({ navigation }: Props) {
  const theme = useTheme();
  const [stops, setStops] = React.useState<NearbyStop[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (!cancelled) { setError('Konum izni gerekli'); setLoading(false); }
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const userPt = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      const sr = getStopRouteDirs();
      const rawNearby = getStops()
        .map(s => ({ ...s, dist: haversineM(userPt, s) }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 20)
        .map(s => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, distanceMeters: Math.round(s.dist), lines: (sr[s.id] ?? []).map(d => d.lineNum).slice(0, 5) }));

      // İZTEK stop ID eşleşmesi + yaklaşan otobüs verisi paralel çekimi
      const uniqueLines = [...new Set(rawNearby.flatMap(s => s.lines))];
      const busMap = new Map<string, Awaited<ReturnType<typeof getLineBusPositions>>>();
      const approachMap = new Map<number, Awaited<ReturnType<typeof getApproachingBuses>>>();

      const iztekIds = rawNearby.map(s => nearestIztekStopId(s.lat, s.lon));

      await Promise.all([
        ...uniqueLines.map(async (l: string) => { busMap.set(l, await getLineBusPositions(l)); }),
        ...iztekIds.filter((id): id is number => id !== null).map(async (id) => {
          approachMap.set(id, await getApproachingBuses(id));
        }),
      ]);

      const nearby: NearbyStop[] = rawNearby.map((s, i) => {
        const iztekId = iztekIds[i];
        const approaching = iztekId ? (approachMap.get(iztekId) ?? []) : [];

        const nextArrivals = s.lines.map((l: string) => {
          // Öncelik: KalanDurakSayisi (en doğru)
          const approachBus = approaching.find(b => String(b.hatNumarasi) === l);
          if (approachBus) return { line: l, mins: minsFromRemainingStops(approachBus.kalanDurakSayisi) };
          // Fallback: GPS mesafesi
          const mins = estimateArrivalFromPosition(busMap.get(l) ?? [], s.lat, s.lon) ?? 99;
          return { line: l, mins };
        })
          .filter(a => a.mins < 90)
          .sort((a, b) => a.mins - b.mins)
          .slice(0, 3);

        return { id: s.id, name: s.name, lat: s.lat, lon: s.lon, distanceMeters: s.distanceMeters, lines: s.lines, nextArrivals };
      });
      if (!cancelled) { setStops(nearby); setLoading(false); }
    }
    load().catch(() => { if (!cancelled) { setError('Konum alınamadı'); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header style={{ backgroundColor: theme.colors.background }} elevated={false}>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Yakındaki Duraklar" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.onSurfaceVariant }]}>
            Konum alınıyor...
          </Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="map-marker-off" size={48} color={theme.colors.onSurfaceVariant} />
          <Text style={[styles.loadingText, { color: theme.colors.onSurfaceVariant }]}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={stops}
          keyExtractor={s => s.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableRipple
              onPress={() => navigation.navigate('StopDetail', {
                stop: { id: item.id, name: item.name, latitude: item.lat, longitude: item.lon, lines: item.lines },
              })}
              borderless
              style={styles.stopCardRipple}
            >
              <Surface style={[styles.stopCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
                <View style={styles.stopHeader}>
                  <View style={[styles.stopIcon, { backgroundColor: theme.colors.primaryContainer }]}>
                    <MaterialCommunityIcons name="bus-stop" size={20} color={theme.colors.primary} />
                  </View>
                  <View style={styles.stopInfo}>
                    <Text style={[styles.stopName, { color: theme.colors.onSurface }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.stopDist, { color: theme.colors.onSurfaceVariant }]}>
                      #{item.id} · {item.distanceMeters} m · {Math.max(1, Math.round(item.distanceMeters / 84))} dk yürüyüş
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.onSurfaceVariant} />
                </View>

                {item.nextArrivals.length > 0 && (
                  <>
                    <Text style={[styles.arrivalsLabel, { color: theme.colors.onSurfaceVariant }]}>
                      Yaklaşan Otobüsler
                    </Text>
                    <View style={styles.arrivalsRow}>
                      {item.nextArrivals.map(a => (
                        <View key={a.line} style={[styles.arrivalChip, { backgroundColor: theme.colors.primaryContainer }]}>
                          <MaterialCommunityIcons name="bus" size={13} color={theme.colors.primary} />
                          <Text style={[styles.arrivalLine, { color: theme.colors.primary }]}>{a.line}</Text>
                          <Text style={[styles.arrivalMins, { color: theme.colors.onSurfaceVariant }]}>
                            {minsToArrivalLabel(a.mins)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}

                {item.lines.length > 0 && (
                  <View style={styles.linesRow}>
                    {item.lines.map(l => (
                      <Chip
                        key={l}
                        compact
                        style={styles.lineChip}
                        textStyle={styles.lineChipText}
                        onPress={() => navigation.navigate('LineDetail', { lineNumber: l, lineName: l })}
                      >
                        {l}
                      </Chip>
                    ))}
                  </View>
                )}
              </Surface>
            </TouchableRipple>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 15 },
  list: { padding: 16, gap: 12 },
  stopCardRipple: { borderRadius: 16 },
  stopCard: { borderRadius: 16, padding: 16, gap: 12 },
  stopHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stopIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  stopInfo: { flex: 1, gap: 2 },
  stopName: { fontSize: 15, fontWeight: '600' },
  stopDist: { fontSize: 12 },
  arrivalsLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  arrivalsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  arrivalChip: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', flexDirection: 'row', gap: 4 },
  arrivalLine: { fontSize: 13, fontWeight: '700' },
  arrivalMins: { fontSize: 11 },
  linesRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  lineChip: { height: 26 },
  lineChipText: { fontSize: 11 },
});
