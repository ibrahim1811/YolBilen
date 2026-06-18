import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Surface, useTheme, Switch, Divider } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { scheduleLocalNotification } from '../../services/notifications/notificationService';
import { t } from '../../i18n';
import type { NotificationPrefs } from '../../types';

const DEFAULT_PREFS: NotificationPrefs = {
  busArrivals: true,
  lineAlerts: true,
  crowdAlerts: false,
};

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
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);

  function update(key: keyof NotificationPrefs, value: boolean) {
    setPrefs((p) => ({ ...p, [key]: value }));

    // Demo: bildirim göster
    if (value) {
      if (key === 'busArrivals') {
        scheduleLocalNotification(
          'YolBilen',
          t('notif_bus_arriving')('25E', 3),
          'arrivals',
          2
        );
      } else if (key === 'lineAlerts') {
        scheduleLocalNotification(
          'YolBilen',
          t('notif_line_issue')('34'),
          'alerts',
          2
        );
      } else if (key === 'crowdAlerts') {
        scheduleLocalNotification(
          'YolBilen',
          t('notif_crowd_high')('T1'),
          'alerts',
          2
        );
      }
    }
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
        value={prefs.busArrivals}
        onChange={(v) => update('busArrivals', v)}
      />
      <Divider />
      <PrefRow
        icon="alert-circle-outline"
        color="#FBBC04"
        label={t('notif_line_alerts')}
        value={prefs.lineAlerts}
        onChange={(v) => update('lineAlerts', v)}
      />
      <Divider />
      <PrefRow
        icon="account-group"
        color="#FF6D00"
        label={t('notif_crowd_alerts')}
        value={prefs.crowdAlerts}
        onChange={(v) => update('crowdAlerts', v)}
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
