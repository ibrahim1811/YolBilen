import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Location } from '../../types';

interface Props {
  label: string;
  value: Location | null;
  iconName: string;
  iconColor: string;
  onPress: () => void;
}

export function LocationInput({ label, value, iconName, iconColor, onPress }: Props) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: theme.colors.surfaceVariant }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <MaterialCommunityIcons name={iconName as any} size={20} color={iconColor} />
      <View style={styles.content}>
        <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>{label}</Text>
        <Text
          style={[
            styles.value,
            { color: value ? theme.colors.onSurface : theme.colors.onSurfaceVariant },
          ]}
          numberOfLines={1}
        >
          {value?.name ?? 'Konum seçin...'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    gap: 12,
  },
  content: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  value: {
    fontSize: 15,
    fontWeight: '500',
  },
});
