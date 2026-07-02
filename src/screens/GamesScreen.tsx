import React from 'react';
import { View, StyleSheet, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { Text, Surface, Button, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppStore } from '../store/useAppStore';
import { MAX_LIVES } from '../services/games/lifeService';
import { getMissionDef } from '../services/games/dailyMissionService';
import { redeemCode, addCoins } from '../services/firebase/coinService';
import { GamePlayModal } from '../components/games/GamePlayModal';
import { DemoAdLoadingModal } from '../components/common/DemoAdLoadingModal';
import { BannerAdBox } from '../components/ads/BannerAdBox';
import { useRewardedAdReward } from '../hooks/useRewardedAdReward';
import { useCappedInterstitialAd } from '../hooks/useCappedInterstitialAd';
import type { GameId } from '../types';

const GAME_CARDS: { id: GameId; label: string; icon: string }[] = [
  { id: 'game2048', label: '2048', icon: 'grid' },
  { id: 'flappy', label: 'Flappy Kuş', icon: 'bird' },
  { id: 'wordle', label: 'Kelime Bul', icon: 'alphabetical' },
];

const PURCHASE_PACKAGES = [
  { coins: 100, priceLabel: '₺9,99' },
  { coins: 500, priceLabel: '₺39,99' },
  { coins: 1000, priceLabel: '₺69,99' },
];

const AD_REWARD_COINS = 20;

export function GamesScreen() {
  const theme = useTheme();
  const user = useAppStore((s) => s.user);
  const gameLives = useAppStore((s) => s.gameLives);
  const highScores = useAppStore((s) => s.highScores);
  const dailyMissions = useAppStore((s) => s.dailyMissions);
  const regenerateLives = useAppStore((s) => s.regenerateLives);
  const initOrRotateDailyMissions = useAppStore((s) => s.initOrRotateDailyMissions);
  const claimMission = useAppStore((s) => s.claimMission);
  const addCoinsOptimistic = useAppStore((s) => s.addCoinsOptimistic);

  const [selectedGame, setSelectedGame] = React.useState<GameId | null>(null);
  const [modalVisible, setModalVisible] = React.useState(false);
  const [codeInput, setCodeInput] = React.useState('');
  const [codeMessage, setCodeMessage] = React.useState<string | null>(null);
  const [redeeming, setRedeeming] = React.useState(false);
  const [purchaseModal, setPurchaseModal] = React.useState<{ visible: boolean; reward: number } | null>(null);

  const { isLoaded: rewardedAdLoaded, show: showRewardedAd } = useRewardedAdReward(
    React.useCallback(() => {
      if (!user) return;
      addCoins(user.uid, AD_REWARD_COINS).catch(() => {});
      addCoinsOptimistic(AD_REWARD_COINS);
    }, [user])
  );

  const { maybeShow: maybeShowInterstitial } = useCappedInterstitialAd();

  useFocusEffect(
    React.useCallback(() => {
      regenerateLives();
      initOrRotateDailyMissions();
    }, [regenerateLives, initOrRotateDailyMissions])
  );

  function openGame(gameId: GameId) {
    maybeShowInterstitial();
    setSelectedGame(gameId);
    setModalVisible(true);
  }

  async function handleRedeem() {
    if (!codeInput.trim() || !user) return;
    setRedeeming(true);
    setCodeMessage(null);
    const result = await redeemCode(codeInput.trim(), user.uid);
    if (result.ok) {
      addCoinsOptimistic(result.coinAmount);
      setCodeMessage(`+${result.coinAmount} coin eklendi!`);
      setCodeInput('');
    } else {
      const messages: Record<string, string> = {
        not_found: 'Geçersiz kod',
        limit_reached: 'Kod kullanım limiti doldu',
        already_used: 'Bu kodu zaten kullandın',
      };
      setCodeMessage(messages[result.error] ?? 'Bir hata oluştu');
    }
    setRedeeming(false);
  }

  function handleWatchAd() {
    if (rewardedAdLoaded) showRewardedAd();
  }

  function handlePurchase(coins: number) {
    setPurchaseModal({ visible: true, reward: coins });
  }

  function handlePurchaseComplete() {
    if (!purchaseModal || !user) {
      setPurchaseModal(null);
      return;
    }
    addCoins(user.uid, purchaseModal.reward).catch(() => {});
    addCoinsOptimistic(purchaseModal.reward);
    setPurchaseModal(null);
  }

  async function handleClaimMission(missionId: string, coinReward: number) {
    if (!user) return;
    claimMission(missionId);
    await addCoins(user.uid, coinReward).catch(() => {});
    addCoinsOptimistic(coinReward);
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: theme.colors.onSurface }]}>Oyunlar</Text>
          <View style={styles.coinBadge}>
            <MaterialCommunityIcons name="cash" size={18} color="#e9b64a" />
            <Text style={[styles.coinText, { color: theme.colors.onSurface }]}>{user?.coins ?? 0}</Text>
          </View>
        </View>

        <View style={styles.livesRow}>
          <MaterialCommunityIcons name="heart" size={16} color="#e63946" />
          <Text style={[styles.livesText, { color: theme.colors.onSurfaceVariant }]}>
            {gameLives}/{MAX_LIVES} can
          </Text>
        </View>

        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Coin Kazan</Text>
          <View style={styles.rowGap}>
            <Button
              mode="contained-tonal"
              onPress={handleWatchAd}
              disabled={!rewardedAdLoaded}
              style={styles.flexButton}
            >
              {rewardedAdLoaded ? `🎬 Reklam İzle (+${AD_REWARD_COINS})` : 'Reklam yükleniyor…'}
            </Button>
          </View>
          <View style={styles.packagesRow}>
            {PURCHASE_PACKAGES.map((pkg) => (
              <TouchableOpacity
                key={pkg.coins}
                style={[styles.packageChip, { backgroundColor: theme.colors.surfaceVariant }]}
                onPress={() => handlePurchase(pkg.coins)}
              >
                <Text style={[styles.packageCoins, { color: theme.colors.onSurface }]}>{pkg.coins} coin</Text>
                <Text style={[styles.packagePrice, { color: theme.colors.onSurfaceVariant }]}>{pkg.priceLabel}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Surface>

        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Kod Kullan</Text>
          <View style={styles.codeRow}>
            <TextInput
              placeholder="Kodunu gir"
              placeholderTextColor={theme.colors.onSurfaceVariant}
              value={codeInput}
              onChangeText={setCodeInput}
              autoCapitalize="characters"
              style={[styles.codeInput, { color: theme.colors.onSurface, borderColor: theme.colors.outline }]}
            />
            <Button mode="contained" onPress={handleRedeem} loading={redeeming} disabled={!codeInput.trim() || redeeming}>
              Kullan
            </Button>
          </View>
          {codeMessage && <Text style={[styles.codeMessage, { color: theme.colors.onSurfaceVariant }]}>{codeMessage}</Text>}
        </Surface>

        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Günlük Görevler</Text>
          {dailyMissions?.missionIds.map((id) => {
            const def = getMissionDef(id);
            if (!def) return null;
            const progress = dailyMissions.progress[id] ?? 0;
            const claimed = dailyMissions.claimed[id];
            const done = progress >= def.target;
            return (
              <View key={id} style={styles.missionRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.missionLabel, { color: theme.colors.onSurface }]}>{def.label}</Text>
                  <Text style={[styles.missionProgress, { color: theme.colors.onSurfaceVariant }]}>
                    {Math.min(progress, def.target)}/{def.target} · +{def.coinReward} coin
                  </Text>
                </View>
                <Button
                  mode={claimed ? 'text' : 'contained'}
                  compact
                  disabled={!done || claimed}
                  onPress={() => handleClaimMission(id, def.coinReward)}
                >
                  {claimed ? 'Alındı' : 'Ödülü Al'}
                </Button>
              </View>
            );
          })}
        </Surface>

        <Text style={[styles.sectionTitle, { color: theme.colors.onSurface, marginHorizontal: 4 }]}>Oyna</Text>
        <View style={styles.gamesGrid}>
          {GAME_CARDS.map((game) => (
            <Surface key={game.id} style={[styles.gameCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
              <MaterialCommunityIcons name={game.icon as any} size={32} color={theme.colors.primary} />
              <Text style={[styles.gameLabel, { color: theme.colors.onSurface }]}>{game.label}</Text>
              <Text style={[styles.gameHighScore, { color: theme.colors.onSurfaceVariant }]}>
                Rekor: {highScores[game.id] ?? 0}
              </Text>
              <Button mode="contained" compact onPress={() => openGame(game.id)} style={{ borderRadius: 10 }}>
                Oyna
              </Button>
            </Surface>
          ))}
        </View>
      </ScrollView>

      <BannerAdBox />

      <GamePlayModal visible={modalVisible} gameId={selectedGame} onDismiss={() => setModalVisible(false)} />

      <DemoAdLoadingModal
        visible={!!purchaseModal?.visible}
        kind="purchase"
        rewardLabel={`+${purchaseModal?.reward ?? 0} Coin`}
        onComplete={handlePurchaseComplete}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, gap: 12, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 24, fontWeight: '800' },
  coinBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  coinText: { fontSize: 16, fontWeight: '700' },
  livesRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  livesText: { fontSize: 13 },
  card: { borderRadius: 14, padding: 16, gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  rowGap: { gap: 8 },
  flexButton: { borderRadius: 10 },
  packagesRow: { flexDirection: 'row', gap: 8 },
  packageChip: { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center', gap: 2 },
  packageCoins: { fontSize: 14, fontWeight: '700' },
  packagePrice: { fontSize: 12 },
  codeRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  codeInput: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 15 },
  codeMessage: { fontSize: 13 },
  missionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  missionLabel: { fontSize: 14, fontWeight: '600' },
  missionProgress: { fontSize: 12 },
  gamesGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  gameCard: { flex: 1, minWidth: '30%', borderRadius: 14, padding: 14, alignItems: 'center', gap: 6 },
  gameLabel: { fontSize: 14, fontWeight: '700' },
  gameHighScore: { fontSize: 12 },
});
