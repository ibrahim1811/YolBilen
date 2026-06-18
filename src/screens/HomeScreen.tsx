import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, Surface, useTheme, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LocationInput } from '../components/common/LocationInput';
import { LocationPickerModal } from '../components/common/LocationPickerModal';
import { FavoriteLocationCard, AddFavoriteCard } from '../components/home/FavoriteLocationCard';
import { FavoriteLineCard } from '../components/home/FavoriteLineCard';
import { AddFavoriteModal } from '../components/home/AddFavoriteModal';
import { WeatherBanner } from '../components/home/WeatherBanner';
import { useAppStore } from '../store/useAppStore';
import { useFavorites } from '../hooks/useFavorites';
import { useWeather } from '../hooks/useWeather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, FavoriteType } from '../types';

export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const theme = useTheme();
  const { user, origin, destination, setOrigin, setDestination } = useAppStore();
  const { favoriteLocations, favoriteLines, addLocation, removeLocation, removeLine, getLocationByType } =
    useFavorites();

  const [showAddModal, setShowAddModal] = useState(false);
  const [locationPicker, setLocationPicker] = useState<'origin' | 'destination' | null>(null);
  const weather = useWeather();

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
                  onPress={() => {
                    setOrigin(origin ?? { name: 'Mevcut Konum', latitude: 38.419, longitude: 27.129 });
                    setDestination({ name: line.lineName, latitude: 38.419, longitude: 27.129 });
                  }}
                  onRemove={() => removeLine(line.id)}
                />
              ))}
            </View>
          </View>
        )}

        {/* Hava Durumu */}
        <WeatherBanner data={weather.data} loading={weather.loading} error={weather.error} />

        {/* Sun Info Banner */}
        <Surface style={[styles.infoCard, { backgroundColor: theme.colors.primaryContainer }]} elevation={0}>
          <MaterialCommunityIcons name="white-balance-sunny" size={24} color={theme.colors.primary} />
          <View style={styles.infoText}>
            <Text style={[styles.infoTitle, { color: theme.colors.primary }]}>
              Güneş Analizi Aktif
            </Text>
            <Text style={[styles.infoDesc, { color: theme.colors.onSurfaceVariant }]}>
              Rota seçtikten sonra hangi tarafın daha serin olduğunu öğrenin.
            </Text>
          </View>
        </Surface>
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
});
