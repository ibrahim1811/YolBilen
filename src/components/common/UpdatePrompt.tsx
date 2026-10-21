import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Portal, Modal, Text, Button, ProgressBar, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { OtaUpdateModal } from './OtaUpdateModal';
import { useRemoteConfig } from '../../services/config/remoteConfig';
import {
  checkForUpdate,
  currentVersionCode,
  currentVersionName,
  downloadUpdate,
  installUpdate,
  type UpdateInfo,
} from '../../services/update/updateService';

type Phase = 'idle' | 'available' | 'downloading' | 'ready' | 'error';

export function UpdatePrompt() {
  const theme = useTheme();
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [file, setFile] = useState<string | null>(null);
  const [error, setError] = useState('');

  const config = useRemoteConfig();
  const forced = !!info && config.minVersionCode > currentVersionCode();
  // Yeni APK yoksa sadece JS değişmiş olabilir; o kontrol OtaUpdateModal'da
  const [apkChecked, setApkChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    checkForUpdate()
      .then(found => {
        if (cancelled) return;
        if (found) {
          setInfo(found);
          setPhase('available');
        }
      })
      .catch(e => console.warn('[UpdatePrompt] APK güncellemesi kontrol edilemedi:', e))
      .finally(() => { if (!cancelled) setApkChecked(true); });
    return () => { cancelled = true; };
  }, []);

  // Uzaktan ayarla zorunlu sürüm yükseltilirse kapatılmış pencere tekrar açılır
  useEffect(() => {
    if (forced && phase === 'idle') setPhase('available');
  }, [forced, phase]);

  async function install(uri: string) {
    try {
      await installUpdate(uri);
    } catch (e) {
      console.warn('[UpdatePrompt] yükleyici açılamadı:', e);
      setError('Yükleme ekranı açılamadı. Ayarlar → Uygulamalar → YolBilen → "Bilinmeyen uygulamaları yükle" iznini aç.');
      setPhase('error');
    }
  }

  async function handleDownload() {
    if (!info) return;
    setPhase('downloading');
    setProgress(0);
    try {
      const uri = await downloadUpdate(info, setProgress);
      setFile(uri);
      setPhase('ready');
      await install(uri);
    } catch (e) {
      console.warn('[UpdatePrompt] güncelleme indirilemedi:', e);
      setError(e instanceof Error ? e.message : 'İndirme başarısız oldu.');
      setPhase('error');
    }
  }

  const visible = phase !== 'idle';
  const dismissable = !forced && (phase === 'available' || phase === 'error');

  return (
    <Portal>
      {apkChecked && !info && <OtaUpdateModal />}
      <Modal
        visible={visible}
        dismissable={dismissable}
        onDismiss={() => setPhase('idle')}
        contentContainerStyle={[styles.card, { backgroundColor: theme.colors.surface }]}
      >
        <View style={[styles.icon, { backgroundColor: theme.colors.primaryContainer }]}>
          <MaterialCommunityIcons name="update" size={28} color={theme.colors.primary} />
        </View>
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>
          {forced ? 'Güncelleme gerekli' : 'Yeni güncelleme var'}
        </Text>
        {forced && (
          <Text style={[styles.notes, { color: theme.colors.onSurfaceVariant }]}>
            Bu sürüm artık desteklenmiyor; devam etmek için güncelle.
          </Text>
        )}
        <Text style={[styles.version, { color: theme.colors.onSurfaceVariant }]}>
          {currentVersionName()} → {info?.versionName}
        </Text>
        {!!info?.notes && (
          <Text style={[styles.notes, { color: theme.colors.onSurface }]}>{info.notes}</Text>
        )}

        {phase === 'downloading' && (
          <View style={styles.progressWrap}>
            <ProgressBar progress={progress} color={theme.colors.primary} style={styles.progress} />
            <Text style={[styles.progressText, { color: theme.colors.onSurfaceVariant }]}>
              İndiriliyor… %{Math.round(progress * 100)}
            </Text>
          </View>
        )}
        {phase === 'error' && (
          <Text style={[styles.error, { color: theme.colors.error }]}>{error}</Text>
        )}

        <View style={styles.actions}>
          {dismissable && (
            <Button mode="text" onPress={() => setPhase('idle')}>Daha sonra</Button>
          )}
          {phase === 'available' && (
            <Button mode="contained" icon="download" onPress={handleDownload}>İndir ve kur</Button>
          )}
          {phase === 'error' && (
            <Button mode="contained" onPress={file ? () => install(file) : handleDownload}>Tekrar dene</Button>
          )}
          {phase === 'ready' && file && (
            <Button mode="contained" icon="cellphone-arrow-down" onPress={() => install(file)}>Kur</Button>
          )}
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  card: { margin: 24, borderRadius: 24, padding: 24, alignItems: 'center', gap: 8 },
  icon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title: { fontSize: 20, fontWeight: '700' },
  version: { fontSize: 13 },
  notes: { fontSize: 14, textAlign: 'center', marginTop: 4 },
  progressWrap: { alignSelf: 'stretch', gap: 6, marginTop: 8 },
  progress: { height: 6, borderRadius: 3 },
  progressText: { fontSize: 12, textAlign: 'center' },
  error: { fontSize: 13, textAlign: 'center', marginTop: 4 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignSelf: 'stretch', gap: 8, marginTop: 12 },
});
