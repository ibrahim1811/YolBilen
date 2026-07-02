import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Surface, useTheme, Switch, Divider } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { t } from '../../i18n';
import { useAppStore } from '../../store/useAppStore';
import type { NotificationPrefs } from '../../types';

interface PrefRowProps {
  icon: string;
  color: string;
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

function PrefRow({ icon, color, label, value, onChange }: PrefRowProps) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: color + '18' }]}>
        <MaterialCommunityIcons name={icon as any} size={18} color={color} />
      </View>
      <Text style={[styles.rowLabel, { color: theme.colors.onSurface }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

export function NotificationSettings() {
  const theme = useTheme();
  const { notificationPrefs, setNotificationPrefs } = useAppStore();

  function update(key: keyof NotificationPrefs, value: boolean) {
    setNotificationPrefs({ ...notificationPrefs, [key]: value });
  }

  return (
    <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="bell-outline" size={20} color={theme.colors.primary} />
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>
          {t('notif_settings_title')}
        </Text>
      </View>

      <Divider />

      <PrefRow
        icon="bus-clock"
        color="#34A853"
        label={t('notif_bus_arrivals')}
        value={notificationPrefs.busArrivals}
        onChange={(v) => update('busArrivals', v)}
      />
      <Divider />
      <PrefRow
        icon="alert-circle-outline"
        color="#FBBC04"
        label={t('notif_line_alerts')}
        value={notificationPrefs.lineAlerts}
        onChange={(v) => update('lineAlerts', v)}
      />
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    paddingBottom: 12,
  },
  title: { fontSize: 16, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  rowIcon: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  rowLabel: { flex: 1, fontSize: 14 },
});
