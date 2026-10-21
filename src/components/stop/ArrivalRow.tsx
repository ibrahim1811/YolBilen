import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { t } from '../../i18n';
import { getLineColor, getLineMode, TRANSIT_MODE_ICON } from '../../data/gtfsData';
import type { StopArrival } from '../../types';

interface Props {
  arrival: StopArrival;
  onPress: () => void;
}

function clockAfter(mins: number): string {
  const d = new Date(Date.now() + mins * 60_000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
  const isSchedule = arrival.isLive === false;
  const mode = getLineMode(arrival.lineNumber);
  const lineColor = getLineColor(arrival.lineNumber);
  const clock = isSchedule ? clockAfter(arrival.minutesAway) : null;

  return (
    <View style={[styles.row, { borderBottomColor: theme.colors.outline }]}>
      <View style={[styles.badge, { backgroundColor: lineColor ?? theme.colors.primaryContainer }]}>
        {mode === 'bus' ? (
          <Text style={[styles.lineNum, { color: theme.colors.primary }]}>{arrival.lineNumber}</Text>
        ) : (
          <>
            <MaterialCommunityIcons name={TRANSIT_MODE_ICON[mode]} size={16} color="#FFF" />
            {mode !== 'ferry' && (
              <Text style={[styles.lineNumSmall, { color: '#FFF' }]} numberOfLines={1}>
                {arrival.lineNumber.replace('İZBAN-', 'İZ')}
              </Text>
            )}
          </>
        )}
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
        <MaterialCommunityIcons name={isSchedule ? 'calendar-clock' : 'bus-clock'} size={14} color={color} />
        <Text style={[styles.time, { color }]}>{isSchedule ? `${timeLabel} · ${clock}` : timeLabel}</Text>
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
  lineNumSmall: { fontWeight: '800', fontSize: 10 },
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
