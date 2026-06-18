import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

function scoreColor(score: number): string {
  if (score >= 7.5) return '#34A853';
  if (score >= 5) return '#FBBC04';
  return '#D93025';
}

interface Props {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

const sizeMap = { sm: { outer: 52, inner: 38, font: 14, sub: 10 }, md: { outer: 72, inner: 54, font: 18, sub: 11 }, lg: { outer: 96, inner: 72, font: 24, sub: 12 } };

export function ScoreRing({ score, size = 'md', label }: Props) {
  const theme = useTheme();
  const color = scoreColor(score);
  const { outer, inner, font, sub } = sizeMap[size];

  return (
    <View style={styles.wrapper}>
      <View style={[styles.outer, { width: outer, height: outer, borderRadius: outer / 2, borderColor: color }]}>
        <View style={[styles.inner, { width: inner, height: inner, borderRadius: inner / 2, backgroundColor: color + '18' }]}>
          <Text style={[styles.score, { fontSize: font, color }]}>{score.toFixed(1)}</Text>
          <Text style={[styles.max, { fontSize: sub, color: theme.colors.onSurfaceVariant }]}>/10</Text>
        </View>
      </View>
      {label && <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', gap: 6 },
  outer: { borderWidth: 3, justifyContent: 'center', alignItems: 'center' },
  inner: { justifyContent: 'center', alignItems: 'center' },
  score: { fontWeight: '800', lineHeight: 24 },
  max: { marginTop: -4 },
  label: { fontSize: 12, fontWeight: '500', textAlign: 'center' },
});
