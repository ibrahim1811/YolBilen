import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Text, Surface, useTheme, Button, Snackbar, TouchableRipple, Divider } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FeedbackChipGroup } from '../components/community/FeedbackChipGroup';
import { LineSelectorModal } from '../components/community/LineSelector';
import { RecentFeedbackCard } from '../components/community/RecentFeedbackCard';
import { submitFeedback, getRecentFeedbacks } from '../services/firebase/firestore';
import { useAppStore } from '../store/useAppStore';
import type { Feedback } from '../types';

type ComfortOption = Feedback['comfort'];
type AcOption = Feedback['ac'];
type TempOption = Feedback['temperature'];
type CrowdOption = Feedback['crowd'];

const AC_OPTIONS = [
  { label: 'İyi', value: 'good', icon: 'snowflake', color: '#1A73E8' },
  { label: 'Orta', value: 'medium', icon: 'snowflake-alert', color: '#FBBC04' },
  { label: 'Çalışmıyor', value: 'broken', icon: 'snowflake-off', color: '#D93025' },
];
const TEMP_OPTIONS = [
  { label: 'Serin', value: 'cool', icon: 'thermometer-low', color: '#1A73E8' },
  { label: 'Normal', value: 'normal', icon: 'thermometer', color: '#34A853' },
  { label: 'Çok Sıcak', value: 'hot', icon: 'thermometer-high', color: '#D93025' },
];
const CROWD_OPTIONS = [
  { label: 'Oturdum', value: 'seated', icon: 'seat-passenger', color: '#34A853' },
  { label: 'Ayakta Kaldım', value: 'standing', icon: 'account', color: '#FBBC04' },
  { label: 'Çok Doluydu', value: 'very_crowded', icon: 'account-group', color: '#D93025' },
];
const COMFORT_OPTIONS = [
  { label: 'Rahat', value: 'comfortable', icon: 'emoticon-happy-outline', color: '#34A853' },
  { label: 'Orta', value: 'medium', icon: 'emoticon-neutral-outline', color: '#FBBC04' },
  { label: 'Rahatsız', value: 'uncomfortable', icon: 'emoticon-sad-outline', color: '#D93025' },
];

