import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, useTheme, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getLineColor, getLineMode, TRANSIT_MODE_ICON } from '../../data/gtfsData';
import type { StopArrival } from '../../types';

interface Props {
  arrival: StopArrival;
  onPress: () => void;
  onRemind?: () => void;
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

function formatDistance(m: number): string {
  if (m <= 0) return 'Durakta';
  return m < 1000 ? `${m} m uzakta` : `${(m / 1000).toFixed(1).replace('.', ',')} km uzakta`;
}

export function ArrivalRow({ arrival, onPress, onRemind }: Props) {
  const theme = useTheme();
  const isSchedule = arrival.isLive === false;
  const color = isSchedule ? theme.colors.onSurfaceVariant : arrivalColor(arrival.minutesAway);
  const mode = getLineMode(arrival.lineNumber);
  const lineColor = getLineColor(arrival.lineNumber);
  const atStop = !isSchedule && (arrival.minutesAway <= 1 || arrival.distanceM === 0);

  const subline = isSchedule
    ? `Tarife · ${clockAfter(arrival.minutesAway)}`
    : arrival.distanceM !== undefined ? formatDistance(arrival.distanceM) : arrival.lineName;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.row, { borderBottomColor: theme.colors.outlineVariant }]}>
        <View style={[styles.badge, { backgroundColor: lineColor ?? theme.colors.primaryContainer }]}>
          {mode === 'bus' ? (
            <Text style={[styles.lineNum, { color: theme.colors.primary }]}>{arrival.lineNumber}</Text>
          ) : (
            <>
              <MaterialCommunityIcons name={TRANSIT_MODE_ICON[mode]} size={18} color="#FFF" />
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
          <Text style={[styles.subline, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
            {subline}
          </Text>
        </View>
        <View style={styles.timeCol}>
          {atStop ? (
            <Text style={[styles.nowText, { color }]}>Durakta</Text>
          ) : (
            <>
              <Text style={[styles.minutes, { color }]}>{arrival.minutesAway}</Text>
              <Text style={[styles.minLabel, { color }]}>dk</Text>
            </>
          )}
        </View>
        {onRemind && (
          <IconButton icon="bell-outline" size={20} onPress={onRemind} style={styles.bell} />
        )}
      </View>
    </TouchableOpacity>
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
    paddingVertical: 10,
    borderRadius: 12,
    minWidth: 60,
    alignItems: 'center',
  },
  lineNum: { fontWeight: '800', fontSize: 18 },
  lineNumSmall: { fontWeight: '800', fontSize: 11 },
  info: { flex: 1, gap: 3 },
  direction: { fontSize: 16, fontWeight: '700' },
  subline: { fontSize: 13 },
  timeCol: { alignItems: 'center', minWidth: 52 },
  minutes: { fontSize: 26, fontWeight: '800', lineHeight: 28 },
  minLabel: { fontSize: 12, fontWeight: '700' },
  nowText: { fontSize: 15, fontWeight: '800' },
  bell: { margin: 0 },
});
