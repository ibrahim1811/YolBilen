import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
  message?: string;
  onRetry?: () => void;
}

export function ErrorView({ message = 'Bir hata oluştu.', onRetry }: Props) {
  const theme = useTheme();
  return (
    <View style={styles.root}>
      <MaterialCommunityIcons name="wifi-off" size={48} color={theme.colors.onSurfaceVariant} />
      <Text style={[styles.msg, { color: theme.colors.onSurfaceVariant }]}>{message}</Text>
      {onRetry && (
        <Button mode="contained-tonal" onPress={onRetry} style={styles.btn}>
          Tekrar Dene
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 32 },
  msg: { fontSize: 15, textAlign: 'center' },
  btn: { marginTop: 8 },
});
