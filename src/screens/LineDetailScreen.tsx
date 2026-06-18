import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text, useTheme, Appbar, Surface, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ComfortScoreCard } from '../components/lines/ComfortScoreCard';
import { getLineComfortScore } from '../services/firebase/lineStats';
import { getLineFeedbacks } from '../services/firebase/firestore';
import { getLineScheduleFromFirestore, getScheduleForDay } from '../services/firebase/scheduleService';
import { RecentFeedbackCard } from '../components/community/RecentFeedbackCard';
import { useFavorites } from '../hooks/useFavorites';
import { useAppStore } from '../store/useAppStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, ComfortScore, Feedback } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'LineDetail'>;

function isRingRoute(name: string) {
  return name.toLowerCase().includes('ring') || name.toLowerCase().includes('halka');
}

export function LineDetailScreen({ navigation, route }: Props) {
  const theme = useTheme();
  const { lineNumber, lineName } = route.params;
  const user = useAppStore((s) => s.user);
  const { isLineFavorited, addLine, removeLine, favoriteLines } = useFavorites();

  const [score, setScore] = useState<ComfortScore | null>(null);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);

  const parts = lineName.split(' - ');
  const fromStop = parts[0] ?? lineName;
  const toStop = parts[1] ?? '';
  const isRing = isRingRoute(lineName);

  const [serviceType, setServiceType] = useState<'weekday' | 'saturday' | 'sunday'>('weekday');
  const [rawSchedule, setRawSchedule] = useState<import('../services/firebase/scheduleService').LineSchedule>({});
  const [scheduleLoading, setScheduleLoading] = useState(true);

  useEffect(() => {
    setScheduleLoading(true);
    getLineScheduleFromFirestore(lineNumber)
      .then(setRawSchedule)
      .finally(() => setScheduleLoading(false));
  }, [lineNumber]);

  const schedule = React.useMemo(
    () => getScheduleForDay(rawSchedule, serviceType),
    [rawSchedule, serviceType]
  );

  useEffect(() => {
    Promise.all([
      getLineComfortScore(lineNumber).catch(() => null),
      getLineFeedbacks(lineNumber).catch(() => []),
    ]).then(([s, f]) => {
      setScore(s);
      setFeedbacks((f as Feedback[]).slice(0, 5));
    }).finally(() => setLoading(false));
  }, [lineNumber]);

  function handleToggleFavorite() {
    const existing = favoriteLines.find(l => l.lineNumber === lineNumber);
    if (existing) removeLine(existing.id);
    else addLine(lineNumber, lineName);
  }

  const isFav = isLineFavorited(lineNumber);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header style={{ backgroundColor: theme.colors.background }} elevated={false}>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={`Hat ${lineNumber}`} titleStyle={styles.headerTitle} />
        {!user?.isGuest && (
          <IconButton
            icon={isFav ? 'star' : 'star-outline'}
            iconColor={isFav ? '#FBBC04' : theme.colors.onSurfaceVariant}
            size={24}
            onPress={handleToggleFavorite}
          />
        )}
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <Surface style={[styles.heroCard, { backgroundColor: theme.colors.primary }]} elevation={0}>
          <View style={[styles.heroBadge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <MaterialCommunityIcons name="bus" size={32} color="#FFF" />
          </View>
          <Text style={styles.heroNumber}>{lineNumber}</Text>
          <Text style={styles.heroName}>{lineName}</Text>
        </Surface>

        {/* Nereden / Nereye */}
        <Surface style={[styles.routeCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Güzergah</Text>
          <View style={styles.routeRow}>
            <View style={styles.routeStop}>
              <View style={[styles.dot, { backgroundColor: '#34A853' }]} />
              <View style={styles.stopInfo}>
                <Text style={[styles.stopLabel, { color: theme.colors.onSurfaceVariant }]}>Başlangıç</Text>
                <Text style={[styles.stopName, { color: theme.colors.onSurface }]}>{fromStop}</Text>
              </View>
            </View>
            <View style={[styles.routeLine, { backgroundColor: theme.colors.outline }]} />
            <View style={styles.routeStop}>
              <View style={[styles.dot, { backgroundColor: theme.colors.primary }]} />
              <View style={styles.stopInfo}>
                <Text style={[styles.stopLabel, { color: theme.colors.onSurfaceVariant }]}>Son Durak</Text>
                <Text style={[styles.stopName, { color: theme.colors.onSurface }]}>{toStop || fromStop}</Text>
              </View>
            </View>
          </View>
        </Surface>

        {/* Sefer Saatleri */}
        <Surface style={[styles.scheduleCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <View style={styles.scheduleHeader}>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Sefer Saatleri</Text>
            {isRing && (
              <View style={[styles.ringBadge, { backgroundColor: theme.colors.secondaryContainer }]}>
                <MaterialCommunityIcons name="sync" size={12} color={theme.colors.secondary} />
                <Text style={[styles.ringText, { color: theme.colors.secondary }]}>Ring Hat</Text>
              </View>
            )}
          </View>

          {/* Gün seçici */}
          <View style={styles.dayRow}>
            {(['weekday', 'saturday', 'sunday'] as const).map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => setServiceType(s)}
                style={[styles.dayBtn, serviceType === s && { backgroundColor: theme.colors.primaryContainer }]}
              >
                <Text style={[styles.dayBtnText, { color: serviceType === s ? theme.colors.primary : theme.colors.onSurfaceVariant }]}>
                  {s === 'weekday' ? 'Hafta İçi' : s === 'saturday' ? 'Cumartesi' : 'Pazar'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {scheduleLoading ? (
            <Text style={[styles.scheduleNote, { color: theme.colors.onSurfaceVariant }]}>
              Saatler yükleniyor...
            </Text>
          ) : schedule.dir0.length === 0 && schedule.dir1.length === 0 ? (
            <Text style={[styles.scheduleNote, { color: theme.colors.onSurfaceVariant }]}>
              Bu gün için sefer verisi yok.
            </Text>
          ) : (
            <>
              {schedule.dir0.length > 0 && (
                <>
                  <Text style={[styles.dirLabel, { color: theme.colors.onSurface }]}>
                    {fromStop} → {toStop || fromStop}
                  </Text>
                  <View style={styles.timeGrid}>
                    {schedule.dir0.map(t => (
                      <View key={t} style={[styles.timeBadge, { backgroundColor: theme.colors.primaryContainer }]}>
                        <Text style={[styles.timeText, { color: theme.colors.primary }]}>{t}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}

              {schedule.dir1.length > 0 && (
                <>
                  <Text style={[styles.dirLabel, { color: theme.colors.onSurface, marginTop: 12 }]}>
                    {toStop || fromStop} → {fromStop}
                  </Text>
                  <View style={styles.timeGrid}>
                    {schedule.dir1.map(t => (
                      <View key={t} style={[styles.timeBadge, { backgroundColor: theme.colors.secondaryContainer }]}>
                        <Text style={[styles.timeText, { color: theme.colors.secondary }]}>{t}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </>
          )}
        </Surface>

        {/* Konfor Skoru */}
        {score ? (
          <ComfortScoreCard score={score} />
        ) : !loading ? (
          <Surface style={[styles.noScoreCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
            <MaterialCommunityIcons name="chart-bar" size={36} color={theme.colors.onSurfaceVariant} />
            <Text style={[styles.noScoreText, { color: theme.colors.onSurfaceVariant }]}>
              Henüz yeterli veri yok.{'\n'}İlk geri bildirimi sen gönder!
            </Text>
          </Surface>
        ) : null}

        {/* Son Bildirimler */}
        {feedbacks.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
              Son Kullanıcı Bildirimleri
            </Text>
            <View style={styles.feedbackList}>
              {feedbacks.map((fb) => (
                <RecentFeedbackCard key={fb.id} feedback={fb} />
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  scroll: { padding: 20, gap: 16, paddingBottom: 40 },
  heroCard: { borderRadius: 20, padding: 28, alignItems: 'center', gap: 10 },
  heroBadge: { width: 64, height: 64, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  heroNumber: { color: '#FFF', fontSize: 32, fontWeight: '900', letterSpacing: -1 },
  heroName: { color: 'rgba(255,255,255,0.85)', fontSize: 15, textAlign: 'center' },
  routeCard: { borderRadius: 16, padding: 16, gap: 14 },
  routeRow: { gap: 0 },
  routeStop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  routeLine: { width: 2, height: 20, marginLeft: 5, marginVertical: 4 },
  stopInfo: { gap: 2 },
  stopLabel: { fontSize: 11, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5 },
  stopName: { fontSize: 14, fontWeight: '600' },
  scheduleCard: { borderRadius: 16, padding: 16, gap: 10 },
  scheduleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ringBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  ringText: { fontSize: 11, fontWeight: '600' },
  scheduleNote: { fontSize: 12 },
  dayRow: { flexDirection: 'row', gap: 8 },
  dayBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  dayBtnText: { fontSize: 12, fontWeight: '600' },
  dirLabel: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  timeText: { fontSize: 13, fontWeight: '600' },
  noScoreCard: { borderRadius: 16, padding: 32, alignItems: 'center', gap: 12 },
  noScoreText: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  section: { gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '600' },
  feedbackList: { gap: 8 },
});
