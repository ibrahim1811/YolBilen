import React, { useState } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Text, Portal, Modal, Searchbar, useTheme, Divider } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getAllLines } from '../../data/gtfsData';
import { normalizeSearch } from '../../utils/searchText';

const ALL_LINES = getAllLines().map(r => ({ number: r.lineNum, name: r.name }));

interface Props {
  visible: boolean;
  onDismiss: () => void;
  onSelect: (lineNumber: string, lineName: string) => void;
}

export function LineSelectorModal({ visible, onDismiss, onSelect }: Props) {
  const theme = useTheme();
  const [search, setSearch] = useState('');

  const filtered = ALL_LINES.filter(
    (l) =>
      l.number.includes(normalizeSearch(search)) ||
      normalizeSearch(l.name).includes(normalizeSearch(search))
  );

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        style={styles.modalWrap}
        contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}
      >
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>Hat Seç</Text>
        <Searchbar
          placeholder="Hat numarası veya adı..."
          value={search}
          onChangeText={setSearch}
          style={[styles.search, { backgroundColor: theme.colors.surfaceVariant }]}
          elevation={0}
        />
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.number}
          style={styles.list}
          ItemSeparatorComponent={() => <Divider />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.item}
              onPress={() => { onSelect(item.number, item.name); onDismiss(); }}
              activeOpacity={0.7}
            >
              <View style={[styles.badge, { backgroundColor: theme.colors.primaryContainer }]}>
                <Text style={[styles.badgeText, { color: theme.colors.primary }]}>
                  {item.number}
                </Text>
              </View>
              <Text style={[styles.lineName, { color: theme.colors.onSurface }]}>{item.name}</Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.onSurfaceVariant} />
            </TouchableOpacity>
          )}
        />
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modalWrap: { justifyContent: 'flex-start' },
  modal: { marginHorizontal: 16, marginTop: 56, borderRadius: 20, padding: 20, maxHeight: '75%' },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 14 },
  search: { borderRadius: 12, marginBottom: 12 },
  list: { maxHeight: 400 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, minWidth: 44, alignItems: 'center' },
  badgeText: { fontWeight: '800', fontSize: 13 },
  lineName: { flex: 1, fontSize: 15 },
});
