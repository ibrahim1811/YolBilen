import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Surface, useTheme, ProgressBar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { SunAnalysis } from '../../types';

interface Props {
  analysis: SunAnalysis;
}

export function SunSideCard({ analysis }: Props) {
  const theme = useTheme();
  const isLeftCool = analysis.recommendedSide === 'left';

  return (
    <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="white-balance-sunny" size={28} color="#FBBC04" />
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>Güneş Analizi</Text>
      </View>

      <Text style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>
        {analysis.description}
      </Text>

      <View style={styles.recommended}>
        <Text style={[styles.recommendLabel, { color: theme.colors.onSurfaceVariant }]}>
          Önerilen taraf
        </Text>
        <View style={[styles.recommendBadge, { backgroundColor: theme.colors.primaryContainer }]}>
          <Text style={[styles.recommendValue, { color: theme.colors.primary }]}>
            {analysis.recommendedSide === 'left' ? 'SOL' : 'SAĞ'}
          </Text>
        </View>
      </View>

      <View style={styles.stats}>
        <View style={styles.statRow}>
          <MaterialCommunityIcons
            name="arrow-left-bold"
            size={16}
            color={isLeftCool ? theme.colors.primary : '#FBBC04'}
          />
          <Text style={[styles.statLabel, { color: theme.colors.onSurface }]}>Sol</Text>
          <View style={styles.progressContainer}>
            <ProgressBar
              progress={analysis.leftPercentage / 100}
              color={isLeftCool ? theme.colors.primary : '#FBBC04'}
              style={styles.progress}
            />
          </View>
          <Text style={[styles.statPct, { color: theme.colors.onSurface }]}>
            %{analysis.leftPercentage}
          </Text>
        </View>

        <View style={styles.statRow}>
          <MaterialCommunityIcons
            name="arrow-right-bold"
            size={16}
            color={!isLeftCool ? theme.colors.primary : '#FBBC04'}
          />
          <Text style={[styles.statLabel, { color: theme.colors.onSurface }]}>Sağ</Text>
          <View style={styles.progressContainer}>
            <ProgressBar
              progress={analysis.rightPercentage / 100}
              color={!isLeftCool ? theme.colors.primary : '#FBBC04'}
              style={styles.progress}
            />
          </View>
          <Text style={[styles.statPct, { color: theme.colors.onSurface }]}>
            %{analysis.rightPercentage}
          </Text>
        </View>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  description: {
    fontSize: 14,
    lineHeight: 22,
  },
  recommended: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recommendLabel: {
    fontSize: 14,
  },
  recommendBadge: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  recommendValue: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 2,
  },
  stats: {
    gap: 12,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '500',
    width: 28,
  },
  progressContainer: {
    flex: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progress: {
    height: 8,
    borderRadius: 4,
  },
  statPct: {
    fontSize: 13,
    fontWeight: '600',
    width: 40,
    textAlign: 'right',
  },
});
