import React, { useEffect } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Text, useTheme, Appbar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { RouteCard } from '../components/route/RouteCard';
import { LoadingOverlay } from '../components/common/LoadingOverlay';
import { useAppStore } from '../store/useAppStore';
import { findRoutes } from '../services/gtfs/routingService';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'RouteSearch'>;

export function RouteSearchScreen({ navigation }: Props) {
  const theme = useTheme();
  const { origin, destination, routes, setRoutes, setSelectedRoute, isLoading, setLoading } =
    useAppStore();

  useEffect(() => {
    if (!origin || !destination) return;
    setLoading(true);
    setTimeout(() => {
      setRoutes(findRoutes(origin, destination));
      setLoading(false);
    }, 1200);
  }, []);

  if (isLoading) return <LoadingOverlay message="Rotalar aranıyor..." />;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header style={{ backgroundColor: theme.colors.background }} elevated={false}>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Rota Seçin" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <View style={styles.routeInfo}>
        <View style={styles.locationRow}>
          <MaterialCommunityIcons name="map-marker" size={16} color="#34A853" />
          <Text style={[styles.locationText, { color: theme.colors.onSurface }]} numberOfLines={1}>
            {origin?.name}
          </Text>
        </View>
        <MaterialCommunityIcons
          name="arrow-down"
          size={16}
          color={theme.colors.onSurfaceVariant}
          style={styles.arrow}
        />
        <View style={styles.locationRow}>
          <MaterialCommunityIcons name="map-marker-check" size={16} color={theme.colors.primary} />
          <Text style={[styles.locationText, { color: theme.colors.onSurface }]} numberOfLines={1}>
            {destination?.name}
          </Text>
        </View>
      </View>

      <FlatList
        data={routes}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <RouteCard
            route={item}
            onPress={() => {
              setSelectedRoute(item);
              navigation.navigate('RouteResults', { origin: origin!, destination: destination! });
            }}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons
              name="bus-alert"
              size={48}
              color={theme.colors.onSurfaceVariant}
            />
            <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
              Rota bulunamadı
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  routeInfo: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationText: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  arrow: { marginLeft: 4 },
  list: { padding: 20, paddingTop: 8 },
  empty: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 12,
  },
  emptyText: { fontSize: 16 },
});
