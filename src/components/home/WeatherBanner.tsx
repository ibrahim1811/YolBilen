import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Surface, useTheme, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { t } from '../../i18n';
import type { WeatherData } from '../../types';

interface Props {
  data: WeatherData | null;
  loading: boolean;
  error: string | null;
}

export function WeatherBanner({ data, loading, error }: Props) {
  const theme = useTheme();

  if (loading) {
    return (
      <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
        <Text style={[styles.loadingText, { color: theme.colors.onSurfaceVariant }]}>
          {t('weather_loading')}
        </Text>
      </Surface>
    );
  }

  if (!data || error) return null;

  const bgColor = data.isHot
    ? '#FF6D00'
    : data.isRainy
    ? '#1A73E8'
    : theme.colors.surfaceVariant;

  const textColor = data.isHot || data.isRainy ? '#FFF' : theme.colors.onSurface;
  const subColor = data.isHot || data.isRainy ? 'rgba(255,255,255,0.8)' : theme.colors.onSurfaceVariant;

  return (
    <Surface style={[styles.card, { backgroundColor: bgColor }]} elevation={data.isHot || data.isRainy ? 2 : 1}>
      <View style={styles.main}>
        <MaterialCommunityIcons name={data.icon as any} size={36} color={textColor} />
        <View style={styles.info}>
          <View style={styles.tempRow}>
            <Text style={[styles.temp, { color: textColor }]}>{data.temperature}°C</Text>
            <Text style={[styles.description, { color: subColor }]}>{data.description}</Text>
          </View>
          <Text style={[styles.feelsLike, { color: subColor }]}>
            {t('weather_feels_like')(data.feelsLike)}
          </Text>
        </View>
      </View>

      {data.isHot && (
        <View style={styles.warning}>
          <MaterialCommunityIcons name="white-balance-sunny" size={14} color={textColor} />
          <Text style={[styles.warningText, { color: textColor }]}>
            {t('weather_hot_warning')}
          </Text>
        </View>
      )}

      {data.isRainy && (
        <View style={styles.warning}>
          <MaterialCommunityIcons name="umbrella" size={14} color={textColor} />
          <Text style={[styles.warningText, { color: textColor }]}>
            {t('weather_rain_warning')}
          </Text>
        </View>
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, gap: 10 },
  main: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  info: { flex: 1, gap: 2 },
  tempRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  temp: { fontSize: 28, fontWeight: '800' },
  description: { fontSize: 14, fontWeight: '500' },
  feelsLike: { fontSize: 13 },
  warning: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.3)' },
  warningText: { fontSize: 13, flex: 1, lineHeight: 18 },
  loadingText: { fontSize: 13 },
});
