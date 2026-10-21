import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Portal, Modal, Text, Button, ProgressBar, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';

type Phase = 'idle' | 'downloading' | 'restarting' | 'error';

const RESTART_DELAY_MS = 1500;

function notesOf(manifest: unknown): string {
  const extra = (manifest as { extra?: { notes?: unknown } } | undefined)?.extra;
  return typeof extra?.notes === 'string' ? extra.notes : '';
}

// JS güncellemesi (ota-yayinla.ps1): açılışta bulunursa pencere açılır, indirme ilerlemesi gösterilir,
// bitince uygulama yeni sürümle kendiliğinden yeniden başlar.
export function OtaUpdateModal() {
  const theme = useTheme();
  const { downloadProgress, isUpdatePending } = Updates.useUpdates();
  const [phase, setPhase] = useState<Phase>('idle');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  async function restart() {
    setPhase('restarting');
    await new Promise(r => setTimeout(r, RESTART_DELAY_MS));
    try {
      await Updates.reloadAsync();
    } catch (e) {
      console.warn('[OtaUpdate] yeniden başlatılamadı:', e);
      setError('Uygulama yeniden başlatılamadı. Kapatıp açtığında yeni sürüm yüklenecek.');
      setPhase('error');
    }
  }

  async function download() {
    setPhase('downloading');
    setError('');
    try {
      const fetched = await Updates.fetchUpdateAsync();
      if (!fetched.isNew) {
        setPhase('idle');
        return;
      }
      await restart();
    } catch (e) {
      console.warn('[OtaUpdate] güncelleme indirilemedi:', e);
      setError('Güncelleme indirilemedi. İnternet bağlantını kontrol et.');
      setPhase('error');
    }
  }

  useEffect(() => {
    if (!Updates.isEnabled || __DEV__) return;
    let cancelled = false;
    Updates.checkForUpdateAsync()
      .then(res => {
        if (cancelled || !res.isAvailable) return;
        setNotes(notesOf(res.manifest));
        void download();
      })
      .catch(e => console.warn('[OtaUpdate] güncelleme kontrol edilemedi:', e));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Açılışta arka planda zaten indirilmiş bir güncelleme varsa doğrudan uygulanır
  useEffect(() => {
    if (isUpdatePending && phase === 'idle') void restart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUpdatePending]);

  const progress = phase === 'restarting' ? 1 : downloadProgress ?? 0;

  return (
    <Portal>
      <Modal
        visible={phase !== 'idle'}
        dismissable={phase === 'error'}
        onDismiss={() => setPhase('idle')}
        contentContainerStyle={[styles.card, { backgroundColor: theme.colors.surface }]}
      >
        <View style={[styles.icon, { backgroundColor: theme.colors.primaryContainer }]}>
          <MaterialCommunityIcons
            name={phase === 'restarting' ? 'check-circle-outline' : 'cloud-download-outline'}
            size={30}
            color={theme.colors.primary}
          />
        </View>
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>
          {phase === 'restarting' ? 'Güncelleme hazır' : 'Yeni güncelleme var'}
        </Text>
        {!!notes && <Text style={[styles.notes, { color: theme.colors.onSurfaceVariant }]}>{notes}</Text>}

        {phase !== 'error' && (
          <View style={styles.progressWrap}>
            <ProgressBar progress={progress} color={theme.colors.primary} style={styles.progress} />
            <Text style={[styles.progressText, { color: theme.colors.onSurfaceVariant }]}>
              {phase === 'restarting' ? 'Yeniden başlatılıyor…' : `İndiriliyor… %${Math.round(progress * 100)}`}
            </Text>
          </View>
        )}

        {phase === 'error' && (
          <>
            <Text style={[styles.error, { color: theme.colors.error }]}>{error}</Text>
            <View style={styles.actions}>
              <Button mode="text" onPress={() => setPhase('idle')}>Daha sonra</Button>
              <Button mode="contained" onPress={() => void download()}>Tekrar dene</Button>
            </View>
          </>
        )}
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  card: { margin: 24, borderRadius: 24, padding: 24, alignItems: 'center', gap: 8 },
  icon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title: { fontSize: 20, fontWeight: '700' },
  notes: { fontSize: 14, textAlign: 'center' },
  progressWrap: { alignSelf: 'stretch', gap: 8, marginTop: 12 },
  progress: { height: 8, borderRadius: 4 },
  progressText: { fontSize: 13, textAlign: 'center' },
  error: { fontSize: 13, textAlign: 'center', marginTop: 4 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignSelf: 'stretch', gap: 8, marginTop: 8 },
});
