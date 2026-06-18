import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Surface, useTheme, ProgressBar, Divider } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScoreRing } from '../common/ScoreRing';
import type { ComfortScore } from '../../types';

interface Props {
  score: ComfortScore;
  compact?: boolean;
}

function scoreColor(s: number) {
  if (s >= 7.5) return '#34A853';
  if (s >= 5) return '#FBBC04';
  return '#D93025';
}

interface BarRowProps { icon: string; label: string; score: number }
function BarRow({ icon, label, score }: BarRowProps) {
  const theme = useTheme();
  const color = scoreColor(score);
  return (
    <View style={barStyles.row}>
      <MaterialCommunityIcons name={icon as any} size={16} color={color} />
      <Text style={[barStyles.label, { color: theme.colors.onSurface }]}>{label}</Text>
      <View style={barStyles.track}>
        <ProgressBar progress={score / 10} color={color} style={barStyles.bar} />
      </View>
      <Text style={[barStyles.val, { color }]}>{score.toFixed(1)}</Text>
    </View>
  );
}

const barStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 13, width: 60 },
  track: { flex: 1, borderRadius: 4, overflow: 'hidden' },
  bar: { height: 8, borderRadius: 4 },
  val: { fontSize: 13, fontWeight: '700', width: 32, textAlign: 'right' },
});

export function ComfortScoreCard({ score, compact = false }: Props) {
  const theme = useTheme();

  if (compact) {
    return (
      <Surface style={[styles.compact, { backgroundColor: theme.colors.surface }]} elevation={1}>
        <ScoreRing score={score.overall} size="sm" />
        <View style={styles.compactInfo}>
          <Text style={[styles.compactTitle, { color: theme.colors.onSurface }]}>Genel Konfor</Text>
          <Text style={[styles.compactSub, { color: theme.colors.onSurfaceVariant }]}>
            {score.totalFeedbacks} değerlendirme
          </Text>
        </View>
        <View style={styles.compactScores}>
          <Text style={[styles.miniScore, { color: scoreColor(score.acScore) }]}>
            ❄️ {score.acScore.toFixed(1)}
          </Text>
          <Text style={[styles.miniScore, { color: scoreColor(score.crowdScore) }]}>
            👥 {score.crowdScore.toFixed(1)}
          </Text>
        </View>
      </Surface>
    );
  }

  return (
    <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <MaterialCommunityIcons name="star-circle" size={22} color="#FBBC04" />
          <Text style={[styles.title, { color: theme.colors.onSurface }]}>Konfor Skoru</Text>
          <Text style={[styles.feedbackCount, { color: theme.colors.onSurfaceVariant }]}>
            {score.totalFeedbacks} değerlendirme
          </Text>
        </View>
        <ScoreRing score={score.overall} size="lg" label="Genel Konfor" />
      </View>

      <Divider style={styles.divider} />

      <View style={styles.bars}>
        <BarRow icon="air-conditioner" label="Klima" score={score.acScore} />
        <BarRow icon="seat-passenger" label="Konfor" score={score.comfortScore} />
        <BarRow icon="account-group" label="Yoğunluk" score={score.crowdScore} />
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 20, gap: 16 },
  header: { alignItems: 'center', gap: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch' },
  title: { fontSize: 17, fontWeight: '700', flex: 1 },
  feedbackCount: { fontSize: 12 },
  divider: {},
  bars: { gap: 14 },
  compact: { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  compactInfo: { flex: 1 },
  compactTitle: { fontSize: 14, fontWeight: '600' },
  compactSub: { fontSize: 12, marginTop: 2 },
  compactScores: { gap: 4, alignItems: 'flex-end' },
  miniScore: { fontSize: 13, fontWeight: '700' },
});
