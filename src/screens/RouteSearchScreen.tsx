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
import { useCappedInterstitialAd } from '../hooks/useCappedInterstitialAd';
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

export function RouteSearchScreen({ navigation }: Props) {
  const theme = useTheme();
  const { origin, destination, routes, setRoutes, setSelectedRoute, isLoading, setLoading, allowLongWalk } = useAppStore();
  const nightSafeMode = useAppStore(s => s.nightSafeMode);
  const [filterMode, setFilterMode] = useState<RouteFilterMode>('fastest');
  const [searchError, setSearchError] = useState<string | null>(null);
  const h = new Date().getHours();
  const isNight = h >= 22 || h < 6;
  const { maybeShow: maybeShowInterstitial } = useCappedInterstitialAd();

  useEffect(() => { trackScreenView('RouteSearch'); }, []);

  useEffect(() => {
    if (!origin || !destination) return;
    let cancelled = false;
    setLoading(true);
    setSearchError(null);
    findRoutes(origin, destination, { allowLongWalk, filterMode })
      .then(async r => {
        if (cancelled) return;
        if (r.length > 0) {
          const hasLive = r.some(route => (route.confidence ?? 0) > 70);
          void saveRouteCache(origin, destination, r, hasLive ? 'realtime' : 'static');
          maybeShowInterstitial();
        }
        setRoutes(r);
      })
      .catch(async () => {
        if (cancelled) return;
        const cached = await loadRouteCache(origin, destination);
        if (cached) {
          setRoutes(cached);
        } else {
          setRoutes([]);
          setSearchError('Rotalar yüklenemedi. İnternet bağlantınızı kontrol edin.');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [origin, destination]);

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
              findRoutes(origin, destination, { allowLongWalk, filterMode })
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
        removeClippedSubviews
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
  filterRow: { paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
  filterChip: { marginRight: 4, height: 36 },
  filterChipSelected: { backgroundColor: '#E8F0FE' },
  list: { padding: 16, paddingTop: 4, gap: 4 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16 },
});
