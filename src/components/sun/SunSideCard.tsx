import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Surface, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { SunAnalysis } from '../../types';

interface Props {
  analysis: SunAnalysis | null;
}

function getDefaultAnalysis(): SunAnalysis {
  const hour = new Date().getHours();
  // Sabah güneş doğuda (sağ), öğleden sonra batıda (sol)
  const sunOnLeft = hour >= 13;
  return {
    recommendedSide: sunOnLeft ? 'right' : 'left',
    leftPercentage: sunOnLeft ? 65 : 35,
    rightPercentage: sunOnLeft ? 35 : 65,
    description: sunOnLeft ? 'Öğleden sonra güneş sol tarafta' : 'Sabah güneş sağ tarafta',
  };
}

export function SunSideCard({ analysis }: Props) {
  const theme = useTheme();
  const data = analysis ?? getDefaultAnalysis();
  const sunOnRight = data.recommendedSide === 'left';
  const hour = new Date().getHours();
  const timeLabel = hour < 12 ? 'sabah' : hour < 17 ? 'öğleden sonra' : 'akşam';

  const sunnyPct = Math.max(data.leftPercentage, data.rightPercentage);
  const intensity = sunnyPct >= 75 ? 'Çok yoğun güneş' : sunnyPct >= 60 ? 'Orta güneş' : 'Hafif güneş';
  const intensityColor = sunnyPct >= 75 ? '#EF4444' : sunnyPct >= 60 ? '#F59E0B' : '#10B981';

  return (
    <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="white-balance-sunny" size={22} color="#FBBC04" />
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>Güneş Konumu</Text>
        <View style={[styles.intensityBadge, { backgroundColor: intensityColor + '20' }]}>
          <Text style={[styles.intensityText, { color: intensityColor }]}>{intensity}</Text>
        </View>
      </View>

      <View style={styles.diagram}>
        <View style={styles.sideCol}>
          {!sunOnRight && (
            <MaterialCommunityIcons name="weather-sunny" size={32} color="#FBBC04" />
          )}
          <Text style={[styles.sideLabel, { color: !sunOnRight ? '#FBBC04' : theme.colors.onSurfaceVariant }]}>
            SOL
          </Text>
          {!sunOnRight && (
            <Text style={[styles.hotLabel, { color: '#EF4444' }]}>sıcak</Text>
          )}
        </View>

        <View style={[styles.bus, { backgroundColor: theme.colors.primaryContainer }]}>
          <MaterialCommunityIcons name="bus-side" size={40} color={theme.colors.primary} />
          <View style={styles.seatRow}>
            <View style={[styles.seat, { backgroundColor: !sunOnRight ? '#FEF3C7' : theme.colors.secondaryContainer }]} />
            <View style={[styles.seat, { backgroundColor: sunOnRight ? '#FEF3C7' : theme.colors.secondaryContainer }]} />
          </View>
        </View>

        <View style={styles.sideCol}>
          {sunOnRight && (
            <MaterialCommunityIcons name="weather-sunny" size={32} color="#FBBC04" />
          )}
          <Text style={[styles.sideLabel, { color: sunOnRight ? '#FBBC04' : theme.colors.onSurfaceVariant }]}>
            SAĞ
          </Text>
          {sunOnRight && (
            <Text style={[styles.hotLabel, { color: '#EF4444' }]}>sıcak</Text>
          )}
        </View>
      </View>

      <View style={[styles.recommendation, { backgroundColor: theme.colors.primaryContainer }]}>
        <MaterialCommunityIcons name="seat-passenger" size={18} color={theme.colors.primary} />
        <Text style={[styles.recommendText, { color: theme.colors.primary }]}>
          {data.recommendedSide === 'left' ? 'Sol' : 'Sağ'} tarafa oturun — daha serin
        </Text>
      </View>

      <Text style={[styles.timeHint, { color: theme.colors.onSurfaceVariant }]}>
        {timeLabel.charAt(0).toUpperCase() + timeLabel.slice(1)} için hesaplandı
        {!analysis && ' (tahmini)'}
      </Text>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '700', flex: 1 },
  intensityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  intensityText: { fontSize: 11, fontWeight: '600' },
  diagram: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  sideCol: { alignItems: 'center', gap: 4, width: 52 },
  sideLabel: { fontSize: 12, fontWeight: '700' },
  hotLabel: { fontSize: 10, fontWeight: '600' },
  bus: {
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginHorizontal: 8,
  },
  seatRow: { flexDirection: 'row', gap: 8 },
  seat: { width: 24, height: 16, borderRadius: 4 },
  recommendation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
  },
  recommendText: { fontSize: 14, fontWeight: '700' },
  timeHint: { fontSize: 11, textAlign: 'center' },
});
