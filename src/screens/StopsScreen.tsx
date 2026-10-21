import React, { useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Text, Surface, useTheme, Searchbar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { getStops } from '../data/gtfsData';
import type { IzmirStop } from '../data/gtfsData';
import { normalizeSearch } from '../utils/searchText';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function StopsScreen() {
  const theme = useTheme();
  const navigation = useNavigation<Nav>();
  const [search, setSearch] = useState('');

  const allStops = useMemo(() => getStops(), []);
  const query = normalizeSearch(search);

  const results = useMemo(() => {
    if (/^\d+$/.test(query)) return allStops.filter(s => s.id.startsWith(query)).slice(0, 50);
    if (query.length < 2) return [];
    return allStops.filter(s => normalizeSearch(s.name).includes(query)).slice(0, 50);
  }, [allStops, query]);

  function renderStop({ item }: { item: IzmirStop }) {
    return (
      <TouchableOpacity
        onPress={() =>
          navigation.navigate('StopDetail', {
            stopId: item.id,
            stopName: item.name,
            latitude: item.lat,
            longitude: item.lon,
          })
        }
      >
        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <MaterialCommunityIcons name="bus-stop" size={20} color={theme.colors.primary} />
          <Text style={[styles.stopName, { color: theme.colors.onSurface }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.stopId, { color: theme.colors.onSurfaceVariant }]}>#{item.id}</Text>
        </Surface>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>Duraklar</Text>
        <Searchbar
          placeholder="Durak adı veya numarası ara..."
          value={search}
          onChangeText={setSearch}
          style={[styles.searchbar, { backgroundColor: theme.colors.surfaceVariant }]}
          inputStyle={{ fontSize: 14 }}
          elevation={0}
        />
        <TouchableOpacity onPress={() => navigation.navigate('NearbyStops')} activeOpacity={0.85}>
          <Surface style={[styles.card, { backgroundColor: theme.colors.primaryContainer }]} elevation={0}>
            <MaterialCommunityIcons name="crosshairs-gps" size={20} color={theme.colors.primary} />
            <Text style={[styles.stopName, { color: theme.colors.primary, fontWeight: '600' }]}>Yakındaki Duraklar</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.primary} />
          </Surface>
        </TouchableOpacity>
      </View>
      <FlatList
        data={results}
        keyExtractor={(item, i) => `${item.id}-${i}`}
        renderItem={renderStop}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={[styles.empty, { color: theme.colors.onSurfaceVariant }]}>
            {query ? 'Durak bulunamadı.' : 'Durak adını ya da durak numarasını (ör. 40013) yaz.'}
          </Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  searchbar: { borderRadius: 12 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  stopName: { flex: 1, fontSize: 14 },
  stopId: { fontSize: 12 },
  empty: { textAlign: 'center', marginTop: 24, fontSize: 14 },
});
