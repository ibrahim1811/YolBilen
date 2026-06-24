import React from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, Surface, useTheme, Avatar, Button, Divider, List, Switch, ProgressBar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { signOut } from '../services/firebase/auth';
import { useAppStore } from '../store/useAppStore';
import { NotificationSettings } from '../components/profile/NotificationSettings';
import { getUserPoints } from '../services/firebase/firestore';
import { computeBadges, nextBadge } from '../services/gamification/badgeService';
import { checkIsAdmin } from '../services/firebase/adminService';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';

export function ProfileScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, setUser, isDarkMode, toggleDarkMode, allowLongWalk, setAllowLongWalk } = useAppStore();
  const [points, setPoints] = React.useState(user?.contributionPoints ?? 0);
  const [isAdmin, setIsAdmin] = React.useState(false);

  React.useEffect(() => {
    if (!user || user.isGuest) {
      setPoints(0);
      setIsAdmin(false);
      return;
    }
    getUserPoints(user.uid).then(setPoints).catch(() => {});
    checkIsAdmin(user.email).then(setIsAdmin).catch(() => {});
  }, [user?.uid]);

  const badges = computeBadges(points);
  const next = nextBadge(points);
  const nextProgress = next ? Math.min(points / next.requiredPoints, 1) : 1;

  async function handleSignOut() {
    await signOut();
    setUser(null);
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.screenTitle, { color: theme.colors.onSurface }]}>Profil</Text>

        <Surface style={[styles.profileCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <View style={styles.profileHeader}>
            {user?.photoURL ? (
              <Avatar.Image size={72} source={{ uri: user.photoURL }} />
            ) : (
              <Avatar.Icon
                size={72}
                icon="account"
                style={{ backgroundColor: theme.colors.primaryContainer }}
                color={theme.colors.primary}
              />
            )}
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: theme.colors.onSurface }]}>
                {user?.displayName ?? 'Kullanıcı'}
              </Text>
              <Text style={[styles.profileEmail, { color: theme.colors.onSurfaceVariant }]}>
                {user?.isGuest ? 'Misafir Kullanıcı' : user?.email}
              </Text>
            </View>
          </View>

          <Divider style={styles.divider} />

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: theme.colors.primary }]}>{points}</Text>
              <Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>Katkı Puanı</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: theme.colors.outline }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: theme.colors.primary }]}>
                {badges.filter(b => b.earned).length}
              </Text>
              <Text style={[styles.statLabel, { color: theme.colors.onSurfaceVariant }]}>Rozet</Text>
            </View>
          </View>

          {next && (
            <View style={styles.progressSection}>
              <Text style={[styles.progressLabel, { color: theme.colors.onSurfaceVariant }]}>
                Sonraki rozet: {next.label} ({next.requiredPoints - points} puan kaldı)
              </Text>
              <ProgressBar progress={nextProgress} color={theme.colors.primary} style={styles.progressBar} />
            </View>
          )}
        </Surface>

        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Rozetler</Text>
          <View style={styles.badgesGrid}>
            {badges.map((badge) => (
              <View
                key={badge.id}
                style={[
                  styles.badgeItem,
                  {
                    backgroundColor: badge.earned ? theme.colors.primaryContainer : theme.colors.surfaceVariant,
                    opacity: badge.earned ? 1 : 0.45,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name={badge.icon as any}
                  size={28}
                  color={badge.earned ? theme.colors.primary : theme.colors.onSurfaceVariant}
                />
                <Text style={[styles.badgeLabel, { color: badge.earned ? theme.colors.primary : theme.colors.onSurfaceVariant }]}>
                  {badge.label}
                </Text>
                <Text style={[styles.badgePoints, { color: theme.colors.onSurfaceVariant }]}>
                  {badge.requiredPoints} pt
                </Text>
              </View>
            ))}
          </View>
        </Surface>

        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <List.Item
            title="Koyu Tema"
            titleStyle={{ color: theme.colors.onSurface }}
            left={() => (
              <MaterialCommunityIcons
                name="theme-light-dark"
                size={22}
                color={theme.colors.onSurfaceVariant}
                style={{ marginLeft: 8, alignSelf: 'center' }}
              />
            )}
            right={() => <Switch value={isDarkMode} onValueChange={toggleDarkMode} />}
          />
          <Divider />
          <List.Item
            title="Uzun yürüyüşlere izin ver"
            description="Durağa 1.2 km'ye kadar yürümeyi kabul et (varsayılan: 700m)"
            titleStyle={{ color: theme.colors.onSurface }}
            left={() => (
              <MaterialCommunityIcons
                name="walk"
                size={24}
                color={theme.colors.onSurfaceVariant}
                style={{ marginLeft: 8, alignSelf: 'center' }}
              />
            )}
            right={() => <Switch value={allowLongWalk} onValueChange={setAllowLongWalk} />}
          />
          <Divider />
          <List.Item
            title="Gizlilik Politikası"
            titleStyle={{ color: theme.colors.onSurface }}
            left={() => (
              <MaterialCommunityIcons
                name="shield-outline"
                size={22}
                color={theme.colors.onSurfaceVariant}
                style={{ marginLeft: 8, alignSelf: 'center' }}
              />
            )}
            right={() => (
              <MaterialCommunityIcons
                name="chevron-right"
                size={22}
                color={theme.colors.onSurfaceVariant}
              />
            )}
            onPress={() => Alert.alert(
              'Gizlilik Politikası',
              'Yolbul uygulaması, hizmetlerin iyileştirilmesi amacıyla anonim kullanım verisi toplar. Kişisel verileriniz (ad, e-posta) Firebase Authentication ile güvenli şekilde saklanır ve üçüncü taraflarla paylaşılmaz. Konum verisi yalnızca size yakın durakları bulmak için anlık olarak kullanılır, kayıt edilmez.\n\nSorularınız için: yolbul@support.com',
              [{ text: 'Tamam' }]
            )}
          />
          <Divider />
          <List.Item
            title="Hakkında"
            titleStyle={{ color: theme.colors.onSurface }}
            left={() => (
              <MaterialCommunityIcons
                name="information-outline"
                size={22}
                color={theme.colors.onSurfaceVariant}
                style={{ marginLeft: 8, alignSelf: 'center' }}
              />
            )}
            right={() => (
              <MaterialCommunityIcons
                name="chevron-right"
                size={22}
                color={theme.colors.onSurfaceVariant}
              />
            )}
            onPress={() => Alert.alert(
              'Yolbul Hakkında',
              'Yolbul v1.0\n\nİzmir toplu taşıma rehberiniz. ESHOT hatları, sefer saatleri, rota planlama ve topluluk uyarılarıyla her yolculuğunuzu kolaylaştırır.\n\nGeliştirici: @ibrahim1811\nVersiyon: 1.0.0',
              [{ text: 'Tamam' }]
            )}
          />
          <Divider />
          <List.Item
            title="Geçmiş Yolculuklar"
            titleStyle={{ color: theme.colors.onSurface }}
            left={() => (
              <MaterialCommunityIcons
                name="history"
                size={22}
                color={theme.colors.onSurfaceVariant}
                style={{ marginLeft: 8, alignSelf: 'center' }}
              />
            )}
            right={() => (
              <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.onSurfaceVariant} />
            )}
            onPress={() => navigation.navigate('JourneyHistory')}
          />
        </Surface>

        <NotificationSettings />

        {isAdmin && (
          <Button
            mode="contained-tonal"
            icon="shield-crown"
            onPress={() => navigation.navigate('AdminPanel')}
            style={styles.adminBtn}
            contentStyle={styles.adminBtnContent}
            labelStyle={styles.adminBtnLabel}
          >
            Admin Paneli
          </Button>
        )}

        <Button
          mode="outlined"
          onPress={handleSignOut}
          style={styles.signOutBtn}
          contentStyle={styles.signOutBtnContent}
          icon="logout"
          textColor="#D93025"
          labelStyle={styles.signOutLabel}
        >
          Çıkış Yap
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, gap: 16, paddingBottom: 40 },
  screenTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  profileCard: { borderRadius: 16, padding: 20, gap: 0 },
  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  profileInfo: { flex: 1, gap: 4 },
  profileName: { fontSize: 20, fontWeight: '700' },
  profileEmail: { fontSize: 14 },
  divider: { marginVertical: 16 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 28, fontWeight: '800' },
  statLabel: { fontSize: 13 },
  statDivider: { width: 1, height: 40 },
  card: { borderRadius: 16, padding: 20, gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '600' },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  badgeItem: {
    width: '47%',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    gap: 8,
  },
  badgeLabel: { fontSize: 13, fontWeight: '500', textAlign: 'center' },
  badgePoints: { fontSize: 11, textAlign: 'center' },
  progressSection: { marginTop: 8, gap: 6 },
  progressLabel: { fontSize: 12 },
  progressBar: { height: 6, borderRadius: 3 },
  adminBtn: { borderRadius: 12 },
  adminBtnContent: { height: 52 },
  adminBtnLabel: { fontSize: 15, fontWeight: '600' },
  signOutBtn: {
    borderRadius: 12,
    borderColor: '#D93025',
  },
  signOutBtnContent: { height: 52 },
  signOutLabel: { fontSize: 15 },
});
