import React, { useCallback, useState } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { Text, Surface, useTheme, Appbar, Button, Snackbar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getActiveAlerts, deleteAlert, postAlert, ALERT_LABELS, ALERT_ICONS, ALERT_EXPIRY_MINS } from '../services/firebase/alertService';
import { postAnnouncement, getAnnouncements, deleteAnnouncement } from '../services/firebase/announcementService';
import type { Announcement } from '../services/firebase/announcementService';
import { createRedeemCode, getRedeemCodes, deleteRedeemCode } from '../services/firebase/coinService';
import type { RedeemCode } from '../services/firebase/coinService';
import { useAppStore } from '../store/useAppStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, CommunityAlert } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminPanel'>;
type Tab = 'alerts' | 'announcements' | 'codes';

export function AdminPanelScreen({ navigation }: Props) {
  const theme = useTheme();
  const user = useAppStore(s => s.user);
  const [activeTab, setActiveTab] = useState<Tab>('alerts');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function describeError(e: unknown): string {
    const code = (e as { code?: string })?.code;
    if (code === 'permission-denied') return 'Yetkin yok — Firestore kuralları bu işlemi engelliyor.';
    const msg = (e as { message?: string })?.message;
    return msg ? `Hata: ${msg}` : 'Bilinmeyen bir hata oluştu.';
  }

  // Uyarılar state
  const [alerts, setAlerts] = useState<CommunityAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [newLineNumber, setNewLineNumber] = useState('');
  const [newType, setNewType] = useState<CommunityAlert['type']>('crowded');
  const [posting, setPosting] = useState(false);

  // Duyurular state
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annPosting, setAnnPosting] = useState(false);
  const [annDeleting, setAnnDeleting] = useState<string | null>(null);

  // Coin Kodları state
  const [codes, setCodes] = useState<RedeemCode[]>([]);
  const [newCode, setNewCode] = useState('');
  const [newCoinAmount, setNewCoinAmount] = useState('');
  const [newMaxUses, setNewMaxUses] = useState('');
  const [codePosting, setCodePosting] = useState(false);
  const [codeDeleting, setCodeDeleting] = useState<string | null>(null);

  const loadAlerts = useCallback(async () => {
    try {
      const data = await getActiveAlerts();
      setAlerts(data);
    } catch (e) { setErrorMsg(describeError(e)); }
    setAlertsLoading(false);
  }, []);

  const loadAnnouncements = useCallback(async () => {
    try {
      const data = await getAnnouncements();
      setAnnouncements(data);
    } catch (e) { setErrorMsg(describeError(e)); }
  }, []);

  const loadCodes = useCallback(async () => {
    try {
      const data = await getRedeemCodes();
      setCodes(data);
    } catch (e) { setErrorMsg(describeError(e)); }
  }, []);

  React.useEffect(() => {
    loadAlerts();
    loadAnnouncements();
    loadCodes();
  }, [loadAlerts, loadAnnouncements, loadCodes]);

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([loadAlerts(), loadAnnouncements(), loadCodes()]);
    setRefreshing(false);
  }

  async function handleCreateCode() {
    const coinAmount = Number(newCoinAmount);
    const maxUses = Number(newMaxUses);
    if (!newCode.trim() || !coinAmount || !maxUses) return;
    setCodePosting(true);
    try {
      await createRedeemCode(newCode.trim(), coinAmount, maxUses, user?.email ?? null);
      setNewCode('');
      setNewCoinAmount('');
      setNewMaxUses('');
      await loadCodes();
    } catch (e) { setErrorMsg(describeError(e)); }
    setCodePosting(false);
  }

  async function handleDeleteCode(code: string) {
    setCodeDeleting(code);
    try {
      await deleteRedeemCode(code);
      setCodes(prev => prev.filter(c => c.code !== code));
    } catch (e) { setErrorMsg(describeError(e)); }
    setCodeDeleting(null);
  }

  async function handlePostAlert() {
    if (!newLineNumber.trim() || !user) return;
    setPosting(true);
    try {
      const now = new Date();
      await postAlert({
        userId: user.uid,
        lineNumber: newLineNumber.trim(),
        type: newType,
        createdAt: now,
        expiresAt: new Date(now.getTime() + ALERT_EXPIRY_MINS[newType] * 60000),
      });
      setNewLineNumber('');
      await loadAlerts();
    } catch (e) { setErrorMsg(describeError(e)); }
    setPosting(false);
  }

  async function handleDeleteAlert(id: string) {
    setDeleting(id);
    try {
      await deleteAlert(id);
      setAlerts(prev => prev.filter(a => a.id !== id));
    } catch (e) { setErrorMsg(describeError(e)); }
    setDeleting(null);
  }

  async function handlePostAnnouncement() {
    if (!annTitle.trim() || !annBody.trim()) return;
    setAnnPosting(true);
    try {
      await postAnnouncement({ title: annTitle.trim(), body: annBody.trim() });
      setAnnTitle('');
      setAnnBody('');
      await loadAnnouncements();
    } catch (e) { setErrorMsg(describeError(e)); }
    setAnnPosting(false);
  }

  async function handleDeleteAnnouncement(id: string) {
    setAnnDeleting(id);
    try {
      await deleteAnnouncement(id);
      setAnnouncements(prev => prev.filter(a => a.id !== id));
    } catch (e) { setErrorMsg(describeError(e)); }
    setAnnDeleting(null);
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header style={{ backgroundColor: theme.colors.background }} elevated={false}>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Admin Paneli" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      {/* Sekme seçici */}
      <View style={[styles.tabBar, { backgroundColor: theme.colors.surface }]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'alerts' && { borderBottomColor: theme.colors.primary, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('alerts')}
        >
          <Text style={[styles.tabLabel, { color: activeTab === 'alerts' ? theme.colors.primary : theme.colors.onSurfaceVariant }]}>
            Uyarılar
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'announcements' && { borderBottomColor: theme.colors.primary, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('announcements')}
        >
          <Text style={[styles.tabLabel, { color: activeTab === 'announcements' ? theme.colors.primary : theme.colors.onSurfaceVariant }]}>
            Duyurular
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'codes' && { borderBottomColor: theme.colors.primary, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('codes')}
        >
          <Text style={[styles.tabLabel, { color: activeTab === 'codes' ? theme.colors.primary : theme.colors.onSurfaceVariant }]}>
            Coin Kodları
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'alerts' ? (
        <FlatList
          data={alerts}
          keyExtractor={a => a.id!}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={
            !alertsLoading ? (
              <View style={styles.empty}>
                <MaterialCommunityIcons name="shield-check" size={48} color={theme.colors.onSurfaceVariant} />
                <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>Aktif uyarı yok</Text>
              </View>
            ) : null
          }
          ListHeaderComponent={
            <View>
              <Surface style={[styles.createCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
                <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Yeni Uyarı Yayınla</Text>
                <TextInput
                  placeholder="Hat numarası (örn: 148)"
                  placeholderTextColor={theme.colors.onSurfaceVariant}
                  value={newLineNumber}
                  onChangeText={setNewLineNumber}
                  keyboardType="numeric"
                  style={[styles.lineInput, { color: theme.colors.onSurface, borderColor: theme.colors.outline }]}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeRow}>
                  {(Object.keys(ALERT_LABELS) as CommunityAlert['type'][]).map(t => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setNewType(t)}
                      style={[styles.typeChip, { backgroundColor: newType === t ? theme.colors.primary : theme.colors.surfaceVariant }]}
                    >
                      <Text style={{ color: newType === t ? '#FFF' : theme.colors.onSurface, fontSize: 12 }}>
                        {ALERT_LABELS[t]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Button mode="contained" onPress={handlePostAlert} loading={posting} disabled={!newLineNumber.trim() || posting} style={{ borderRadius: 10 }}>
                  Yayınla
                </Button>
              </Surface>
              <View style={[styles.section, { marginTop: 8 }]}>
                <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Aktif Topluluk Uyarıları</Text>
                <Text style={[styles.sectionSub, { color: theme.colors.onSurfaceVariant }]}>
                  {alerts.length} uyarı · Sil butonuyla kaldırabilirsin
                </Text>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
              <View style={styles.cardRow}>
                <MaterialCommunityIcons name={ALERT_ICONS[item.type] as any} size={22} color="#D93025" />
                <View style={styles.cardInfo}>
                  <Text style={[styles.cardTitle, { color: theme.colors.onSurface }]}>
                    Hat {item.lineNumber} — {ALERT_LABELS[item.type]}
                  </Text>
                  <Text style={[styles.cardSub, { color: theme.colors.onSurfaceVariant }]}>
                    {Math.max(0, Math.round((item.expiresAt.getTime() - Date.now()) / 60000))} dk içinde sona erer · {item.upvotes} oy
                  </Text>
                </View>
                <Button mode="text" compact textColor="#D93025" loading={deleting === item.id} disabled={deleting === item.id} onPress={() => handleDeleteAlert(item.id!)}>
                  Sil
                </Button>
              </View>
            </Surface>
          )}
        />
      ) : activeTab === 'announcements' ? (
        <FlatList
          data={announcements}
          keyExtractor={a => a.id!}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialCommunityIcons name="bullhorn-outline" size={48} color={theme.colors.onSurfaceVariant} />
              <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>Duyuru yok</Text>
            </View>
          }
          ListHeaderComponent={
            <Surface style={[styles.createCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
              <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Yeni Duyuru / Not</Text>
              <TextInput
                placeholder="Başlık"
                placeholderTextColor={theme.colors.onSurfaceVariant}
                value={annTitle}
                onChangeText={setAnnTitle}
                style={[styles.lineInput, { color: theme.colors.onSurface, borderColor: theme.colors.outline }]}
              />
              <TextInput
                placeholder="İçerik"
                placeholderTextColor={theme.colors.onSurfaceVariant}
                value={annBody}
                onChangeText={setAnnBody}
                multiline
                numberOfLines={3}
                style={[styles.lineInput, styles.bodyInput, { color: theme.colors.onSurface, borderColor: theme.colors.outline }]}
              />
              <Button mode="contained" onPress={handlePostAnnouncement} loading={annPosting} disabled={!annTitle.trim() || !annBody.trim() || annPosting} style={{ borderRadius: 10 }}>
                Yayınla
              </Button>
            </Surface>
          }
          renderItem={({ item }) => (
            <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
              <View style={styles.cardRow}>
                <MaterialCommunityIcons name="bullhorn" size={22} color={theme.colors.primary} />
                <View style={styles.cardInfo}>
                  <Text style={[styles.cardTitle, { color: theme.colors.onSurface }]}>{item.title}</Text>
                  <Text style={[styles.cardSub, { color: theme.colors.onSurfaceVariant }]}>{item.body}</Text>
                  <Text style={[styles.cardSub, { color: theme.colors.onSurfaceVariant, marginTop: 2 }]}>
                    {item.createdAt.toLocaleDateString('tr-TR')}
                  </Text>
                </View>
                <Button mode="text" compact textColor="#D93025" loading={annDeleting === item.id} disabled={annDeleting === item.id} onPress={() => handleDeleteAnnouncement(item.id!)}>
                  Sil
                </Button>
              </View>
            </Surface>
          )}
        />
      ) : (
        <FlatList
          data={codes}
          keyExtractor={c => c.code}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <MaterialCommunityIcons name="ticket-percent-outline" size={48} color={theme.colors.onSurfaceVariant} />
              <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>Kod yok</Text>
            </View>
          }
          ListHeaderComponent={
            <Surface style={[styles.createCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
              <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Yeni Coin Kodu</Text>
              <TextInput
                placeholder="Kod (örn: YOLBUL50)"
                placeholderTextColor={theme.colors.onSurfaceVariant}
                value={newCode}
                onChangeText={setNewCode}
                autoCapitalize="characters"
                style={[styles.lineInput, { color: theme.colors.onSurface, borderColor: theme.colors.outline }]}
              />
              <TextInput
                placeholder="Coin miktarı"
                placeholderTextColor={theme.colors.onSurfaceVariant}
                value={newCoinAmount}
                onChangeText={setNewCoinAmount}
                keyboardType="numeric"
                style={[styles.lineInput, { color: theme.colors.onSurface, borderColor: theme.colors.outline }]}
              />
              <TextInput
                placeholder="Kullanım limiti (örn: 100)"
                placeholderTextColor={theme.colors.onSurfaceVariant}
                value={newMaxUses}
                onChangeText={setNewMaxUses}
                keyboardType="numeric"
                style={[styles.lineInput, { color: theme.colors.onSurface, borderColor: theme.colors.outline }]}
              />
              <Button
                mode="contained"
                onPress={handleCreateCode}
                loading={codePosting}
                disabled={!newCode.trim() || !newCoinAmount || !newMaxUses || codePosting}
                style={{ borderRadius: 10 }}
              >
                Oluştur
              </Button>
            </Surface>
          }
          renderItem={({ item }) => (
            <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
              <View style={styles.cardRow}>
                <MaterialCommunityIcons name="ticket-percent" size={22} color={theme.colors.primary} />
                <View style={styles.cardInfo}>
                  <Text style={[styles.cardTitle, { color: theme.colors.onSurface }]}>
                    {item.code} — {item.coinAmount} coin
                  </Text>
                  <Text style={[styles.cardSub, { color: theme.colors.onSurfaceVariant }]}>
                    Kullanım: {item.usedCount}/{item.maxUses}
                  </Text>
                </View>
                <Button mode="text" compact textColor="#D93025" loading={codeDeleting === item.code} disabled={codeDeleting === item.code} onPress={() => handleDeleteCode(item.code)}>
                  Sil
                </Button>
              </View>
            </Surface>
          )}
        />
      )}

      <Snackbar visible={!!errorMsg} onDismiss={() => setErrorMsg(null)} duration={4000}>
        {errorMsg}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  tabBar: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.1)' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabLabel: { fontSize: 14, fontWeight: '600' },
  list: { padding: 16, gap: 10, paddingBottom: 40 },
  section: { gap: 4, marginBottom: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  sectionSub: { fontSize: 13 },
  createCard: { borderRadius: 14, padding: 16, gap: 12, marginBottom: 4 },
  lineInput: { borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 15 },
  bodyInput: { minHeight: 80, textAlignVertical: 'top' },
  typeRow: { flexGrow: 0 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 8 },
  card: { borderRadius: 14, padding: 14 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardInfo: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 14, fontWeight: '600' },
  cardSub: { fontSize: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 80 },
  emptyText: { fontSize: 15 },
});
