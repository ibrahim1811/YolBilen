import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { t } from '../../i18n';
import type { StopArrival } from '../../types';

interface Props {
  arrival: StopArrival;
  onPress: () => void;
}

function arrivalColor(min: number): string {
  if (min <= 2) return '#D93025';
  if (min <= 5) return '#FBBC04';
  return '#34A853';
}

export function ArrivalRow({ arrival, onPress }: Props) {
  const theme = useTheme();
  const color = arrivalColor(arrival.minutesAway);
  const timeLabel = arrival.minutesAway <= 1
    ? t('stop_arrival_now')
    : t('stop_arrival_min')(arrival.minutesAway);

  return (
    <View style={[styles.row, { borderBottomColor: theme.colors.outline }]}>
      <View style={[styles.badge, { backgroundColor: theme.colors.primaryContainer }]}>
        <Text style={[styles.lineNum, { color: theme.colors.primary }]}>{arrival.lineNumber}</Text>
      </View>
      <View style={styles.info}>
        <Text style={[styles.direction, { color: theme.colors.onSurface }]} numberOfLines={1}>
          {arrival.direction}
        </Text>
        <Text style={[styles.lineName, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
          {arrival.lineName}
        </Text>
      </View>
      <View style={[styles.timeBadge, { backgroundColor: color + '18' }]}>
        <MaterialCommunityIcons name="bus-clock" size={14} color={color} />
        <Text style={[styles.time, { color }]}>{timeLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    minWidth: 48,
    alignItems: 'center',
  },
  lineNum: { fontWeight: '800', fontSize: 14 },
  info: { flex: 1, gap: 2 },
  direction: { fontSize: 14, fontWeight: '600' },
  lineName: { fontSize: 12 },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  time: { fontSize: 13, fontWeight: '700' },
});
