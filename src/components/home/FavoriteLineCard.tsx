import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { FavoriteLine } from '../../types';

interface Props {
  line: FavoriteLine;
  onPress: () => void;
  onRemove: () => void;
}

export function FavoriteLineCard({ line, onPress, onRemove }: Props) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.colors.surface }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
        <Text style={styles.badgeText}>{line.lineNumber}</Text>
      </View>
      <Text style={[styles.name, { color: theme.colors.onSurface }]} numberOfLines={1}>
        {line.lineName}
      </Text>
      <TouchableOpacity onPress={onRemove} hitSlop={8} style={styles.removeBtn}>
        <MaterialCommunityIcons name="close" size={16} color={theme.colors.onSurfaceVariant} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    elevation: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    minWidth: 36,
    alignItems: 'center',
  },
  badgeText: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  name: { flex: 1, fontSize: 14, fontWeight: '500' },
  removeBtn: { padding: 2 },
});
