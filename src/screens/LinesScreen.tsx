import React from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Text, Surface, useTheme, Searchbar, Chip, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFavorites } from '../hooks/useFavorites';
import { useAppStore } from '../store/useAppStore';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { IZMIR_ROUTES } from '../data/izmir-routes';

const typeConfig: Record<string, { icon: string; color: string; label: string }> = {
  bus: { icon: 'bus', color: '#1A73E8', label: 'Otobüs' },
};

export function LinesScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user = useAppStore((s) => s.user);
  const { isLineFavorited, addLine, removeLine, favoriteLines } = useFavorites();
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState<string | null>(null);

  const allLines = React.useMemo(() => IZMIR_ROUTES.map(r => ({
    number: r.lineNumber,
    name: r.lineName,
    type: 'bus' as const,
    crowdAvg: 'medium' as const,
  })), []);

  function handleToggleFavorite(lineNumber: string, lineName: string) {
    const existing = favoriteLines.find((l) => l.lineNumber === lineNumber);
    if (existing) {
      removeLine(existing.id);
    } else {
      addLine(lineNumber, lineName);
    }
  }

  const filtered = allLines.filter((l) => {
    const matchSearch =
      l.number.toLowerCase().includes(search.toLowerCase()) ||
      l.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === null || l.type === filter;
    return matchSearch && matchFilter;
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>Hatlar</Text>
        <Searchbar
          placeholder="Hat ara..."
          value={search}
          onChangeText={setSearch}
          style={[styles.searchbar, { backgroundColor: theme.colors.surfaceVariant }]}
          inputStyle={{ fontSize: 14 }}
          elevation={0}
        />
        <View style={styles.filters}>
          {(Object.keys(typeConfig) as string[]).map((type) => (
            <Chip
              key={type}
              selected={filter === type}
              onPress={() => setFilter(filter === type ? null : type)}
              icon={typeConfig[type].icon}
              style={filter === type ? { backgroundColor: theme.colors.primaryContainer } : undefined}
              textStyle={{ fontSize: 12 }}
            >
              {typeConfig[type].label}
            </Chip>
          ))}
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.number}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const cfg = typeConfig[item.type];
          return (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => navigation.navigate('LineDetail', { lineNumber: item.number, lineName: item.name })}
            >
            <Surface
              style={[styles.lineCard, { backgroundColor: theme.colors.surface }]}
              elevation={1}
            >
              <View style={[styles.lineIcon, { backgroundColor: cfg.color + '20' }]}>
                <MaterialCommunityIcons name={cfg.icon as any} size={22} color={cfg.color} />
              </View>
              <View style={styles.lineInfo}>
                <Text style={[styles.lineNumber, { color: theme.colors.onSurface }]}>
                  {item.number}
                </Text>
                <Text style={[styles.lineName, { color: theme.colors.onSurfaceVariant }]}>
                  {item.name}
                </Text>
              </View>
              {!user?.isGuest && (
                <IconButton
                  icon={isLineFavorited(item.number) ? 'star' : 'star-outline'}
                  iconColor={isLineFavorited(item.number) ? '#FBBC04' : theme.colors.onSurfaceVariant}
                  size={20}
                  onPress={() => handleToggleFavorite(item.number, item.name)}
                />
              )}
            </Surface>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 16, gap: 12 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  searchbar: { borderRadius: 12 },
  filters: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', paddingBottom: 4 },
  list: { padding: 20, paddingTop: 8, gap: 10 },
  lineCard: {
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  lineIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lineInfo: { flex: 1, gap: 4 },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineNumber: { fontSize: 16, fontWeight: '700' },
  typeChip: { height: 24 },
  lineName: { fontSize: 13 },
});
