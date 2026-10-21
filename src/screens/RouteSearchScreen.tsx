import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { trackScreenView, trackRouteSearch } from '../services/telemetry/telemetryService';
import { View, StyleSheet, FlatList, ScrollView } from 'react-native';
import { Text, useTheme, Appbar, Chip } from 'react-native-paper'; // Chip: filter chips için gerekli
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { RouteCard } from '../components/route/RouteCard';
import { SkeletonCard } from '../components/common/SkeletonCard';
import { ErrorView } from '../components/common/ErrorView';
import { useAppStore } from '../store/useAppStore';
import { findRoutes, sortRoutes } from '../services/gtfs/routingService';
import { saveRouteCache, loadRouteCache } from '../services/cache/routeCache';
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

type DepartOption = 'now' | 'in30' | 'in60' | 'tomorrow8';

const DEPART_OPTIONS: { key: DepartOption; label: string }[] = [
  { key: 'now', label: 'Şimdi' },
  { key: 'in30', label: '+30 dk' },
  { key: 'in60', label: '+1 saat' },
  { key: 'tomorrow8', label: 'Yarın 08:00' },
];

function departDate(opt: DepartOption): Date | undefined {
  const now = new Date();
  if (opt === 'in30') return new Date(now.getTime() + 30 * 60_000);
  if (opt === 'in60') return new Date(now.getTime() + 60 * 60_000);
  if (opt === 'tomorrow8') return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 8, 0);
  return undefined;
}

export function RouteSearchScreen({ navigation }: Props) {
  const theme = useTheme();
  const { origin, destination, routes, setRoutes, setSelectedRoute, isLoading, setLoading, allowLongWalk } = useAppStore();
  const nightSafeMode = useAppStore(s => s.nightSafeMode);
  const [filterMode, setFilterMode] = useState<RouteFilterMode>('fastest');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [departOpt, setDepartOpt] = useState<DepartOption>('now');
  const h = new Date().getHours();
  const isNight = h >= 22 || h < 6;

  useEffect(() => { trackScreenView('RouteSearch'); }, []);

  useEffect(() => {
    if (!origin || !destination) return;
    let cancelled = false;
    setLoading(true);
    setSearchError(null);
    findRoutes(origin, destination, { allowLongWalk, filterMode, departAt: departDate(departOpt) })
      .then(async r => {
        if (cancelled) return;
        if (r.length > 0 && departOpt === 'now') {
          const hasLive = r.some(route => (route.confidence ?? 0) > 70);
          void saveRouteCache(origin, destination, r, hasLive ? 'realtime' : 'static');
        }
        setRoutes(r);
      })
      .catch(async e => {
        if (cancelled) return;
        console.warn('[RouteSearch] rota aranamadı:', e);
        const cached = departOpt === 'now' ? await loadRouteCache(origin, destination) : null;
        if (cancelled) return;
        if (cached) {
          setRoutes(cached);
        } else {
          setRoutes([]);
          setSearchError('Rotalar yüklenemedi. İnternet bağlantınızı kontrol edin.');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [origin, destination, departOpt]);

  useEffect(() => () => { setLoading(false); }, []);

  const sorted = useMemo(() => sortRoutes(routes, filterMode), [routes, filterMode]);

  const renderRoute = useCallback(({ item }: { item: Route }) => (
    <RouteCard
      route={item}
      onPress={() => {
        setSelectedRoute(item);
        trackRouteSearch(origin?.name ?? '', destination?.name ?? '');
        navigation.navigate('RouteResults', { origin: origin!, destination: destination! });
      }}
    />
  ), [origin, destination, navigation, setSelectedRoute]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header style={{ backgroundColor: theme.colors.background }} elevated={false}>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Rota Seçin" titleStyle={styles.headerTitle} />
        {isNight && nightSafeMode && (
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

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.filterRow}>
        <MaterialCommunityIcons name="clock-outline" size={18} color={theme.colors.onSurfaceVariant} />
        {DEPART_OPTIONS.map(o => (
          <Chip
            key={o.key}
            compact
            selected={departOpt === o.key}
            onPress={() => setDepartOpt(o.key)}
            style={departOpt === o.key ? { backgroundColor: theme.colors.secondaryContainer } : undefined}
            showSelectedOverlay
          >
            {o.label}
          </Chip>
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.filterRow}>
        {FILTERS.map(f => (
          <Chip
            key={f.mode}
            compact
            selected={filterMode === f.mode}
            onPress={() => setFilterMode(f.mode)}
            icon={f.icon}
            style={filterMode === f.mode ? { backgroundColor: theme.colors.primaryContainer } : undefined}
            selectedColor={filterMode === f.mode ? theme.colors.primary : undefined}
            showSelectedOverlay
          >
            {f.label}
          </Chip>
        ))}
      </ScrollView>

      {isLoading ? (
        <View style={styles.list}>
          <SkeletonCard lines={3} height={100} />
          <SkeletonCard lines={3} height={100} />
          <SkeletonCard lines={3} height={100} />
        </View>
      ) : searchError && sorted.length === 0 ? (
        <ErrorView
          message={searchError}
          onRetry={() => {
            if (origin && destination) {
              setSearchError(null);
              setLoading(true);
              findRoutes(origin, destination, { allowLongWalk, filterMode, departAt: departDate(departOpt) })
                .then(r => { if (r.length > 0) { const hasLive = r.some(x => (x.confidence ?? 0) > 70); void saveRouteCache(origin, destination, r, hasLive ? 'realtime' : 'static'); } setRoutes(r); })
                .catch(() => setSearchError('Rotalar yüklenemedi. İnternet bağlantınızı kontrol edin.'))
                .finally(() => setLoading(false));
            }
          }}
        />
      ) : null}
      <FlatList
        data={isLoading || (searchError !== null && sorted.length === 0) ? [] : sorted}
        keyExtractor={r => r.id}
        contentContainerStyle={styles.list}
        renderItem={renderRoute}
        maxToRenderPerBatch={4}
        windowSize={5}
        initialNumToRender={3}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="bus-alert" size={48} color={theme.colors.onSurfaceVariant} />
              <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>Rota bulunamadı</Text>
            </View>
          ) : null
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
  chipScroll: { flexGrow: 0, flexShrink: 0 },
  filterRow: { paddingHorizontal: 16, paddingBottom: 8, gap: 8, alignItems: 'center' },
  list: { padding: 16, paddingTop: 4, gap: 4, flexGrow: 0, justifyContent: 'flex-start' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16 },
});
