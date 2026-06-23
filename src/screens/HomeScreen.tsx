import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text, Button, Surface, useTheme, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LocationInput } from '../components/common/LocationInput';
import { LocationPickerModal } from '../components/common/LocationPickerModal';
import { SunMapModal } from '../components/common/SunMapModal';
import SunCalc from 'suncalc';
import { trackScreenView } from '../services/telemetry/telemetryService';
import { FavoriteLocationCard, AddFavoriteCard } from '../components/home/FavoriteLocationCard';
import { FavoriteLineCard } from '../components/home/FavoriteLineCard';
import { AddFavoriteModal } from '../components/home/AddFavoriteModal';
import { WeatherBanner } from '../components/home/WeatherBanner';
import * as Location from 'expo-location';
import { getStops } from '../data/gtfsData';
import { useAppStore } from '../store/useAppStore';
import { useFavorites } from '../hooks/useFavorites';
import { useWeather } from '../hooks/useWeather';
import { getUserJourneys, detectRoutine } from '../services/firebase/journeyService';
import { getActiveAlerts, ALERT_LABELS, ALERT_ICONS } from '../services/firebase/alertService';
import type { CommunityAlert } from '../types';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, FavoriteType, JourneyRecord } from '../types';

export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const theme = useTheme();
  const { user, origin, destination, setOrigin, setDestination } = useAppStore();
  const { favoriteLocations, favoriteLines, addLocation, removeLocation, removeLine, getLocationByType } =
    useFavorites();

  const [showAddModal, setShowAddModal] = useState(false);
  const [locationPicker, setLocationPicker] = useState<'origin' | 'destination' | null>(null);
  const [showSunMap, setShowSunMap] = useState(false);
  const [sunGps, setSunGps] = useState<{ lat: number; lng: number } | null>(null);
  const weather = useWeather();
  const [routine, setRoutine] = useState<JourneyRecord | null>(null);
  const [crowdAlerts, setCrowdAlerts] = useState<CommunityAlert[]>([]);
  const h = new Date().getHours();
  const isNight = h >= 22 || h < 6;

  useEffect(() => { trackScreenView('HomeScreen'); }, []);

  useEffect(() => {
    if (origin !== null) return;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const { latitude, longitude } = pos.coords;
        const stops = getStops();
        if (!stops.length) return;
        let nearestStop = stops[0];
        let minDist = Infinity;
        for (const s of stops) {
          const d = Math.hypot(s.lat - latitude, s.lon - longitude);
          if (d < minDist) { minDist = d; nearestStop = s; }
        }
        setOrigin({
          name: nearestStop.name,
          latitude,
          longitude,
        });
      } catch {}
    })();
  }, [origin, setOrigin]);

  useEffect(() => {
    if (!user || user.isGuest) return;
    getUserJourneys(user.uid, 50)
      .then(journeys => setRoutine(detectRoutine(journeys)))
      .catch(() => {});
  }, [user?.uid]);

  useEffect(() => {
    getActiveAlerts().then(a => setCrowdAlerts(a.slice(0, 3))).catch(() => {});
  }, []);

  const disabledTypes = favoriteLocations
    .filter((l) => l.type !== 'custom')
    .map((l) => l.type) as FavoriteType[];

  function handleSearch() {
    if (origin && destination) {
      navigation.navigate('RouteSearch');
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: theme.colors.onSurfaceVariant }]}>Merhaba,</Text>
            <Text style={[styles.userName, { color: theme.colors.onSurface }]}>
              {user?.displayName ?? 'Kullanıcı'} 👋
            </Text>
          </View>
          <View style={[styles.avatar, { backgroundColor: theme.colors.primaryContainer }]}>
            <MaterialCommunityIcons name="account" size={24} color={theme.colors.primary} />
          </View>
        </View>

        {/* Search Card */}
        <Surface style={[styles.searchCard, { backgroundColor: theme.colors.surface }]} elevation={2}>
          <Text style={[styles.searchTitle, { color: theme.colors.onSurface }]}>
            Nereye gidiyorsunuz?
          </Text>
          <View style={styles.inputs}>
            <LocationInput
              label="Başlangıç"
              value={origin}
              iconName="map-marker"
              iconColor="#34A853"
              onPress={() => setLocationPicker('origin')}
            />
            <View style={[styles.connector, { backgroundColor: theme.colors.outline }]} />
            <LocationInput
              label="Varış"
              value={destination}
              iconName="map-marker-check"
              iconColor={theme.colors.primary}
              onPress={() => setLocationPicker('destination')}
            />
          </View>
          <Button
            mode="contained"
            onPress={handleSearch}
            disabled={!origin || !destination}
            style={styles.searchBtn}
            contentStyle={styles.searchBtnContent}
            icon="magnify"
            labelStyle={styles.searchBtnLabel}
          >
            Bana Uygun Rotayı Bul
          </Button>
        </Surface>

        {/* Favorite Locations */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
              Kayıtlı Konumlar
            </Text>
            {!user?.isGuest && (
              <IconButton
                icon="plus"
                size={18}
                onPress={() => setShowAddModal(true)}
                iconColor={theme.colors.primary}
              />
            )}
          </View>

          {favoriteLocations.length === 0 && !user?.isGuest ? (
            <View style={styles.emptyFav}>
              <AddFavoriteCard onPress={() => setShowAddModal(true)} />
              <Text style={[styles.emptyHint, { color: theme.colors.onSurfaceVariant }]}>
                Ev, iş veya okul konumunuzu ekleyin
              </Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.favRow}>
              {favoriteLocations.map((fav) => (
                <FavoriteLocationCard
                  key={fav.id}
                  favorite={fav}
                  onPress={() => setDestination(fav.location)}
                  onLongPress={() => removeLocation(fav.id)}
                />
              ))}
              {!user?.isGuest && <AddFavoriteCard onPress={() => setShowAddModal(true)} />}
            </ScrollView>
          )}
        </View>

        {/* Favorite Lines */}
        {favoriteLines.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
              Favori Hatlar
            </Text>
            <View style={styles.lineList}>
              {favoriteLines.map((line) => (
                <FavoriteLineCard
                  key={line.id}
                  line={line}
                  onPress={() => navigation.navigate('LineDetail', {
                    lineNumber: line.lineNumber,
                    lineName: line.lineName,
                  })}
                  onRemove={() => removeLine(line.id)}
                />
              ))}
            </View>
          </View>
        )}

        {/* Hava Durumu */}
        <WeatherBanner data={weather.data} loading={weather.loading} error={weather.error} />

        {/* Yakındaki Duraklar butonu */}
        <TouchableOpacity onPress={() => navigation.navigate('NearbyStops')} activeOpacity={0.85}>
          <Surface style={[styles.nearbyCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
            <View style={[styles.nearbyIcon, { backgroundColor: theme.colors.primaryContainer }]}>
              <MaterialCommunityIcons name="bus-stop" size={22} color={theme.colors.primary} />
            </View>
            <View style={styles.nearbyText}>
              <Text style={[styles.nearbyTitle, { color: theme.colors.onSurface }]}>Yakındaki Duraklar</Text>
              <Text style={[styles.nearbySub, { color: theme.colors.onSurfaceVariant }]}>GPS ile en yakın durakları bul</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
          </Surface>
        </TouchableOpacity>

        {/* Akıllı Rutin kartı */}
        {routine && (
          <Surface style={[styles.routineCard, { backgroundColor: theme.colors.secondaryContainer }]} elevation={0}>
            <MaterialCommunityIcons name="brain" size={22} color={theme.colors.secondary} />
            <View style={styles.routineText}>
              <Text style={[styles.routineTitle, { color: theme.colors.onSecondaryContainer }]}>
                Sabah rutinin: Hat {routine.lineNumber}
              </Text>
              <Text style={[styles.routineSub, { color: theme.colors.onSecondaryContainer }]}>
                {routine.originName} → {routine.destinationName}
              </Text>
            </View>
            <Button
              compact
              mode="contained"
              onPress={() => {
                useAppStore.getState().setOrigin({ name: routine!.originName, latitude: 0, longitude: 0 });
                navigation.navigate('RouteSearch');
              }}
            >
              Başlat
            </Button>
          </Surface>
        )}

        {/* Gece güvenlik modu banner */}
        {isNight && (
          <Surface style={[styles.infoCard, { backgroundColor: '#1A1A2E' }]} elevation={0}>
            <MaterialCommunityIcons name="shield-moon" size={24} color="#7986CB" />
            <View style={styles.infoText}>
              <Text style={[styles.infoTitle, { color: '#7986CB' }]}>Gece Güvenlik Modu Aktif</Text>
              <Text style={[styles.infoDesc, { color: 'rgba(255,255,255,0.6)' }]}>
                Rotalar az aktarmalı ve kalabalık araç öncelikli sıralanıyor.
              </Text>
            </View>
          </Surface>
        )}

        {/* Aktif Uyarılar */}
        {crowdAlerts.length > 0 && (
          <Surface style={[styles.alertsCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
            <View style={styles.alertsHeader}>
              <MaterialCommunityIcons name="alert-circle" size={18} color="#D93025" />
              <Text style={[styles.alertsTitle, { color: theme.colors.onSurface }]}>Aktif Uyarılar</Text>
            </View>
            {crowdAlerts.map(a => (
              <View key={a.id} style={styles.alertRow}>
                <MaterialCommunityIcons name={ALERT_ICONS[a.type] as any} size={16} color="#D93025" />
                <Text style={[styles.alertText, { color: theme.colors.onSurfaceVariant }]}>
                  Hat {a.lineNumber} — {ALERT_LABELS[a.type]}
                </Text>
              </View>
            ))}
          </Surface>
        )}

        {/* Sun Info Banner */}
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={async () => {
            try {
              const { status } = await Location.requestForegroundPermissionsAsync();
              if (status !== 'granted') return;
              const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
              setSunGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            } catch {
              setSunGps({ lat: origin?.latitude ?? 38.4189, lng: origin?.longitude ?? 27.1287 });
            }
            setShowSunMap(true);
          }}
        >
          <Surface style={[styles.infoCard, { backgroundColor: theme.colors.primaryContainer }]} elevation={0}>
            <MaterialCommunityIcons name="white-balance-sunny" size={24} color={theme.colors.primary} />
            <View style={styles.infoText}>
              <Text style={[styles.infoTitle, { color: theme.colors.primary }]}>
                Güneşi Gör
              </Text>
              <Text style={[styles.infoDesc, { color: theme.colors.onSurfaceVariant }]}>
                Şu an güneş hangi yönde? Haritada görmek için dokun.
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.primary} />
          </Surface>
        </TouchableOpacity>
      </ScrollView>

      <LocationPickerModal
        visible={locationPicker !== null}
        title={locationPicker === 'origin' ? 'Başlangıç Seç' : 'Varış Seç'}
        onSelect={(loc) => {
          if (locationPicker === 'origin') setOrigin(loc);
          else setDestination(loc);
          setLocationPicker(null);
        }}
        onDismiss={() => setLocationPicker(null)}
      />

      {showSunMap && sunGps && (() => {
        const pos = SunCalc.getPosition(new Date(), sunGps.lat, sunGps.lng);
        const azimuth = ((pos.azimuth * 180) / Math.PI + 180 + 360) % 360;
        const altitude = (pos.altitude * 180) / Math.PI;
        return (
          <SunMapModal
            visible={showSunMap}
            lat={sunGps.lat}
            lng={sunGps.lng}
            azimuth={azimuth}
            altitude={altitude}
            onDismiss={() => setShowSunMap(false)}
          />
        );
      })()}

      {!user?.isGuest && (
        <AddFavoriteModal
          visible={showAddModal}
          onDismiss={() => setShowAddModal(false)}
          onAdd={async (type, label, location) => {
            await addLocation(type, label, location);
            setShowAddModal(false);
          }}
          disabledTypes={disabledTypes}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, gap: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greeting: { fontSize: 14 },
  userName: { fontSize: 22, fontWeight: '700' },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  searchCard: { borderRadius: 20, padding: 20, gap: 16 },
  searchTitle: { fontSize: 18, fontWeight: '700' },
  inputs: { gap: 8 },
  connector: { width: 2, height: 12, marginLeft: 22, borderRadius: 1 },
  searchBtn: { borderRadius: 12 },
  searchBtnContent: { height: 52 },
  searchBtnLabel: { fontSize: 15, fontWeight: '600' },
  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 16, fontWeight: '600' },
  favRow: { gap: 10, paddingBottom: 4 },
  emptyFav: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emptyHint: { fontSize: 13, flex: 1 },
  lineList: { gap: 8 },
  infoCard: { borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  infoText: { flex: 1, gap: 4 },
  infoTitle: { fontSize: 15, fontWeight: '600' },
  infoDesc: { fontSize: 13, lineHeight: 20 },
  nearbyCard: { borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  nearbyIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  nearbyText: { flex: 1, gap: 2 },
  nearbyTitle: { fontSize: 15, fontWeight: '600' },
  nearbySub: { fontSize: 12 },
  routineCard: { borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  routineText: { flex: 1, gap: 2 },
  routineTitle: { fontSize: 14, fontWeight: '700' },
  routineSub: { fontSize: 12 },
  alertsCard: { borderRadius: 16, padding: 14, gap: 10 },
  alertsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  alertsTitle: { fontSize: 14, fontWeight: '700' },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  alertText: { fontSize: 13 },
});
