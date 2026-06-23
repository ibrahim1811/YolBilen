import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';

interface Props {
  lines?: number;
  height?: number;
}

export function SkeletonCard({ lines = 3, height = 80 }: Props) {
  const theme = useTheme();
  const anim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [anim]);

  return (
    <Animated.View style={[styles.card, { backgroundColor: theme.colors.surfaceVariant, opacity: anim, minHeight: height }]}>
      {Array.from({ length: lines }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.line,
            { backgroundColor: theme.colors.outline, width: i === lines - 1 ? '60%' : '100%' },
          ]}
        />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 16, margin: 4, gap: 10 },
  line: { height: 12, borderRadius: 6 },
});
