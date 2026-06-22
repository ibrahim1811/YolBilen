import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Surface, useTheme, ActivityIndicator, TouchableRipple } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { generateTravelSummary } from '../../services/ai/groqService';
import { t } from '../../i18n';
import type { Route, WeatherData, ComfortScore } from '../../types';

interface Props {
  route: Route;
  weather?: WeatherData | null;
  comfort?: ComfortScore | null;
}

export function AiSummaryCard({ route, weather, comfort }: Props) {
  const theme = useTheme();
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    setSummary(null);
    try {
      const text = await generateTravelSummary(route, weather, comfort);
      setSummary(text);
    } catch (e: any) {
      setError(e?.message ?? 'Özet alınamadı');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [route.id]);

  return (
    <Surface style={[styles.card, { backgroundColor: theme.colors.primaryContainer }]} elevation={0}>
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: theme.colors.primary }]}>
          <MaterialCommunityIcons name="robot-excited-outline" size={18} color="#FFF" />
        </View>
        <Text style={[styles.title, { color: theme.colors.onPrimaryContainer }]}>
          {t('ai_summary_title')}
        </Text>
        <View style={[styles.badge, { backgroundColor: theme.colors.primary + '22' }]}>
          <Text style={[styles.badgeText, { color: theme.colors.primary }]}>
            {t('ai_powered_by')}
          </Text>
        </View>
      </View>

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={[styles.loadingText, { color: theme.colors.onPrimaryContainer }]}>
            {t('ai_summary_loading')}
          </Text>
        </View>
      )}

      {error && !loading && (
        <TouchableRipple onPress={load} borderless style={styles.retryBtn}>
          <View style={styles.retryContent}>
            <MaterialCommunityIcons name="refresh" size={16} color={theme.colors.primary} />
            <Text style={[styles.retryText, { color: theme.colors.primary }]}>
              {t('ai_summary_retry')}
            </Text>
          </View>
        </TouchableRipple>
      )}

      {summary && !loading && (
        <Text style={[styles.summaryText, { color: theme.colors.onPrimaryContainer }]}>
          {summary}
        </Text>
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { flex: 1, fontSize: 15, fontWeight: '700' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 13 },
  retryBtn: { borderRadius: 8, alignSelf: 'flex-start' },
  retryContent: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6 },
  retryText: { fontSize: 13, fontWeight: '600' },
  summaryText: { fontSize: 14, lineHeight: 22 },
});
