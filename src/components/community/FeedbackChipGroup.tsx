import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Option {
  label: string;
  value: string;
  icon: string;
  color: string;
}

interface Props {
  title: string;
  icon: string;
  options: Option[];
  value: string;
  onChange: (v: string) => void;
}

export function FeedbackChipGroup({ title, icon, options, value, onChange }: Props) {
  const theme = useTheme();
  return (
    <View style={styles.group}>
      <View style={styles.header}>
        <MaterialCommunityIcons name={icon as any} size={18} color={theme.colors.primary} />
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>{title}</Text>
      </View>
      <View style={styles.chips}>
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? opt.color + '22' : theme.colors.surfaceVariant,
                  borderColor: selected ? opt.color : 'transparent',
                  borderWidth: 1.5,
                },
              ]}
              onPress={() => onChange(opt.value)}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons
                name={opt.icon as any}
                size={18}
                color={selected ? opt.color : theme.colors.onSurfaceVariant}
              />
              <Text
                style={[
                  styles.chipLabel,
                  { color: selected ? opt.color : theme.colors.onSurfaceVariant },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '600' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 50,
  },
  chipLabel: { fontSize: 14, fontWeight: '500' },
});
