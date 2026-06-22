import React, { useMemo } from 'react';
import { View, StyleSheet, SectionList, TouchableOpacity } from 'react-native';
import { Text, Surface, useTheme, Searchbar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFavorites } from '../hooks/useFavorites';
import { useAppStore } from '../store/useAppStore';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { getAllLines, getStops } from '../data/gtfsData';
import type { IzmirStop } from '../data/gtfsData';

type LineItem = { lineNum: string; name: string };
type SectionItem = LineItem | IzmirStop;
type Section = { title: string; data: SectionItem[]; type: 'line' | 'stop' };

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function LinesScreen() {
  const theme = useTheme();
  const navigation = useNavigation<Nav>();
  const user = useAppStore((s) => s.user);
  const { isLineFavorited, addLine, removeLine, favoriteLines } = useFavorites();
  const [search, setSearch] = React.useState('');

  const allLines = useMemo(() => getAllLines(), []);
  const allStops = useMemo(() => getStops(), []);

  const lowerSearch = search.toLowerCase();

  const filteredLines = useMemo(
    () =>
      lowerSearch
        ? allLines.filter(
            l =>
              l.lineNum.toLowerCase().includes(lowerSearch) ||
              l.name.toLowerCase().includes(lowerSearch)
          )
        : allLines,
    [allLines, lowerSearch]
  );

  const filteredStops = useMemo(
    () =>
      lowerSearch.length >= 2
        ? allStops
            .filter(s => s.name.toLowerCase().includes(lowerSearch))
            .slice(0, 50)
        : [],
    [allStops, lowerSearch]
  );

  const sections = useMemo((): Section[] => {
    const s: Section[] = [];
    if (filteredLines.length > 0) s.push({ title: 'HATLAR', data: filteredLines, type: 'line' });
    if (filteredStops.length > 0) s.push({ title: 'DURAKLAR', data: filteredStops, type: 'stop' });
    return s;
  }, [filteredLines, filteredStops]);

  function handleToggleFavorite(lineNum: string, lineName: string) {
    const existing = favoriteLines.find(l => l.lineNumber === lineNum);
    if (existing) removeLine(existing.id);
    else addLine(lineNum, lineName);
  }

  function renderLine(item: { lineNum: string; name: string }) {
    const isFav = isLineFavorited(item.lineNum);
    return (
      <TouchableOpacity onPress={() => navigation.navigate('LineDetail', { lineNumber: item.lineNum, lineName: item.name })}>
        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <View style={[styles.badge, { backgroundColor: theme.colors.primaryContainer }]}>
            <Text style={[styles.badgeText, { color: theme.colors.primary }]}>{item.lineNum}</Text>
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

  function renderStop(item: IzmirStop) {
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
          <Text style={[styles.lineName, { color: theme.colors.onSurface }]} numberOfLines={1}>
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
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>Hatlar & Duraklar</Text>
        <Searchbar
          placeholder="Hat veya durak ara..."
          value={search}
          onChangeText={setSearch}
          style={[styles.searchbar, { backgroundColor: theme.colors.surfaceVariant }]}
          inputStyle={{ fontSize: 14 }}
          elevation={0}
        />
      </View>
      <SectionList<SectionItem, Section>
        sections={sections}
        keyExtractor={(item, i) => ('lineNum' in item ? `l-${(item as LineItem).lineNum}` : `s-${(item as IzmirStop).id}-${i}`)}
        renderSectionHeader={({ section }) => (
          <Text style={[styles.sectionHeader, { color: theme.colors.onSurfaceVariant, backgroundColor: theme.colors.background }]}>
            {section.title}
          </Text>
        )}
        renderItem={({ item, section }) =>
          section.type === 'line'
            ? renderLine(item as LineItem)
            : renderStop(item as IzmirStop)
        }
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled
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
  sectionHeader: { fontSize: 11, fontWeight: '700', letterSpacing: 1, paddingVertical: 8 },
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
  stopId: { fontSize: 12 },
});
