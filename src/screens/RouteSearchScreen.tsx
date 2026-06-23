import React, { useEffect, useState, useMemo } from 'react';
import { trackScreenView, trackRouteSearch } from '../services/telemetry/telemetryService';
import { View, StyleSheet, FlatList, ScrollView } from 'react-native';
import { Text, useTheme, Appbar, Chip } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { RouteCard } from '../components/route/RouteCard';
import { LoadingOverlay } from '../components/common/LoadingOverlay';
import { useAppStore } from '../store/useAppStore';
import { findRoutes, sortRoutes } from '../services/gtfs/routingService';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, RouteFilterMode, Route } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'RouteSearch'>;

const FILTERS: { mode: RouteFilterMode; label: string; icon: string }[] = [
  { mode: 'fastest', label: 'En Hızlı', icon: 'lightning-bolt' },
  { mode: 'comfortable', label: 'En Rahat', icon: 'seat-passenger' },
  { mode: 'cool', label: 'En Serin', icon: 'snowflake' },
  { mode: 'least_transfers', label: 'Az Aktarma', icon: 'transfer' },
  { mode: 'night_safe', label: 'Gece Güvenli', icon: 'shield-moon' },
];

async function scheduleArrivalNotification(route: Route) {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;
  const mins = Math.max(1, route.nextArrival - 2);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Hat ${route.lineNumber} geliyor!`,
      body: `${route.lineNumber} hattı yaklaşık 2 dakika içinde ${route.boardingStop?.name ?? 'durağınıza'} ulaşacak.`,
      sound: true,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: mins * 60 },
  });
}

export function RouteSearchScreen({ navigation }: Props) {
  const theme = useTheme();
  const { origin, destination, routes, setRoutes, setSelectedRoute, isLoading, setLoading } = useAppStore();
  const [filterMode, setFilterMode] = useState<RouteFilterMode>('fastest');
  const [notifiedRouteId, setNotifiedRouteId] = useState<string | null>(null);
  const h = new Date().getHours();
  const isNight = h >= 22 || h < 6;

  useEffect(() => { trackScreenView('RouteSearch'); }, []);

  useEffect(() => {
    if (!origin || !destination) return;
    let cancelled = false;
    setLoading(true);
    findRoutes(origin, destination)
      .then(r => { if (!cancelled) setRoutes(r); })
      .catch(() => { if (!cancelled) setRoutes([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [origin, destination]);

  useEffect(() => () => { setLoading(false); }, []);

  const sorted = useMemo(() => sortRoutes(routes, filterMode), [routes, filterMode]);

  if (isLoading) return <LoadingOverlay message="Rotalar aranıyor..." />;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header style={{ backgroundColor: theme.colors.background }} elevated={false}>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Rota Seçin" titleStyle={styles.headerTitle} />
        {isNight && (
          <MaterialCommunityIcons name="shield-moon" size={22} color={theme.colors.primary} style={{ marginRight: 12 }} />
        )}
      </Appbar.Header>

      <View style={styles.routeInfo}>
        <View style={styles.locationRow}>
          <MaterialCommunityIcons name="map-marker" size={16} color="#34A853" />
          <Text style={[styles.locationText, { color: theme.colors.onSurface }]} numberOfLines={1}>{origin?.name}</Text>
        </View>
        <MaterialCommunityIcons name="arrow-down" size={16} color={theme.colors.onSurfaceVariant} style={styles.arrow} />
        <View style={styles.locationRow}>
          <MaterialCommunityIcons name="map-marker-check" size={16} color={theme.colors.primary} />
          <Text style={[styles.locationText, { color: theme.colors.onSurface }]} numberOfLines={1}>{destination?.name}</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {FILTERS.map(f => (
          <Chip
            key={f.mode}
            selected={filterMode === f.mode}
            onPress={() => setFilterMode(f.mode)}
            icon={f.icon}
            style={[styles.filterChip, filterMode === f.mode && styles.filterChipSelected]}
            selectedColor="#1A73E8"
            showSelectedOverlay
          >
            {f.label}
          </Chip>
        ))}
      </ScrollView>

      <FlatList
        data={sorted}
        keyExtractor={r => r.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View>
            <RouteCard
              route={item}
              onPress={() => {
                setSelectedRoute(item);
                trackRouteSearch(origin?.name ?? '', destination?.name ?? '');
                navigation.navigate('RouteResults', { origin: origin!, destination: destination! });
              }}
            />
            <View style={styles.notifyRow}>
              <Chip
                icon={notifiedRouteId === item.id ? 'bell-check' : 'bell-outline'}
                onPress={async () => {
                  await scheduleArrivalNotification(item);
                  setNotifiedRouteId(item.id);
                }}
                compact
                style={[styles.notifyChip, notifiedRouteId === item.id && { backgroundColor: theme.colors.primaryContainer }]}
              >
                {notifiedRouteId === item.id ? 'Bildirim ayarlandı' : `${item.lineNumber} hattı gelince bildir`}
              </Chip>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="bus-alert" size={48} color={theme.colors.onSurfaceVariant} />
            <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>Rota bulunamadı</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  routeInfo: { paddingHorizontal: 20, paddingBottom: 8, gap: 4 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locationText: { fontSize: 14, fontWeight: '500', flex: 1 },
  arrow: { marginLeft: 4 },
  filterRow: { paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
  filterChip: { marginRight: 4, height: 36 },
  filterChipSelected: { backgroundColor: '#E8F0FE' },
  list: { padding: 16, paddingTop: 4, gap: 4 },
  notifyRow: { paddingHorizontal: 4, paddingBottom: 10 },
  notifyChip: { alignSelf: 'flex-start' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16 },
});
