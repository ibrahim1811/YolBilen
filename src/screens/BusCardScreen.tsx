import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Appbar, Surface, ProgressBar, useTheme, ActivityIndicator } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, BusCard } from '../types';
import { getBusCard } from '../services/firebase/busCardService';
import { trackBusCardOpen } from '../services/telemetry/telemetryService';

type Props = NativeStackScreenProps<RootStackParamList, 'BusCard'>;

function ScoreRow({ label, score, color }: { label: string; score: number; color: string }) {
  const theme = useTheme();
  return (
    <View style={styles.scoreRow}>
      <View style={styles.scoreLabelRow}>
        <Text style={[styles.scoreLabel, { color: theme.colors.onSurface }]}>{label}</Text>
        <Text style={[styles.scoreValue, { color }]}>{score.toFixed(1)}</Text>
      </View>
      <ProgressBar progress={score / 10} color={color} style={styles.bar} />
    </View>
  );
}

export function BusCardScreen({ navigation, route }: Props) {
  const theme = useTheme();
  const { plate } = route.params;
  const [card, setCard] = useState<BusCard | null | 'loading'>('loading');

  useEffect(() => {
    trackBusCardOpen(plate);
    getBusCard(plate).then(setCard);
  }, [plate]);

  const overallColor = (s: number) =>
    s >= 8 ? '#34A853' : s >= 6 ? '#FBBC04' : '#EA4335';

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <Appbar.Header elevated={false}>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Otobüs Karnesi" />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>
        {card === 'loading' ? (
          <ActivityIndicator style={{ marginTop: 60 }} />
        ) : card === null ? (
          <Surface style={[styles.emptyCard, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
            <Text style={[styles.plateText, { color: theme.colors.onSurface }]}>{plate}</Text>
            <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}>
              Bu araç için henüz değerlendirme yok.{'\n'}İlk sen değerlendir!
            </Text>
          </Surface>
        ) : (
          <>
            <Surface style={[styles.headerCard, { backgroundColor: theme.colors.primaryContainer }]} elevation={0}>
              <Text style={[styles.plateText, { color: theme.colors.primary }]}>{card.plate}</Text>
              <Text style={[styles.overallScore, { color: overallColor(card.overallScore) }]}>
                {card.overallScore.toFixed(1)}
              </Text>
              <Text style={[styles.overallLabel, { color: theme.colors.onPrimaryContainer }]}>
                Genel Puan
              </Text>
              <Text style={[styles.reportCount, { color: theme.colors.onSurfaceVariant }]}>
                {card.totalReports} değerlendirme
              </Text>
            </Surface>

            <Surface style={[styles.scoresCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
              <ScoreRow label="❄️  Klima" score={card.climateScore} color="#1A73E8" />
              <ScoreRow label="👥  Kalabalık" score={card.crowdScore} color="#9C27B0" />
              <ScoreRow label="💺  Konfor" score={card.comfortScore} color="#34A853" />
              <ScoreRow label="😊  Memnuniyet" score={card.satisfactionScore} color="#FF6D00" />
            </Surface>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 16 },
  headerCard: { borderRadius: 20, padding: 28, alignItems: 'center', gap: 4 },
  plateText: { fontSize: 22, fontWeight: '800', letterSpacing: 2 },
  overallScore: { fontSize: 64, fontWeight: '900', lineHeight: 72, marginTop: 8 },
  overallLabel: { fontSize: 14, fontWeight: '600' },
  reportCount: { fontSize: 13, marginTop: 4 },
  scoresCard: { borderRadius: 16, padding: 20, gap: 20 },
  scoreRow: { gap: 6 },
  scoreLabelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  scoreLabel: { fontSize: 15, fontWeight: '500' },
  scoreValue: { fontSize: 15, fontWeight: '700' },
  bar: { height: 8, borderRadius: 4 },
  emptyCard: { borderRadius: 16, padding: 32, alignItems: 'center', marginTop: 40 },
});
