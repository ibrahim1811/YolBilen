import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { FavoriteLocation, FavoriteType } from '../../types';

const typeConfig: Record<FavoriteType, { icon: string; color: string; defaultLabel: string }> = {
  home: { icon: 'home', color: '#34A853', defaultLabel: 'Ev' },
  work: { icon: 'briefcase', color: '#1A73E8', defaultLabel: 'İş' },
  school: { icon: 'school', color: '#FBBC04', defaultLabel: 'Okul' },
  custom: { icon: 'map-marker', color: '#9C27B0', defaultLabel: 'Konum' },
  line: { icon: 'bus', color: '#FF6D00', defaultLabel: 'Hat' },
};

interface Props {
  favorite: FavoriteLocation;
  onPress: () => void;
  onLongPress?: () => void;
}

export function FavoriteLocationCard({ favorite, onPress, onLongPress }: Props) {
  const theme = useTheme();
  const cfg = typeConfig[favorite.type];

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.colors.surface }]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.75}
    >
      <View style={[styles.iconWrap, { backgroundColor: cfg.color + '18' }]}>
        <MaterialCommunityIcons name={cfg.icon as any} size={22} color={cfg.color} />
      </View>
      <Text style={[styles.label, { color: theme.colors.onSurface }]} numberOfLines={1}>
        {favorite.label}
      </Text>
      <Text style={[styles.sub, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
        {favorite.location.name}
      </Text>
    </TouchableOpacity>
  );
}

interface AddCardProps {
  onPress: () => void;
}

export function AddFavoriteCard({ onPress }: AddCardProps) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      style={[styles.card, styles.addCard, { borderColor: theme.colors.outline }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[styles.iconWrap, { backgroundColor: theme.colors.surfaceVariant }]}>
        <MaterialCommunityIcons name="plus" size={22} color={theme.colors.onSurfaceVariant} />
      </View>
      <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>Ekle</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 90,
    padding: 10,
    borderRadius: 14,
    alignItems: 'center',
    gap: 6,
    elevation: 1,
  },
  addCard: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    elevation: 0,
    backgroundColor: 'transparent',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  sub: {
    fontSize: 10,
    textAlign: 'center',
  },
});
