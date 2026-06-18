import React, { useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Text, Portal, Modal, TextInput, Button, useTheme, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { searchStops } from '../../services/gtfs/stopService';
import type { Location as AppLocation } from '../../types';

interface Props {
  visible: boolean;
  title: string;
  onSelect: (location: AppLocation) => void;
  onDismiss: () => void;
}

const IZMIR_NEIGHBORHOODS: { name: string; lat: number; lon: number }[] = [
  { name: 'Konak', lat: 38.4189, lon: 27.1287 },
  { name: 'Alsancak', lat: 38.4382, lon: 27.1425 },
  { name: 'Bornova', lat: 38.4614, lon: 27.2194 },
  { name: 'Karşıyaka', lat: 38.4567, lon: 27.1108 },
  { name: 'Buca', lat: 38.3822, lon: 27.1794 },
  { name: 'Çiğli', lat: 38.5014, lon: 27.0736 },
  { name: 'Balçova', lat: 38.3939, lon: 27.0625 },
  { name: 'Narlıdere', lat: 38.3908, lon: 26.9997 },
  { name: 'Gaziemir', lat: 38.3219, lon: 27.1371 },
  { name: 'Şirinyer', lat: 38.3719, lon: 27.1456 },
  { name: 'Hatay', lat: 38.4086, lon: 27.1194 },
  { name: 'Bostanlı', lat: 38.4753, lon: 27.0875 },
  { name: 'Mavişehir', lat: 38.4897, lon: 27.0814 },
  { name: 'Bayraklı', lat: 38.4614, lon: 27.1608 },
  { name: 'Karabağlar', lat: 38.3742, lon: 27.1061 },
  { name: 'Çamdibi', lat: 38.3939, lon: 27.1464 },
  { name: 'Halkapınar', lat: 38.4431, lon: 27.1556 },
  { name: 'Üçyol', lat: 38.4133, lon: 27.1192 },
  { name: 'Göztepe', lat: 38.4094, lon: 27.1594 },
  { name: 'Evka', lat: 38.4211, lon: 27.2186 },
  { name: 'Işıkkent', lat: 38.4272, lon: 27.2011 },
  { name: 'Fahrettin Altay', lat: 38.4292, lon: 27.0750 },
  { name: 'Menderes', lat: 38.2553, lon: 27.1294 },
  { name: 'Torbalı', lat: 38.1617, lon: 27.3594 },
  { name: 'Kemalpaşa', lat: 38.4272, lon: 27.4256 },
  { name: 'Aliağa', lat: 38.7994, lon: 26.9742 },
  { name: 'Foça', lat: 38.6725, lon: 26.7553 },
  { name: 'Seferihisar', lat: 38.1983, lon: 26.8444 },
  { name: 'Güzelbahçe', lat: 38.3569, lon: 26.8939 },
  { name: 'Urla', lat: 38.3214, lon: 26.7650 },
  { name: 'Çeşme', lat: 38.3236, lon: 26.3039 },
];

type ResultItem =
  | { kind: 'neighborhood'; id: string; name: string; latitude: number; longitude: number }
  | { kind: 'stop'; id: string; name: string; latitude: number; longitude: number };

export function LocationPickerModal({ visible, title, onSelect, onDismiss }: Props) {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');

  const results = useMemo<ResultItem[]>(() => {
    if (search.length < 2) return [];
    const q = search.toLowerCase();

    const neighborhoods = IZMIR_NEIGHBORHOODS
      .filter(n => n.name.toLowerCase().includes(q))
      .map(n => ({ kind: 'neighborhood' as const, id: `n_${n.name}`, name: n.name, latitude: n.lat, longitude: n.lon }));

    const stops = searchStops(search)
      .map(s => ({ kind: 'stop' as const, id: s.id, name: s.name, latitude: s.latitude, longitude: s.longitude }));

    return [...neighborhoods, ...stops].slice(0, 35);
  }, [search]);

  const handleCurrentLocation = useCallback(async () => {
    setLocating(true);
    setError('');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Konum izni verilmedi.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 5000,
      } as any);
      onSelect({
        name: 'Mevcut Konumum',
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      handleClose();
    } catch {
      setError('Konum alınamadı. GPS açık mı?');
    } finally {
      setLocating(false);
    }
  }, [onSelect]);

  function handleClose() {
    setSearch('');
    setError('');
    onDismiss();
  }

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={handleClose}
        contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}
      >
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>{title}</Text>

        <Button
          mode="outlined"
          icon={locating ? undefined : 'crosshairs-gps'}
          onPress={handleCurrentLocation}
          disabled={locating}
          style={styles.locBtn}
          contentStyle={styles.locBtnContent}
        >
          {locating ? <ActivityIndicator size="small" /> : 'Mevcut Konumumu Kullan'}
        </Button>

        {error !== '' && (
          <Text style={[styles.error, { color: theme.colors.error }]}>{error}</Text>
        )}

        <TextInput
          label="Mahalle, durak veya durak no ara..."
          value={search}
          onChangeText={setSearch}
          mode="outlined"
          left={<TextInput.Icon icon="magnify" />}
          style={styles.input}
          autoFocus
        />

        {search.length >= 2 && results.length === 0 && (
          <Text style={[styles.empty, { color: theme.colors.onSurfaceVariant }]}>
            Sonuç bulunamadı
          </Text>
        )}

        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.item, { borderBottomColor: theme.colors.outline }]}
              onPress={() => {
                onSelect({ name: item.name, latitude: item.latitude, longitude: item.longitude });
                handleClose();
              }}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name={item.kind === 'neighborhood' ? 'map-marker-outline' : 'bus-stop'}
                size={18}
                color={item.kind === 'neighborhood' ? theme.colors.secondary : theme.colors.primary}
              />
              <View style={styles.itemContent}>
                <Text style={[styles.itemText, { color: theme.colors.onSurface }]} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.kind === 'stop' && (
                  <Text style={[styles.stopId, { color: theme.colors.onSurfaceVariant }]}>
                    Durak No: {item.id}
                  </Text>
                )}
                {item.kind === 'neighborhood' && (
                  <Text style={[styles.stopId, { color: theme.colors.onSurfaceVariant }]}>
                    Mahalle / Bölge
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: { margin: 20, borderRadius: 20, padding: 24, maxHeight: '85%' },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  locBtn: { borderRadius: 10, marginBottom: 12 },
  locBtnContent: { height: 44 },
  error: { fontSize: 13, marginBottom: 8 },
  input: { backgroundColor: 'transparent', marginBottom: 8 },
  empty: { fontSize: 14, textAlign: 'center', paddingVertical: 16 },
  list: { maxHeight: 340 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemContent: { flex: 1, gap: 2 },
  itemText: { fontSize: 14 },
  stopId: { fontSize: 11 },
});
