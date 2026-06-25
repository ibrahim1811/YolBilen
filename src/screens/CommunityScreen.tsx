import React, { useState, useEffect, useCallback } from 'react';
import { trackScreenView, trackFeedbackSubmit } from '../services/telemetry/telemetryService';
import { View, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, TextInput } from 'react-native';
import { Text, Surface, useTheme, Button, Snackbar, TouchableRipple, Divider, Chip, ActivityIndicator } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { FeedbackChipGroup } from '../components/community/FeedbackChipGroup';
import { LineSelectorModal } from '../components/community/LineSelector';
import { RecentFeedbackCard } from '../components/community/RecentFeedbackCard';
import { CrowdMapModal } from '../components/community/CrowdMapModal';
import { submitFeedback, getRecentFeedbacks } from '../services/firebase/firestore';
import { postAlert, getActiveAlerts, upvoteAlert, ALERT_LABELS, ALERT_ICONS, ALERT_EXPIRY_MINS } from '../services/firebase/alertService';
import { checkIsAdmin } from '../services/firebase/adminService';
import { getApproachingBuses, nearestIztekStopId, type ApproachingBus } from '../services/iztek/iztekService';
import { useAppStore } from '../store/useAppStore';
import type { Feedback, CommunityAlert } from '../types';

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
  const setUser = useAppStore((s) => s.setUser);
  const pendingFeedbackPlate = useAppStore((s) => s.pendingFeedbackPlate);
  const setPendingFeedbackPlate = useAppStore((s) => s.setPendingFeedbackPlate);

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
  const [alerts, setAlerts] = useState<CommunityAlert[]>([]);
  const [alertType, setAlertType] = useState<CommunityAlert['type']>('ac_broken');
  const [showAlertForm, setShowAlertForm] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // GPS otobüs tespiti
  const [detectingBus, setDetectingBus] = useState(false);
  const [nearbyBuses, setNearbyBuses] = useState<ApproachingBus[]>([]);
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const [plateInput, setPlateInput] = useState('');
  const [showBusList, setShowBusList] = useState(false);
  const [showCrowdMap, setShowCrowdMap] = useState(false);

  useEffect(() => { trackScreenView('CommunityScreen'); }, []);

  const loadRecent = useCallback(async () => {
    try {
      const [feedbacks, activeAlerts] = await Promise.all([getRecentFeedbacks(8), getActiveAlerts()]);
      setRecentFeedbacks(feedbacks);
      setAlerts(activeAlerts);
    } catch {}
  }, []);

  useEffect(() => { loadRecent(); }, []);

  useEffect(() => {
    if (pendingFeedbackPlate) {
      setPlateInput(pendingFeedbackPlate);
      setPendingFeedbackPlate(null);
    }
  }, [pendingFeedbackPlate]);

  useEffect(() => {
    if (user && !user.isGuest) {
      checkIsAdmin(user.email).then(setIsAdmin).catch(() => {});
    } else {
      setIsAdmin(false);
    }
  }, [user?.uid]);

  async function detectNearbyBuses() {
    setDetectingBus(true);
    setNearbyBuses([]);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setSnackbar('Konum izni gerekli'); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const iztekId = nearestIztekStopId(pos.coords.latitude, pos.coords.longitude);
      if (!iztekId) { setSnackbar('Yakınında durak bulunamadı.'); return; }
      const buses = await getApproachingBuses(iztekId);
      if (buses.length === 0) { setSnackbar('Şu an yaklaşan otobüs yok.'); return; }
      setNearbyBuses(buses);
      setShowBusList(true);
    } catch {
      setSnackbar('Konum alınamadı.');
    } finally {
      setDetectingBus(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadRecent();
    setRefreshing(false);
  }

  async function handleSubmit() {
    if (!user || !selectedLine) return;
    if (user.isGuest) {
      setSnackbar('Geri bildirim göndermek için giriş yapmanız gerekiyor.');
      return;
    }
    setLoading(true);
    try {
      let feedbackLat: number | undefined;
      let feedbackLon: number | undefined;
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        feedbackLat = pos.coords.latitude;
        feedbackLon = pos.coords.longitude;
      } catch {}

      await submitFeedback({
        userId: user.uid,
        routeId: `line-${selectedLine.number}`,
        lineNumber: selectedLine.number,
        comfort,
        ac,
        temperature: temp,
        crowd,
        timestamp: new Date(),
        ...(selectedBusId ? { busId: selectedBusId } : {}),
        ...(plateInput.trim() ? { plateNumber: plateInput.trim() } : {}),
        ...(feedbackLat !== undefined ? { latitude: feedbackLat, longitude: feedbackLon } : {}),
      });
      trackFeedbackSubmit(!!plateInput.trim());
      setSnackbar('Teşekkürler! +10 puan kazandınız.');
      if (user) setUser({ ...user, contributionPoints: (user.contributionPoints ?? 0) + 10 });
      setSelectedLine(null);
      setSelectedBusId(null);
      setPlateInput('');
      setNearbyBuses([]);
      setShowBusList(false);
      await loadRecent();
    } catch (e: any) {
      console.error('submitFeedback error:', e?.code, e?.message);
      if (e?.message?.includes('auth/')) {
        setSnackbar('Oturumunuz sona erdi. Lütfen yeniden giriş yapın.');
      } else if (e?.code?.includes('permission-denied')) {
        setSnackbar('Gönderme izni yok. Lütfen giriş yapın.');
      } else {
        setSnackbar(`Hata: ${e?.message ?? 'Bilinmeyen hata'}`);
      }
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

        {/* Otobüs Tespiti — GPS veya elle */}
        <View style={styles.busDetectRow}>
          <TouchableRipple
            onPress={() => setShowLineModal(true)}
            style={[styles.lineSelector, styles.lineSelectorFlex, {
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
                    Hangi hattasınız?
                  </Text>
                )}
              </View>
              <MaterialCommunityIcons name="chevron-down" size={22} color={theme.colors.onSurfaceVariant} />
            </View>
          </TouchableRipple>

          <TouchableRipple
            onPress={detectNearbyBuses}
            style={[styles.gpsBtn, { backgroundColor: theme.colors.secondaryContainer, borderColor: theme.colors.outline }]}
            borderless
          >
            <View style={styles.gpsBtnInner}>
              {detectingBus
                ? <ActivityIndicator size={20} color={theme.colors.secondary} />
                : <MaterialCommunityIcons name="map-marker-radius" size={22} color={theme.colors.secondary} />}
              <Text style={[styles.gpsBtnLabel, { color: theme.colors.secondary }]}>Yakınımda</Text>
            </View>
          </TouchableRipple>
        </View>

        {/* Yaklaşan otobüs listesi */}
        {showBusList && nearbyBuses.length > 0 && (
          <Surface style={[styles.busListCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
            <Text style={[styles.busListTitle, { color: theme.colors.onSurface }]}>Yaklaşan Otobüsler</Text>
            {nearbyBuses.map(b => {
              const isSelected = selectedBusId === String(b.otobusId);
              return (
                <TouchableRipple
                  key={b.otobusId}
                  onPress={() => {
                    setSelectedBusId(String(b.otobusId));
                    setSelectedLine({ number: String(b.hatNumarasi), name: b.hatAdi });
                  }}
                  style={[styles.busRow, {
                    backgroundColor: isSelected ? theme.colors.primaryContainer : 'transparent',
                    borderColor: isSelected ? theme.colors.primary : theme.colors.outlineVariant,
                  }]}
                  borderless
                >
                  <View style={styles.busRowInner}>
                    <MaterialCommunityIcons name="bus" size={18} color={isSelected ? theme.colors.primary : theme.colors.onSurfaceVariant} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.busRowLine, { color: isSelected ? theme.colors.primary : theme.colors.onSurface }]}>
                        Hat {b.hatNumarasi}
                      </Text>
                      <Text style={[styles.busRowDetail, { color: theme.colors.onSurfaceVariant }]}>
                        {b.hatAdi} · {b.kalanDurakSayisi} durak uzakta
                      </Text>
                    </View>
                    <Text style={[styles.busRowId, { color: theme.colors.onSurfaceVariant }]}>#{b.otobusId}</Text>
                    {isSelected && <MaterialCommunityIcons name="check-circle" size={18} color={theme.colors.primary} />}
                  </View>
                </TouchableRipple>
              );
            })}
          </Surface>
        )}

        {/* Plaka girişi (isteğe bağlı) */}
        {selectedLine && (
          <Surface style={[styles.plateCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
            <MaterialCommunityIcons name="card-text-outline" size={18} color={theme.colors.onSurfaceVariant} />
            <TextInput
              style={[styles.plateInput, { color: theme.colors.onSurface }]}
              placeholder="Otobüs plakası (isteğe bağlı)"
              placeholderTextColor={theme.colors.onSurfaceVariant}
              value={plateInput}
              onChangeText={setPlateInput}
              autoCapitalize="characters"
              maxLength={12}
            />
          </Surface>
        )}

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

        {/* Community Alerts */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Topluluk Uyarıları</Text>
            <TouchableOpacity onPress={() => setShowCrowdMap(true)} style={{ marginRight: 8 }}>
              <MaterialCommunityIcons name="map-marker-multiple" size={22} color={theme.colors.primary} />
            </TouchableOpacity>
            {isAdmin && selectedLine && (
              <TouchableOpacity onPress={() => setShowAlertForm(v => !v)}>
                <MaterialCommunityIcons name={showAlertForm ? 'minus-circle-outline' : 'plus-circle-outline'} size={22} color={theme.colors.primary} />
              </TouchableOpacity>
            )}
          </View>

          {showAlertForm && selectedLine && (
            <Surface style={[styles.alertForm, { backgroundColor: theme.colors.surface }]} elevation={1}>
              <Text style={[styles.alertFormTitle, { color: theme.colors.onSurface }]}>
                Hat {selectedLine.number} için uyarı gönder
              </Text>
              <View style={styles.alertTypeRow}>
                {(Object.keys(ALERT_LABELS) as CommunityAlert['type'][]).map(t => (
                  <Chip
                    key={t}
                    selected={alertType === t}
                    onPress={() => setAlertType(t)}
                    compact
                    icon={ALERT_ICONS[t]}
                    style={styles.alertChip}
                  >
                    {ALERT_LABELS[t]}
                  </Chip>
                ))}
              </View>
              <Button
                mode="contained"
                compact
                onPress={async () => {
                  if (!user || !selectedLine) return;
                  const now = new Date();
                  const expiresAt = new Date(now.getTime() + ALERT_EXPIRY_MINS[alertType] * 60000);
                  try {
                    await postAlert({ userId: user.uid, lineNumber: selectedLine.number, type: alertType, createdAt: now, expiresAt });
                    setSnackbar('Uyarı gönderildi!');
                    setShowAlertForm(false);
                    loadRecent();
                  } catch (e: any) {
                    setSnackbar(e?.message?.includes('auth/') ? 'Oturumunuz sona erdi. Lütfen yeniden giriş yapın.' : 'Hata oluştu, tekrar deneyin.');
                  }
                }}
              >
                Uyarı Gönder
              </Button>
            </Surface>
          )}

          {alerts.length === 0 ? (
            <Surface style={[styles.emptyCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
              <MaterialCommunityIcons name="shield-check" size={28} color={theme.colors.onSurfaceVariant} />
              <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>Aktif uyarı yok</Text>
            </Surface>
          ) : (
            <View style={styles.feedbackList}>
              {alerts.map(a => (
                <Surface key={a.id} style={[styles.alertCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
                  <MaterialCommunityIcons name={ALERT_ICONS[a.type] as any} size={20} color="#D93025" />
                  <View style={styles.alertInfo}>
                    <Text style={[styles.alertTitle, { color: theme.colors.onSurface }]}>
                      Hat {a.lineNumber} — {ALERT_LABELS[a.type]}
                    </Text>
                    <Text style={[styles.alertExpiry, { color: theme.colors.onSurfaceVariant }]}>
                      {Math.max(0, Math.round((a.expiresAt.getTime() - Date.now()) / 60000))} dk içinde sona erer
                    </Text>
                  </View>
                  <TouchableOpacity onPress={async () => { await upvoteAlert(a.id!); loadRecent(); }}>
                    <View style={styles.upvoteBtn}>
                      <MaterialCommunityIcons name="thumb-up-outline" size={16} color={theme.colors.primary} />
                      <Text style={[styles.upvoteCount, { color: theme.colors.primary }]}>{a.upvotes}</Text>
                    </View>
                  </TouchableOpacity>
                </Surface>
              ))}
            </View>
          )}
        </View>

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

      <CrowdMapModal visible={showCrowdMap} onDismiss={() => setShowCrowdMap(false)} />
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
  busDetectRow: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  lineSelector: {
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  lineSelectorFlex: { flex: 1 },
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
  gpsBtn: { borderRadius: 16, borderWidth: 1.5, overflow: 'hidden', minWidth: 72 },
  gpsBtnInner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 10, gap: 4 },
  gpsBtnLabel: { fontSize: 11, fontWeight: '600' },
  busListCard: { borderRadius: 14, padding: 12, gap: 8 },
  busListTitle: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  busRow: { borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  busRowInner: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 10 },
  busRowLine: { fontSize: 14, fontWeight: '700' },
  busRowDetail: { fontSize: 12 },
  busRowId: { fontSize: 12 },
  plateCard: { borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 4, gap: 10 },
  plateInput: { flex: 1, fontSize: 14, paddingVertical: 10 },
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
  alertForm: { borderRadius: 14, padding: 16, gap: 12 },
  alertFormTitle: { fontSize: 14, fontWeight: '600' },
  alertTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  alertChip: { marginBottom: 2 },
  alertCard: { borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  alertInfo: { flex: 1 },
  alertTitle: { fontSize: 14, fontWeight: '600' },
  alertExpiry: { fontSize: 12 },
  upvoteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6 },
  upvoteCount: { fontSize: 13, fontWeight: '600' },
});
