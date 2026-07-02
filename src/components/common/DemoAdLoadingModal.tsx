import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Portal, Modal, Text, useTheme } from 'react-native-paper';

interface Props {
  visible: boolean;
  kind: 'ad' | 'purchase';
  rewardLabel: string;
  onComplete: () => void;
  onDismiss?: () => void;
}

const LOADING_MS = 2500;

export function DemoAdLoadingModal({ visible, kind, rewardLabel, onComplete, onDismiss }: Props) {
  const theme = useTheme();

  React.useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onComplete, LOADING_MS);
    return () => clearTimeout(timer);
  }, [visible, onComplete]);

  return (
    <Portal>
      <Modal
        visible={visible}
        dismissable={false}
        onDismiss={onDismiss}
        contentContainerStyle={[styles.container, { backgroundColor: theme.colors.surface }]}
      >
        <Text style={[styles.brand, { color: theme.colors.primary }]}>IKC Development</Text>
        <ActivityIndicator size="large" color={theme.colors.primary} style={styles.spinner} />
        <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
          {kind === 'ad' ? 'Reklam yükleniyor…' : 'Satın alma işleniyor…'}
        </Text>
        <Text style={[styles.reward, { color: theme.colors.onSurface }]}>{rewardLabel}</Text>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  container: {
    margin: 32,
    borderRadius: 16,
    paddingVertical: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  brand: { fontSize: 20, fontWeight: '800', marginBottom: 24, letterSpacing: 0.5 },
  spinner: { marginBottom: 16 },
  subtitle: { fontSize: 14, marginBottom: 8 },
  reward: { fontSize: 16, fontWeight: '700' },
});
