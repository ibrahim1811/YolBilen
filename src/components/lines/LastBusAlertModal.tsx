import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Modal, Portal, Text, Button, Chip, SegmentedButtons, useTheme } from 'react-native-paper';
import type { LineSchedule } from '../../services/firebase/scheduleService';
import { lineTitle } from '../../data/gtfsData';
import {
  LAST_BUS_MINUTE_OPTIONS,
  formatMins,
  getLastBusAlerts,
  lastDepartureMins,
  removeLastBusAlert,
  saveLastBusAlert,
  type LastBusAlert,
} from '../../services/notifications/lastBusService';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  lineNumber: string;
  lineName: string;
  dirLabels: [string, string];
  schedule: LineSchedule;
  onChange?: () => void;
}

export function LastBusAlertModal({ visible, onDismiss, lineNumber, lineName, dirLabels, schedule, onChange }: Props) {
  const theme = useTheme();
  const [dir, setDir] = useState<0 | 1>(0);
  const [minutes, setMinutes] = useState<number>(20);
  const [existing, setExisting] = useState<LastBusAlert[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    getLastBusAlerts()
      .then(all => {
        const mine = all.filter(a => a.lineNumber === lineNumber);
        setExisting(mine);
        if (mine[0]) { setDir(mine[0].dir); setMinutes(mine[0].minutesBefore); }
      })
      .catch(e => console.warn('[LastBusAlert] kayıtlı uyarılar okunamadı:', e));
  }, [visible, lineNumber]);

  const current = existing.find(a => a.dir === dir);
  const lastToday = lastDepartureMins(schedule, new Date(), dir);

  async function handleSave() {
    setSaving(true);
    try {
      const count = await saveLastBusAlert({ lineNumber, lineName, dir, dirLabel: dirLabels[dir], minutesBefore: minutes });
      onChange?.();
      onDismiss();
      if (count === 0) {
        Alert.alert('Uyarı kaydedildi', 'Önümüzdeki günlerde bu yönde sefer bulunamadı, sefer olunca haber vereceğiz.');
      } else {
        Alert.alert('Uyarı kuruldu', `Son seferden ${minutes} dk önce bildirim alacaksın.`);
      }
    } catch (e) {
      console.warn('[LastBusAlert] kaydedilemedi:', e);
      const denied = e instanceof Error && e.message === 'notifications/permission-denied';
      Alert.alert('Uyarı kurulamadı', denied ? 'Bildirim izni vermen gerekiyor.' : 'Bir sorun oluştu, tekrar dene.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setSaving(true);
    try {
      await removeLastBusAlert(lineNumber, dir);
      onChange?.();
      onDismiss();
    } catch (e) {
      console.warn('[LastBusAlert] silinemedi:', e);
      Alert.alert('İşlem başarısız', 'Uyarı kaldırılamadı, tekrar dene.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={[styles.container, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>Son sefer uyarısı · {lineTitle(lineNumber)}</Text>

        <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>Yön</Text>
        <SegmentedButtons
          value={String(dir)}
          onValueChange={v => setDir(v === '1' ? 1 : 0)}
          buttons={[
            { value: '0', label: dirLabels[0] },
            { value: '1', label: dirLabels[1] },
          ]}
        />
        <Text style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>
          {lastToday === null ? 'Bugün bu yönde sefer yok.' : `Bugünkü son kalkış: ${formatMins(lastToday)}`}
        </Text>

        <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>Kaç dakika önce haber verilsin?</Text>
        <View style={styles.chips}>
          {LAST_BUS_MINUTE_OPTIONS.map(m => (
            <Chip key={m} selected={minutes === m} showSelectedOverlay onPress={() => setMinutes(m)} style={styles.chip}>
              {m} dk
            </Chip>
          ))}
        </View>

        <View style={styles.actions}>
          {current && (
            <Button mode="text" textColor={theme.colors.error} onPress={handleRemove} disabled={saving}>
              Uyarıyı kaldır
            </Button>
          )}
          <Button mode="contained" onPress={handleSave} loading={saving} disabled={saving}>
            {current ? 'Güncelle' : 'Kur'}
          </Button>
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  container: { margin: 20, borderRadius: 16, padding: 20, gap: 10 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 8 },
  hint: { fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 16 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
});
