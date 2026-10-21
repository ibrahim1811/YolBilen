import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRemoteConfig } from '../../services/config/remoteConfig';

const DISMISSED_KEY = 'announcement_dismissed';

// Uzaktan ayardaki duyuru; kullanıcı kapatınca aynı id bir daha gösterilmez.
export function AnnouncementBanner() {
  const theme = useTheme();
  const { announcement } = useRemoteConfig();
  const [dismissedId, setDismissedId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY)
      .then(setDismissedId)
      .catch(e => {
        console.warn('[Announcement] kapatılan duyuru okunamadı:', e);
        setDismissedId(null);
      });
  }, []);

  if (!announcement || dismissedId === undefined || dismissedId === announcement.id) return null;
  const warning = announcement.level === 'warning';
  const bg = warning ? theme.colors.errorContainer : theme.colors.secondaryContainer;
  const fg = warning ? theme.colors.onErrorContainer : theme.colors.onSecondaryContainer;

  function dismiss() {
    setDismissedId(announcement!.id);
    AsyncStorage.setItem(DISMISSED_KEY, announcement!.id).catch(e => console.warn('[Announcement] kaydedilemedi:', e));
  }

  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <MaterialCommunityIcons name={warning ? 'alert-outline' : 'bullhorn-outline'} size={18} color={fg} />
      <Text style={[styles.text, { color: fg }]}>{announcement.text}</Text>
      <TouchableOpacity onPress={dismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Duyuruyu kapat">
        <MaterialCommunityIcons name="close" size={18} color={fg} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  text: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '500' },
});
