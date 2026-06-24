import React, { useEffect } from 'react';
import { trackScreenView } from '../services/telemetry/telemetryService';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, useTheme, Appbar, Surface, Divider, Button } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CrowdBadge } from '../components/common/CrowdBadge';
import { SunSideCard } from '../components/sun/SunSideCard';
import { ComfortScoreCard } from '../components/lines/ComfortScoreCard';
import { AiSummaryCard } from '../components/route/AiSummaryCard';
import { getLineComfortScore } from '../services/firebase/lineStats';
import { useWeather } from '../hooks/useWeather';
import type { ComfortScore, RouteStep } from '../types';
import { useAppStore } from '../store/useAppStore';
import { saveJourney } from '../services/firebase/journeyService';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'RouteResults'>;

export function RouteResultScreen({ navigation }: Props) {
  const theme = useTheme();
  const selectedRoute = useAppStore((s) => s.selectedRoute);
  const user = useAppStore((s) => s.user);
  const origin = useAppStore((s) => s.origin);
  const destination = useAppStore((s) => s.destination);
  const [comfortScore, setComfortScore] = React.useState<ComfortScore | null>(null);
  const weather = useWeather();

  async function handleStartJourney() {
    navigation.navigate('JourneyNavigation', { route: selectedRoute! });
    if (user && !user.isGuest && selectedRoute && origin && destination) {
      const now = new Date();
      const distKm = Math.round(
        (() => {
          const R = 6371;
          const dLat = ((destination.latitude - origin.latitude) * Math.PI) / 180;
          const dLon = ((destination.longitude - origin.longitude) * Math.PI) / 180;
          const s = Math.sin(dLat / 2) ** 2 +
            Math.cos((origin.latitude * Math.PI) / 180) *
            Math.cos((destination.latitude * Math.PI) / 180) *
            Math.sin(dLon / 2) ** 2;
          return R * 2 * Math.asin(Math.sqrt(s));
        })() * 10
      ) / 10;
      saveJourney({
        userId: user.uid,
        lineNumber: selectedRoute.lineNumber,
        lineName: selectedRoute.lineName,
        originName: origin.name,
        destinationName: destination.name,
        durationMins: selectedRoute.estimatedDuration,
        distanceKm: distKm,
        timestamp: now,
        dayOfWeek: now.getDay(),
        hourOfDay: now.getHours(),
      }).catch(() => {});
    }
  }

  useEffect(() => { trackScreenView('RouteResult'); }, []);

  React.useEffect(() => {
    if (selectedRoute) {
      getLineComfortScore(selectedRoute.lineNumber).then(setComfortScore);
    }
  }, [selectedRoute?.lineNumber]);

  if (!selectedRoute) return null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header style={{ backgroundColor: theme.colors.background }} elevated={false}>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Rota Detayı" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <View style={styles.lineHeader}>
            <View style={[styles.lineBadge, { backgroundColor: theme.colors.primary }]}>
              <Text style={styles.lineNumber}>{selectedRoute.lineNumber}</Text>
            </View>
            <View>
              <Text style={[styles.lineName, { color: theme.colors.onSurface }]}>
                {selectedRoute.lineName}
              </Text>
              <Text style={[styles.lineSubtitle, { color: theme.colors.onSurfaceVariant }]}>
                Hat Detayları
              </Text>
            </View>
          </View>

          <Divider style={styles.divider} />

          <View style={styles.statsGrid}>
            <StatItem
              icon="clock-outline"
              label="Süre"
              value={`${selectedRoute.estimatedDuration} dk`}
              color={theme.colors.primary}
            />
            <StatItem
              icon="bus-clock"
              label="Sonraki Otobüs"
              value={selectedRoute.nextArrival >= 999 ? 'Yarın' : selectedRoute.nextArrival <= 1 ? 'Şimdi' : `${selectedRoute.nextArrival} dk`}
              color="#34A853"
            />
            <StatItem
              icon="transfer"
              label="Aktarma"
              value={selectedRoute.transfers.length === 0 ? 'Yok' : `${selectedRoute.transfers.length}x`}
              color="#FBBC04"
            />
          </View>

          <View style={styles.crowdRow}>
            <Text style={[styles.crowdLabel, { color: theme.colors.onSurfaceVariant }]}>
              Tahmini Yoğunluk
            </Text>
            <CrowdBadge level={selectedRoute.crowdLevel} />
          </View>
        </Surface>

        {selectedRoute.transfers.length > 0 && (
          <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Aktarmalar</Text>
            {selectedRoute.transfers.map((t, i) => (
              <View key={i} style={styles.transferRow}>
                <View style={[styles.transferBadge, { backgroundColor: theme.colors.secondaryContainer }]}>
                  <Text style={[styles.transferLine, { color: theme.colors.secondary }]}>
                    {t.lineNumber}
                  </Text>
                </View>
                <View style={styles.transferInfo}>
                  <Text style={[styles.transferStop, { color: theme.colors.onSurface }]}>
                    {t.lineName} · {t.boardStop.name}
                  </Text>
                  <Text style={[styles.transferWait, { color: theme.colors.onSurfaceVariant }]}>
                    ~{t.walkMins} dk yürüyüş
                  </Text>
                </View>
              </View>
            ))}
          </Surface>
        )}

        <AiSummaryCard
          route={selectedRoute}
          weather={weather.data}
          comfort={comfortScore}
        />

        <Button
          mode="outlined"
          icon="map-outline"
          onPress={() => navigation.navigate('RouteMap', { route: selectedRoute })}
          style={styles.mapBtn}
          contentStyle={{ height: 48 }}
        >
          Haritada Gör
        </Button>

        {comfortScore && (
          <ComfortScoreCard score={comfortScore} compact />
        )}

        {weather.data?.isHot && (
          <Surface style={[styles.weatherAlert, { backgroundColor: '#FF6D00' }]} elevation={0}>
            <MaterialCommunityIcons name="thermometer-high" size={20} color="#FFF" />
            <View style={styles.weatherAlertText}>
              <Text style={styles.weatherAlertTitle}>
                Hava çok sıcak — {weather.data.temperature}°C
              </Text>
              <Text style={styles.weatherAlertSub}>
                Güneşli taraftan kaçının, serin tarafı tercih edin.
              </Text>
            </View>
          </Surface>
        )}

        {weather.data?.isRainy && (
          <Surface style={[styles.weatherAlert, { backgroundColor: '#1A73E8' }]} elevation={0}>
            <MaterialCommunityIcons name="umbrella" size={20} color="#FFF" />
            <View style={styles.weatherAlertText}>
              <Text style={styles.weatherAlertTitle}>{weather.data.description}</Text>
              <Text style={styles.weatherAlertSub}>Şemsiye almayı unutmayın.</Text>
            </View>
          </Surface>
        )}

        {selectedRoute.sunAnalysis && (
          <SunSideCard analysis={selectedRoute.sunAnalysis} />
        )}

        {selectedRoute.hasIncompleteData && (
          <Surface style={[styles.infoAlert, { backgroundColor: '#FEF3C7' }]} elevation={0}>
            <MaterialCommunityIcons name="calendar-remove" size={20} color="#D97706" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#92400E', fontWeight: '700', fontSize: 14 }}>
                Bu hat için tam sefer verisi mevcut değil
              </Text>
              <Text style={{ color: '#92400E', fontSize: 12, marginTop: 2 }}>
                Varış süresi tahminidir. Gerçek sefer saatleri değişebilir.
              </Text>
            </View>
          </Surface>
        )}

        {selectedRoute.steps && selectedRoute.steps.length > 0 && (
          <RouteStepsCard steps={selectedRoute.steps} />
        )}

        <Button
          mode="contained"
          style={styles.startBtn}
          contentStyle={styles.startBtnContent}
          icon="navigation"
          labelStyle={styles.startBtnLabel}
          onPress={handleStartJourney}
        >
          Yolculuğu Başlat
        </Button>
        <Button
          mode="outlined"
          icon="play-circle"
          style={{ marginTop: 8, marginHorizontal: 16 }}
          onPress={() => navigation.navigate('RouteReplay', { route: selectedRoute! })}
        >
          Rotayı Oynat
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

interface StatItemProps {
  icon: string;
  label: string;
  value: string;
  color: string;
}

function StatItem({ icon, label, value, color }: StatItemProps) {
  const theme = useTheme();
  return (
    <View style={styles.statItem}>
      <MaterialCommunityIcons name={icon as any} size={20} color={color} />
      <Text style={[styles.statValue, { color: theme.colors.onSurface }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>{label}</Text>
    </View>
  );
}

function RouteStepsCard({ steps }: { steps: RouteStep[] }) {
  const theme = useTheme();

  return (
    <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
      <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Güzergah Adımları</Text>
      {steps.map((step, i) => (
        <View key={i}>
          {i > 0 && <View style={[styles.stepConnector, { backgroundColor: theme.colors.outlineVariant }]} />}
          {step.type === 'walk' ? (
            <View style={styles.stepRow}>
              <View style={[styles.stepIcon, { backgroundColor: theme.colors.secondaryContainer }]}>
                <MaterialCommunityIcons name="walk" size={18} color={theme.colors.secondary} />
              </View>
              <View style={styles.stepText}>
                <Text style={[styles.stepMain, { color: theme.colors.onSurface }]}>
                  {step.durationMins} dk yürüyün
                </Text>
                {step.toStopName && (
                  <Text style={[styles.stepSub, { color: theme.colors.onSurfaceVariant }]}>
                    {step.toStopName}{step.distanceMeters ? ` (${step.distanceMeters} m)` : ''}
                  </Text>
                )}
              </View>
            </View>
          ) : (
            <View>
              <View style={styles.stepRow}>
                <View style={[styles.stepIcon, { backgroundColor: theme.colors.primaryContainer }]}>
                  <MaterialCommunityIcons name="bus" size={18} color={theme.colors.primary} />
                </View>
                <View style={styles.stepText}>
                  <Text style={[styles.stepMain, { color: theme.colors.onSurface }]}>
                    {step.departureTime && `${step.departureTime} — `}Hat {step.lineNumber}
                  </Text>
                  <Text style={[styles.stepSub, { color: theme.colors.onSurfaceVariant }]}>
                    {step.distanceMeters ? `${(step.distanceMeters / 1000).toFixed(1)} km` : ''}
                  </Text>
                </View>
              </View>
              <View style={[styles.stopList, { borderLeftColor: theme.colors.primary }]}>
                <Text style={[styles.stopItem, { color: theme.colors.onSurface, fontWeight: '600' }]}>
                  {step.boardStop?.name}
                </Text>
                {(step.intermediateStops ?? []).map((s, j) => (
                  <Text key={j} style={[styles.stopItem, { color: theme.colors.onSurfaceVariant }]}>
                    {s.name}
                  </Text>
                ))}
                <Text style={[styles.stopItem, { color: theme.colors.onSurface, fontWeight: '600' }]}>
                  {step.alightStop?.name}
                </Text>
              </View>
            </View>
          )}
        </View>
      ))}
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  scroll: { padding: 20, gap: 16, paddingBottom: 40 },
  card: { borderRadius: 16, padding: 20, gap: 16 },
  lineHeader: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  lineBadge: {
    width: 60,
    height: 60,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lineNumber: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  lineName: { fontSize: 17, fontWeight: '700' },
  lineSubtitle: { fontSize: 13, marginTop: 2 },
  divider: {},
  statsGrid: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center', gap: 4 },
  statValue: { fontSize: 16, fontWeight: '700' },
  statLabel: { fontSize: 12 },
  crowdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  crowdLabel: { fontSize: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '600' },
  transferRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  transferBadge: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transferLine: { fontSize: 14, fontWeight: '700' },
  transferInfo: { gap: 2 },
  transferStop: { fontSize: 15, fontWeight: '500' },
  transferWait: { fontSize: 13 },
  weatherAlert: { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  weatherAlertText: { flex: 1, gap: 3 },
  weatherAlertTitle: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  weatherAlertSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12 },
  startBtn: { borderRadius: 12 },
  startBtnContent: { height: 56 },
  startBtnLabel: { fontSize: 16, fontWeight: '700' },
  mapBtn: { borderRadius: 12 },
  infoAlert: { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepConnector: { width: 2, height: 12, marginLeft: 19, marginVertical: 2 },
  stepIcon: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  stepText: { flex: 1, gap: 2, paddingTop: 2 },
  stepMain: { fontSize: 14, fontWeight: '600' },
  stepSub: { fontSize: 12, lineHeight: 18 },
  stopList: { marginLeft: 50, marginTop: 6, paddingLeft: 12, borderLeftWidth: 2, gap: 2 },
  stopItem: { fontSize: 12, lineHeight: 20 },
});
