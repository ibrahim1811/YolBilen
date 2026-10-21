import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Surface, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { minsToArrivalLabel } from '../../services/firebase/scheduleService';
import { getLineColor, TRANSIT_MODE_ICON } from '../../data/gtfsData';
import type { Route } from '../../types';

interface Props {
  route: Route;
  onPress: () => void;
}

function hhmm(mins: number): string {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function durationLabel(mins: number): string {
  if (mins < 60) return `${mins} dk`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h} sa ${m} dk` : `${h} sa`;
}

// Yola çıkış ve varış (gece yarısından dakika). Tarifeden hesaplanmamış direkt rotalar için şimdiden türetilir.
export function routeTimes(route: Route): { depart: number; arrive: number } | null {
  if (route.departAtMins !== undefined && route.arriveAtMins !== undefined) {
    return { depart: route.departAtMins, arrive: route.arriveAtMins };
  }
  if (route.nextArrival >= 999) return null;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const walk = route.steps?.[0]?.type === 'walk' ? route.steps[0].durationMins : 0;
  const boardAt = nowMins + Math.max(route.nextArrival, walk);
  return { depart: boardAt - walk, arrive: boardAt + route.estimatedDuration - walk };
}

function LegChain({ route }: { route: Route }) {
  const theme = useTheme();
  const steps = route.steps ?? [];
  return (
    <View style={styles.chain}>
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          {i > 0 && <MaterialCommunityIcons name="chevron-right" size={14} color={theme.colors.onSurfaceVariant} />}
          {s.type === 'walk' ? (
            <View style={styles.walkChip}>
              <MaterialCommunityIcons name="walk" size={15} color={theme.colors.onSurfaceVariant} />
              {s.durationMins >= 3 && (
                <Text style={[styles.walkMins, { color: theme.colors.onSurfaceVariant }]}>{s.durationMins}</Text>
              )}
            </View>
          ) : (
            <View style={[styles.lineChip, { backgroundColor: getLineColor(s.lineNumber ?? '') ?? theme.colors.primary }]}>
              <MaterialCommunityIcons name={TRANSIT_MODE_ICON[s.mode ?? 'bus']} size={13} color="#FFF" />
              <Text style={styles.lineChipText} numberOfLines={1}>
                {s.mode === 'ferry' ? 'Vapur' : s.lineNumber}
              </Text>
            </View>
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

function RouteCardInner({ route, onPress }: Props) {
  const theme = useTheme();
  const times = routeTimes(route);
  const firstTransit = route.steps?.find(s => s.type === 'transit');

  if (route.isWalkOnly) {
    const meters = route.steps?.[0]?.distanceMeters ?? 0;
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <View style={styles.timeRow}>
            <Text style={[styles.timeRange, { color: theme.colors.onSurface }]}>
              {times ? `${hhmm(times.depart)} – ${hhmm(times.arrive)}` : ''}
            </Text>
            <Text style={[styles.totalDuration, { color: theme.colors.onSurface }]}>{durationLabel(route.estimatedDuration)}</Text>
          </View>
          <View style={styles.chain}>
            <View style={styles.walkChip}>
              <MaterialCommunityIcons name="walk" size={18} color={theme.colors.primary} />
              <Text style={[styles.meta, { color: theme.colors.onSurface }]}>
                Yürüyerek · {(meters / 1000).toFixed(1)} km
              </Text>
            </View>
          </View>
        </Surface>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
        {route.isNextDay && (
          <View style={[styles.nextDayBadge, { backgroundColor: theme.colors.tertiaryContainer }]}>
            <MaterialCommunityIcons name="weather-night" size={13} color={theme.colors.onTertiaryContainer} />
            <Text style={[styles.nextDayText, { color: theme.colors.onTertiaryContainer }]}>
              Bu gece sefer kalmadı · yarın sabah
            </Text>
          </View>
        )}
        {times && (
          <View style={styles.timeRow}>
            <Text style={[styles.timeRange, { color: theme.colors.onSurface }]}>
              {hhmm(times.depart)} – {hhmm(times.arrive)}
            </Text>
            <Text style={[styles.totalDuration, { color: theme.colors.onSurface }]}>
              {durationLabel(Math.max(1, times.arrive - times.depart))}
            </Text>
          </View>
        )}
        {(route.steps?.length ?? 0) > 0 && <LegChain route={route} />}
        <View style={styles.row}>
          {firstTransit?.isLive && <View style={styles.liveDot} />}
          <Text style={[styles.meta, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
            {route.nextArrival >= 999
              ? 'Bugün sefer yok'
              : `${route.boardingStop?.name ?? 'Durak'} · ${route.nextArrival <= 1 ? 'şimdi kalkıyor' : `${minsToArrivalLabel(route.nextArrival)} sonra`}`}
          </Text>
        </View>
        {(route.transfers.length > 0 || route.crowdLevel === 'high' || route.crowdLevel === 'very_high' || route.hasIncompleteData) && (
          <Text style={[styles.subMeta, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
            {[
              route.transfers.length > 0 ? `${route.transfers.length} aktarma` : null,
              route.crowdLevel === 'high' || route.crowdLevel === 'very_high' ? 'Kalabalık olabilir' : null,
              route.hasIncompleteData ? 'Sefer verisi eksik' : null,
            ].filter(Boolean).join(' · ')}
          </Text>
        )}

      </Surface>
    </TouchableOpacity>
  );
}

export const RouteCard = React.memo(RouteCardInner);

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  nextDayBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginBottom: 8 },
  nextDayText: { fontSize: 12, fontWeight: '600' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#188038' },
  subMeta: { fontSize: 12, marginTop: 4 },
  timeRange: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  totalDuration: { fontSize: 16, fontWeight: '700' },
  chain: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 12 },
  walkChip: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  walkMins: { fontSize: 11, fontWeight: '600' },
  lineChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, maxWidth: 110 },
  lineChipText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  lineBadge: {
    width: 52,
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lineNumber: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  info: {
    flex: 1,
  },
  lineName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  meta: {
    fontSize: 13,
  },
  arrival: {
    fontSize: 13,
    fontWeight: '600',
  },
  icon: {
    marginLeft: 8,
  },
  divider: {
    marginVertical: 12,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  transferInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sunInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stopsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  stopItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flex: 1,
  },
  stopName: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  confidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  confidenceText: {
    fontSize: 11,
    fontWeight: '700',
  },
  incompleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  incompleteText: {
    fontSize: 11,
    color: '#F59E0B',
  },
});
