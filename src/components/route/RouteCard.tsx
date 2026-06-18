import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Surface, useTheme, Divider } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CrowdBadge } from '../common/CrowdBadge';
import type { Route } from '../../types';

interface Props {
  route: Route;
  onPress: () => void;
}

export function RouteCard({ route, onPress }: Props) {
  const theme = useTheme();

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
        <View style={styles.header}>
          <View style={[styles.lineBadge, { backgroundColor: theme.colors.primary }]}>
            <Text style={styles.lineNumber}>{route.lineNumber}</Text>
          </View>
          <View style={styles.info}>
            <Text style={[styles.lineName, { color: theme.colors.onSurface }]} numberOfLines={1}>
              {route.lineName}
            </Text>
            <View style={styles.row}>
              <MaterialCommunityIcons
                name="clock-outline"
                size={14}
                color={theme.colors.onSurfaceVariant}
              />
              <Text style={[styles.meta, { color: theme.colors.onSurfaceVariant }]}>
                {route.estimatedDuration} dk
              </Text>
              <MaterialCommunityIcons
                name="bus-clock"
                size={14}
                color={theme.colors.primary}
                style={styles.icon}
              />
              <Text style={[styles.arrival, { color: theme.colors.primary }]}>
                {route.nextArrival} dk sonra
              </Text>
            </View>
          </View>
        </View>

        {(route.boardingStop || route.alightingStop) && (
          <>
            <Divider style={styles.divider} />
            <View style={styles.stopsRow}>
              {route.boardingStop && (
                <View style={styles.stopItem}>
                  <MaterialCommunityIcons name="map-marker-up" size={14} color="#34A853" />
                  <Text style={[styles.stopName, { color: theme.colors.onSurface }]} numberOfLines={1}>
                    {route.boardingStop.name}
                  </Text>
                </View>
              )}
              {route.boardingStop && route.alightingStop && (
                <MaterialCommunityIcons name="arrow-right" size={12} color={theme.colors.onSurfaceVariant} />
              )}
              {route.alightingStop && (
                <View style={styles.stopItem}>
                  <MaterialCommunityIcons name="map-marker-down" size={14} color="#D93025" />
                  <Text style={[styles.stopName, { color: theme.colors.onSurface }]} numberOfLines={1}>
                    {route.alightingStop.name}
                  </Text>
                </View>
              )}
            </View>
          </>
        )}

        <Divider style={styles.divider} />

        <View style={styles.footer}>
          <CrowdBadge level={route.crowdLevel} />
          {route.transfers.length > 0 && (
            <View style={styles.transferInfo}>
              <MaterialCommunityIcons
                name="transfer"
                size={14}
                color={theme.colors.onSurfaceVariant}
              />
              <Text style={[styles.meta, { color: theme.colors.onSurfaceVariant }]}>
                {route.transfers.length} aktarma
              </Text>
            </View>
          )}
          {route.sunAnalysis && (
            <View style={styles.sunInfo}>
              <MaterialCommunityIcons name="white-balance-sunny" size={14} color="#FBBC04" />
              <Text style={[styles.meta, { color: '#FBBC04' }]}>
                {route.sunAnalysis.recommendedSide === 'left' ? 'Sol' : 'Sağ'} taraf serin
              </Text>
            </View>
          )}
        </View>
      </Surface>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
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
});
