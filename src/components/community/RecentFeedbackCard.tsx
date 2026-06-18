import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Surface, useTheme, Chip } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Feedback } from '../../types';

const comfortMap = { comfortable: { label: 'Rahat', color: '#34A853' }, medium: { label: 'Orta', color: '#FBBC04' }, uncomfortable: { label: 'Rahatsız', color: '#D93025' } };
const acMap = { good: { label: 'Klima İyi', color: '#34A853' }, medium: { label: 'Klima Orta', color: '#FBBC04' }, broken: { label: 'Klima Bozuk', color: '#D93025' } };
const crowdMap = { seated: { label: 'Oturdum', color: '#34A853' }, standing: { label: 'Ayakta', color: '#FBBC04' }, very_crowded: { label: 'Çok Dolu', color: '#D93025' } };

interface Props {
  feedback: Feedback;
}

export function RecentFeedbackCard({ feedback }: Props) {
  const theme = useTheme();
  const comfort = comfortMap[feedback.comfort];
  const ac = acMap[feedback.ac];
  const crowd = crowdMap[feedback.crowd];
  const timeAgo = getTimeAgo(feedback.timestamp);

  return (
    <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
      <View style={styles.header}>
        <View style={[styles.lineBadge, { backgroundColor: theme.colors.primaryContainer }]}>
          <Text style={[styles.lineNum, { color: theme.colors.primary }]}>{feedback.lineNumber}</Text>
        </View>
        <Text style={[styles.time, { color: theme.colors.onSurfaceVariant }]}>{timeAgo}</Text>
      </View>
      <View style={styles.chips}>
        <Chip compact textStyle={{ fontSize: 11, color: comfort.color }} style={{ backgroundColor: comfort.color + '18' }}>{comfort.label}</Chip>
        <Chip compact textStyle={{ fontSize: 11, color: ac.color }} style={{ backgroundColor: ac.color + '18' }}>{ac.label}</Chip>
        <Chip compact textStyle={{ fontSize: 11, color: crowd.color }} style={{ backgroundColor: crowd.color + '18' }}>{crowd.label}</Chip>
      </View>
    </Surface>
  );
}

function getTimeAgo(date: Date): string {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (diff < 1) return 'Az önce';
  if (diff < 60) return `${diff} dk önce`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h} sa önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 14, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  lineNum: { fontWeight: '800', fontSize: 14 },
  time: { fontSize: 12, marginLeft: 'auto' },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
});