export function CommunityScreen() {
  const theme = useTheme();
  const user = useAppStore((s) => s.user);

  const [showLineModal, setShowLineModal] = useState(false);
  const [selectedLine, setSelectedLine] = useState<{ number: string; name: string } | null>(null);
  const [comfort, setComfort] = useState<ComfortOption>('comfortable');
  const [ac, setAc] = useState<AcOption>('good');
  const [temp, setTemp] = useState<TempOption>('normal');
  const [crowd, setCrowd] = useState<CrowdOption>('seated');
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState('');
  const [recentFeedbacks, setRecentFeedbacks] = useState<Feedback[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadRecent = useCallback(async () => {
    try {
      const data = await getRecentFeedbacks(8);
      setRecentFeedbacks(data);
    } catch {}
  }, []);

  useEffect(() => { loadRecent(); }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await loadRecent();
    setRefreshing(false);
  }

  async function handleSubmit() {
    if (!user || !selectedLine) return;
    setLoading(true);
    try {
      await submitFeedback({
        userId: user.uid,
        routeId: `line-${selectedLine.number}`,
        lineNumber: selectedLine.number,
        comfort,
        ac,
        temperature: temp,
        crowd,
        timestamp: new Date(),
      });
      setSnackbar(`Teşekkürler! +10 puan kazandınız.`);
      setSelectedLine(null);
      loadRecent();
    } catch {
      setSnackbar('Hata oluştu, tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>Topluluk</Text>
        <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
          Yolculuğunuzu değerlendirin, topluluğa katkı sağlayın.
        </Text>

        {/* Line Selector */}
        <TouchableRipple
          onPress={() => setShowLineModal(true)}
          style={[styles.lineSelector, {
            backgroundColor: selectedLine ? theme.colors.primaryContainer : theme.colors.surface,
            borderColor: selectedLine ? theme.colors.primary : theme.colors.outline,
          }]}
          borderless
        >
          <View style={styles.lineSelectorInner}>
            <MaterialCommunityIcons
              name="bus"
              size={22}
              color={selectedLine ? theme.colors.primary : theme.colors.onSurfaceVariant}
            />
            <View style={styles.lineSelectorText}>
              {selectedLine ? (
                <>
                  <Text style={[styles.lineSelectorNumber, { color: theme.colors.primary }]}>
                    Hat {selectedLine.number}
                  </Text>
                  <Text style={[styles.lineSelectorName, { color: theme.colors.onSurfaceVariant }]}>
                    {selectedLine.name}
                  </Text>
                </>
              ) : (
                <Text style={[styles.lineSelectorPlaceholder, { color: theme.colors.onSurfaceVariant }]}>
                  Hangi hattasinız? Seçin...
                </Text>
              )}
            </View>
            <MaterialCommunityIcons
              name="chevron-down"
              size={22}
              color={theme.colors.onSurfaceVariant}
            />
          </View>
        </TouchableRipple>

        {/* Feedback Form */}
        {selectedLine && (
          <Surface style={[styles.formCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
            <FeedbackChipGroup
              title="Klima"
              icon="air-conditioner"
              options={AC_OPTIONS}
              value={ac}
              onChange={(v) => setAc(v as AcOption)}
            />
            <Divider style={styles.divider} />
            <FeedbackChipGroup
              title="Sıcaklık"
              icon="thermometer"
              options={TEMP_OPTIONS}
              value={temp}
              onChange={(v) => setTemp(v as TempOption)}
            />
            <Divider style={styles.divider} />
            <FeedbackChipGroup
              title="Yoğunluk"
              icon="account-multiple"
              options={CROWD_OPTIONS}
              value={crowd}
              onChange={(v) => setCrowd(v as CrowdOption)}
            />
            <Divider style={styles.divider} />
            <FeedbackChipGroup
              title="Konfor"
              icon="seat-passenger"
              options={COMFORT_OPTIONS}
              value={comfort}
              onChange={(v) => setComfort(v as ComfortOption)}
            />

            <Button
              mode="contained"
              onPress={handleSubmit}
              loading={loading}
              disabled={loading || !user}
              style={styles.submitBtn}
              contentStyle={styles.submitBtnContent}
              icon="send"
              labelStyle={styles.submitBtnLabel}
            >
              Geri Bildirimi Gönder (+10 puan)
            </Button>

            {!user && (
              <Text style={[styles.guestNote, { color: theme.colors.onSurfaceVariant }]}>
                Geri bildirim göndermek için giriş yapmanız gerekiyor.
              </Text>
            )}
          </Surface>
        )}

        {/* Recent Feedbacks */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
              Son Bildirimler
            </Text>
            <MaterialCommunityIcons name="clock-outline" size={16} color={theme.colors.onSurfaceVariant} />
          </View>

          {recentFeedbacks.length === 0 ? (
            <Surface style={[styles.emptyCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
              <MaterialCommunityIcons name="chat-outline" size={36} color={theme.colors.onSurfaceVariant} />
              <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
                Henüz bildirim yok. İlk sen gönder!
              </Text>
            </Surface>
          ) : (
            <View style={styles.feedbackList}>
              {recentFeedbacks.map((fb) => (
                <RecentFeedbackCard key={fb.id} feedback={fb} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <LineSelectorModal
        visible={showLineModal}
        onDismiss={() => setShowLineModal(false)}
        onSelect={(number, name) => setSelectedLine({ number, name })}
      />

      <Snackbar
        visible={snackbar !== ''}
        onDismiss={() => setSnackbar('')}
        duration={3000}
        action={{ label: 'Tamam', onPress: () => setSnackbar('') }}
      >
        {snackbar}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, gap: 20, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: -4 },
  lineSelector: {
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  lineSelectorInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  lineSelectorText: { flex: 1, gap: 2 },
  lineSelectorNumber: { fontSize: 16, fontWeight: '700' },
  lineSelectorName: { fontSize: 13 },
  lineSelectorPlaceholder: { fontSize: 15 },
  formCard: { borderRadius: 16, padding: 20, gap: 16 },
  divider: { marginVertical: 4 },
  submitBtn: { borderRadius: 12, marginTop: 8 },
  submitBtnContent: { height: 52 },
  submitBtnLabel: { fontSize: 14, fontWeight: '600' },
  guestNote: { fontSize: 12, textAlign: 'center', marginTop: -8 },
  section: { gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '600', flex: 1 },
  emptyCard: { borderRadius: 14, padding: 24, alignItems: 'center', gap: 10 },
  emptyText: { fontSize: 14, textAlign: 'center' },
  feedbackList: { gap: 8 },
});
