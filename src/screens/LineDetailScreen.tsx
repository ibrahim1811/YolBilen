import React, { useEffect, useState } from 'react';
import { trackScreenView, trackLineOpen } from '../services/telemetry/telemetryService';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text, useTheme, Appbar, Surface, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ComfortScoreCard } from '../components/lines/ComfortScoreCard';
import { getLineComfortScore } from '../services/firebase/lineStats';
import { getLineFeedbacks } from '../services/firebase/firestore';
import { getLineScheduleFromFirestore, getScheduleForDay } from '../services/firebase/scheduleService';
import { getOrderedStopsForDir } from '../data/gtfsData';
import type { IzmirStop } from '../data/gtfsData';
import { RecentFeedbackCard } from '../components/community/RecentFeedbackCard';
import { LineRouteMapModal } from '../components/common/LineRouteMapModal';
import { useFavorites } from '../hooks/useFavorites';
import { useAppStore } from '../store/useAppStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, ComfortScore, Feedback } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'LineDetail'>;

function minsToHHMM(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

function isRingRoute(name: string) {
  const lower = name.toLowerCase();
  return /\bring\s*hat\b/.test(lower) || /\bhalka\s+hat\b/.test(lower);
}

function norm(s: string) {
  return s.toLowerCase().replace(/[İI]/g, 'i').replace(/[Şş]/g, 's').replace(/[Ğğ]/g, 'g')
    .replace(/[Üü]/g, 'u').replace(/[Öö]/g, 'o').replace(/[Çç]/g, 'c').replace(/\s+/g, ' ').trim();
}

function orderedLineStops(lineNumber: string, fromStop: string, toStop: string): IzmirStop[] {
  const dir0 = getOrderedStopsForDir(lineNumber, 0);
  const dir1 = getOrderedStopsForDir(lineNumber, 1);
  const seen0 = new Set(dir0.map(s => s.id));
  const all = [...dir0, ...dir1.filter(s => !seen0.has(s.id))];
  if (all.length === 0) return [];

  const qFrom = norm(fromStop);
  const qTo = norm(toStop);
  const start = all.find(s => norm(s.name).includes(qFrom) || qFrom.includes(norm(s.name)));
  const end = toStop ? all.find(s => norm(s.name).includes(qTo) || qTo.includes(norm(s.name))) : undefined;

  const anchor = start ?? all[0];
  const tail = end ?? all[all.length - 1];
  const dx = tail.lon - anchor.lon;
  const dy = tail.lat - anchor.lat;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return all;

  const seen = new Set<string>();
  return [...all]
    .map(s => ({ s, t: ((s.lon - anchor.lon) * dx + (s.lat - anchor.lat) * dy) / len2 }))
    .sort((a, b) => a.t - b.t)
    .filter(({ s }) => {
      const key = s.name.trim().toLowerCase();
      return seen.has(key) ? false : (seen.add(key), true);
    })
    .map(x => x.s);
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
  const lineStops = React.useMemo(() => orderedLineStops(lineNumber, fromStop, toStop), [lineNumber, fromStop, toStop]);
  const hasOnlyWeekday = React.useMemo(
    () => rawSchedule.weekday != null && rawSchedule.saturday == null && rawSchedule.sunday == null,
    [rawSchedule]
  );

  useEffect(() => { trackScreenView('LineDetail'); trackLineOpen(lineNumber); }, [lineNumber]);

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
  const [showRouteMap, setShowRouteMap] = React.useState(false);

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
          ) : Object.keys(rawSchedule).length === 0 ? (
            <Text style={[styles.scheduleNote, { color: theme.colors.onSurfaceVariant }]}>
              Bu hat için sefer verisi sisteme henüz eklenmemiş.{'\n'}ESHOT'un resmi sitesinden kontrol edebilirsiniz.
            </Text>
          ) : schedule.dir0.length === 0 && schedule.dir1.length === 0 ? (
            <Text style={[styles.scheduleNote, { color: theme.colors.onSurfaceVariant }]}>
              {hasOnlyWeekday
                ? 'Bu hat yalnızca hafta içi sefer yapıyor. Hafta İçi sekmesine geçin.'
                : isRing
                ? 'Ring hat — hafta içi saatler geçerlidir.'
                : 'Bu gün için sefer verisi yok.'}
            </Text>
          ) : (() => {
            const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
            const nextDir0 = schedule.dir0.find(t => t >= nowMins) ?? schedule.dir0[0];
            const nextDir1 = schedule.dir1.find(t => t >= nowMins) ?? schedule.dir1[0];
            return (
              <>
                {schedule.dir0.length > 0 && (
                  <>
                    <Text style={[styles.dirLabel, { color: theme.colors.onSurface }]}>
                      {fromStop} → {toStop || fromStop}
                    </Text>
                    <View style={styles.timeGrid}>
                      {schedule.dir0.map(t => {
                        const isNext = t === nextDir0;
                        return (
                          <View key={t} style={[styles.timeBadge, { backgroundColor: isNext ? theme.colors.primary : theme.colors.primaryContainer }]}>
                            <Text style={[styles.timeText, { color: isNext ? '#FFF' : theme.colors.primary, fontWeight: isNext ? '800' : '400' }]}>{minsToHHMM(t)}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </>
                )}
                {schedule.dir1.length > 0 && (
                  <>
                    <Text style={[styles.dirLabel, { color: theme.colors.onSurface, marginTop: 12 }]}>
                      {toStop || fromStop} → {fromStop}
                    </Text>
                    <View style={styles.timeGrid}>
                      {schedule.dir1.map(t => {
                        const isNext = t === nextDir1;
                        return (
                          <View key={t} style={[styles.timeBadge, { backgroundColor: isNext ? theme.colors.secondary : theme.colors.secondaryContainer }]}>
                            <Text style={[styles.timeText, { color: isNext ? '#FFF' : theme.colors.secondary, fontWeight: isNext ? '800' : '400' }]}>{minsToHHMM(t)}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </>
                )}
              </>
            );
          })()}
        </Surface>

        {/* Durak Listesi */}
        {lineStops.length > 0 && (
          <Surface style={[styles.stopsCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
                Duraklar ({lineStops.length})
              </Text>
              <TouchableOpacity
                onPress={() => setShowRouteMap(true)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 8, backgroundColor: theme.colors.primaryContainer }}
              >
                <MaterialCommunityIcons name="map-outline" size={16} color={theme.colors.primary} />
                <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '600' }}>Haritada Gör</Text>
              </TouchableOpacity>
            </View>
            {lineStops.map((stop, i) => {
              const isFirst = i === 0;
              const isLast = i === lineStops.length - 1;
              return (
                <TouchableOpacity
                  key={stop.id}
                  style={styles.stopRow}
                  onPress={() => navigation.navigate('StopDetail', {
                    stopId: stop.id,
                    stopName: stop.name,
                    latitude: stop.lat,
                    longitude: stop.lon,
                    lines: [lineNumber],
                  })}
                >
                  <View style={styles.stopTimeline}>
                    <View style={[
                      styles.stopDot,
                      { backgroundColor: isFirst || isLast ? theme.colors.primary : theme.colors.outline }
                    ]} />
                    {!isLast && <View style={[styles.stopLine, { backgroundColor: theme.colors.outlineVariant }]} />}
                  </View>
                  <Text style={[
                    styles.stopRowName,
                    { color: isFirst || isLast ? theme.colors.onSurface : theme.colors.onSurfaceVariant,
                      fontWeight: isFirst || isLast ? '700' : '400' }
                  ]}>
                    {stop.name}
                  </Text>
                  <MaterialCommunityIcons name="chevron-right" size={16} color={theme.colors.onSurfaceVariant} />
                </TouchableOpacity>
              );
            })}
          </Surface>
        )}

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

      {showRouteMap && (
        <LineRouteMapModal
          visible={showRouteMap}
          lineNumber={lineNumber}
          stops={lineStops}
          onDismiss={() => setShowRouteMap(false)}
        />
      )}
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
  stopsCard: { borderRadius: 16, padding: 16, gap: 0 },
  stopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, minHeight: 28 },
  stopTimeline: { alignItems: 'center', width: 12 },
  stopDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  stopLine: { width: 2, flex: 1, minHeight: 18 },
  stopRowName: { fontSize: 13, flex: 1, paddingVertical: 2 },
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
