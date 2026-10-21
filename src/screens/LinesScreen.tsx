import React, { useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { Text, Surface, useTheme, Searchbar, TextInput } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFavorites } from '../hooks/useFavorites';
import { useAppStore } from '../store/useAppStore';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { getAllLines, getLineColor, getLineMode, TRANSIT_MODE_ICON } from '../data/gtfsData';
import { normalizeSearch } from '../utils/searchText';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function LinesScreen() {
  const theme = useTheme();
  const navigation = useNavigation<Nav>();
  const user = useAppStore((s) => s.user);
  const { isLineFavorited, addLine, removeLine, favoriteLines } = useFavorites();
  const [search, setSearch] = React.useState('');
  const [plateSearch, setPlateSearch] = useState('');

  const allLines = useMemo(() => getAllLines(), []);

  const lowerSearch = normalizeSearch(search);

  const filteredLines = useMemo(
    () =>
      lowerSearch
        ? allLines.filter(
            l =>
              l.lineNum.includes(lowerSearch) ||
              normalizeSearch(l.name).includes(lowerSearch)
          )
        : allLines,
    [allLines, lowerSearch]
  );

  function handleToggleFavorite(lineNum: string, lineName: string) {
    const existing = favoriteLines.find(l => l.lineNumber === lineNum);
    if (existing) removeLine(existing.id).catch(e => { console.warn('[favori] güncellenemedi:', e); Alert.alert('İşlem başarısız', 'Favori güncellenemedi. Tekrar dene.'); });
    else addLine(lineNum, lineName).catch(e => { console.warn('[favori] güncellenemedi:', e); Alert.alert('İşlem başarısız', 'Favori güncellenemedi. Tekrar dene.'); });
  }

  function renderLine(item: { lineNum: string; name: string }) {
    const isFav = isLineFavorited(item.lineNum);
    return (
      <TouchableOpacity onPress={() => navigation.navigate('LineDetail', { lineNumber: item.lineNum, lineName: item.name })}>
        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <View style={[styles.badge, { backgroundColor: getLineColor(item.lineNum) ?? theme.colors.primaryContainer }]}>
            {getLineMode(item.lineNum) === 'bus' ? (
              <Text style={[styles.badgeText, { color: theme.colors.primary }]}>{item.lineNum}</Text>
            ) : (
              <MaterialCommunityIcons name={TRANSIT_MODE_ICON[getLineMode(item.lineNum)]} size={22} color="#FFF" />
            )}
          </View>
          <Text style={[styles.lineName, { color: theme.colors.onSurface }]} numberOfLines={1}>
            {item.name}
          </Text>
          {user && !user.isGuest && (
            <TouchableOpacity onPress={() => handleToggleFavorite(item.lineNum, item.name)}>
              <MaterialCommunityIcons
                name={isFav ? 'star' : 'star-outline'}
                size={20}
                color={isFav ? '#FBBC04' : theme.colors.onSurfaceVariant}
              />
            </TouchableOpacity>
          )}
        </Surface>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>Hatlar</Text>
        <Searchbar
          placeholder="Hat numarası veya adı ara..."
          value={search}
          onChangeText={setSearch}
          style={[styles.searchbar, { backgroundColor: theme.colors.surfaceVariant }]}
          inputStyle={{ fontSize: 14 }}
          elevation={0}
        />
        <TextInput
          label="Plaka ile otobüs ara (ör: 35 DB 1234)"
          value={plateSearch}
          onChangeText={t => setPlateSearch(t.toUpperCase())}
          mode="outlined"
          dense
          right={
            plateSearch.trim().length >= 5 ? (
              <TextInput.Icon
                icon="arrow-right"
                onPress={() => {
                  navigation.navigate('BusCard', { plate: plateSearch.trim() });
                  setPlateSearch('');
                }}
              />
            ) : undefined
          }
          autoCapitalize="characters"
          style={styles.plateInput}
        />
      </View>
      <FlatList
        data={filteredLines}
        keyExtractor={item => item.lineNum}
        renderItem={({ item }) => renderLine(item)}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        maxToRenderPerBatch={15}
        windowSize={7}
        initialNumToRender={20}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  searchbar: { borderRadius: 12 },
  plateInput: { backgroundColor: 'transparent' },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, minWidth: 44, alignItems: 'center' },
  badgeText: { fontSize: 13, fontWeight: '700' },
  lineName: { flex: 1, fontSize: 14 },
});
