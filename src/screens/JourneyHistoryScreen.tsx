import React from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { Text, Surface, useTheme, Appbar, ProgressBar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getUserJourneys, computeStats } from '../services/firebase/journeyService';
import { getUserFeedbackCount } from '../services/firebase/firestore';
import { computeSeasonalBadges } from '../services/gamification/badgeService';
import { useAppStore } from '../store/useAppStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, JourneyRecord } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'JourneyHistory'>;

const DOW = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

export function JourneyHistoryScreen({ navigation }: Props) {
  const theme = useTheme();
  const user = useAppStore(s => s.user);
  const [journeys, setJourneys] = React.useState<JourneyRecord[]>([]);
  const [feedbackCount, setFeedbackCount] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!user || user.isGuest) { setLoading(false); return; }
    Promise.all([
      getUserJourneys(user.uid),
      getUserFeedbackCount(user.uid),
    ]).then(([j, count]) => {
      setJourneys(j);
      setFeedbackCount(count);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user?.uid]);

  const stats = React.useMemo(() => computeStats(journeys), [journeys]);
  const seasonal = React.useMemo(
    () => computeSeasonalBadges({ ...stats, feedbackCount }),
    [stats, feedbackCount]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header style={{ backgroundColor: theme.colors.background }} elevated={false}>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Geçmiş Yolculuklar" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : user?.isGuest ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="account-off" size={48} color={theme.colors.onSurfaceVariant} />
          <Text style={[styles.guestText, { color: theme.colors.onSurfaceVariant }]}>
            Giriş yaparak yolculuklarını takip et
          </Text>
        </View>
      ) : (
        <FlatList
          data={journeys}
          keyExtractor={j => j.id ?? j.timestamp.toISOString()}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <>
              {/* Stats */}
              <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
                <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Bu Ayki Özet</Text>
                <View style={styles.statsRow}>
                  <StatBox icon="road-variant" value={`${stats.totalKm} km`} label="Toplam Mesafe" color={theme.colors.primary} />
                  <StatBox icon="bus-multiple" value={`${stats.uniqueLines}`} label="Farklı Hat" color="#34A853" />
                  <StatBox icon="map-marker-path" value={`${stats.total}`} label="Yolculuk" color="#FBBC04" />
                </View>
                {stats.topLine && (
                  <Text style={[styles.topLine, { color: theme.colors.onSurfaceVariant }]}>
                    En sık: Hat {stats.topLine} — {stats.topLineName}
                  </Text>
                )}
              </Surface>

              {/* Seasonal Badges */}
              <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
                <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Sezonluk Rozetler</Text>
                {seasonal.map(b => (
                  <View key={b.id} style={styles.badgeRow}>
                    <View style={[styles.badgeIcon, { backgroundColor: b.earned ? theme.colors.primaryContainer : theme.colors.surfaceVariant }]}>
                      <MaterialCommunityIcons name={b.icon as any} size={20} color={b.earned ? theme.colors.primary : theme.colors.onSurfaceVariant} />
                    </View>
                    <View style={styles.badgeInfo}>
                      <View style={styles.badgeTitleRow}>
                        <Text style={[styles.badgeLabel, { color: theme.colors.onSurface }]}>{b.label}</Text>
                        {b.earned && <MaterialCommunityIcons name="check-circle" size={16} color="#34A853" />}
                      </View>
                      <Text style={[styles.badgeDesc, { color: theme.colors.onSurfaceVariant }]}>{b.description}</Text>
                      <ProgressBar
                        progress={b.progress}
                        color={b.earned ? '#34A853' : theme.colors.primary}
                        style={styles.badgeProgress}
                      />
                    </View>
                  </View>
                ))}
              </Surface>

              {journeys.length > 0 && (
                <Text style={[styles.listTitle, { color: theme.colors.onSurface }]}>Son Yolculuklar</Text>
              )}
            </>
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="bus-clock" size={40} color={theme.colors.onSurfaceVariant} />
              <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
                Henüz yolculuk kaydı yok.{'\n'}Rota seçip "Yolculuğu Başlat" dene!
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Surface style={[styles.journeyCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
              <View style={styles.journeyHeader}>
                <View style={[styles.lineBadge, { backgroundColor: theme.colors.primary }]}>
                  <Text style={styles.lineNum}>{item.lineNumber}</Text>
                </View>
                <View style={styles.journeyInfo}>
                  <Text style={[styles.journeyRoute, { color: theme.colors.onSurface }]} numberOfLines={1}>
                    {item.originName} → {item.destinationName}
                  </Text>
                  <Text style={[styles.journeyMeta, { color: theme.colors.onSurfaceVariant }]}>
                    {DOW[item.dayOfWeek]} · {String(item.hourOfDay).padStart(2, '0')}:xx · {item.durationMins} dk · {item.distanceKm} km
                  </Text>
                </View>
              </View>
            </Surface>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function StatBox({ icon, value, label, color }: { icon: string; value: string; label: string; color: string }) {
  const theme = useTheme();
  return (
    <View style={styles.statBox}>
      <MaterialCommunityIcons name={icon as any} size={22} color={color} />
      <Text style={[styles.statValue, { color: theme.colors.onSurface }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  guestText: { fontSize: 15, textAlign: 'center' },
  list: { padding: 16, gap: 12, paddingBottom: 40 },
  card: { borderRadius: 16, padding: 20, gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '600' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statBox: { alignItems: 'center', gap: 4 },
  statValue: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 11 },
  topLine: { fontSize: 13 },
  badgeRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  badgeIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  badgeInfo: { flex: 1, gap: 4 },
  badgeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badgeLabel: { fontSize: 14, fontWeight: '600' },
  badgeDesc: { fontSize: 12 },
  badgeProgress: { height: 4, borderRadius: 2 },
  listTitle: { fontSize: 15, fontWeight: '600', marginTop: 4 },
  emptyBox: { alignItems: 'center', gap: 10, paddingTop: 20 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  journeyCard: { borderRadius: 14, padding: 14 },
  journeyHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lineBadge: { width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  lineNum: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  journeyInfo: { flex: 1, gap: 2 },
  journeyRoute: { fontSize: 14, fontWeight: '600' },
  journeyMeta: { fontSize: 12 },
});
