import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Portal, Modal, Text, IconButton, Button, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppStore } from '../../store/useAppStore';
import { MAX_LIVES, msUntilNextLife } from '../../services/games/lifeService';
import { addCoins } from '../../services/firebase/coinService';
import { useRewardedAdReward } from '../../hooks/useRewardedAdReward';
import { Game2048 } from './Game2048';
import { GameFlappyBird } from './GameFlappyBird';
import { GameWordle } from './GameWordle';
import { GameBlockBlast } from './GameBlockBlast';
import { GameTetris } from './GameTetris';
import type { GameId } from '../../types';

interface Props {
  visible: boolean;
  gameId: GameId | null;
  onDismiss: () => void;
}

const GAME_LABELS: Record<GameId, string> = {
  game2048: '2048',
  flappy: 'Flappy Kuş',
  wordle: 'Kelime Bul',
  blockblast: 'Block Blast',
  tetris: 'Tetris',
};

const SCORE_COIN_THRESHOLDS: Record<GameId, { threshold: number; reward: number }> = {
  game2048: { threshold: 512, reward: 20 },
  flappy: { threshold: 10, reward: 20 },
  wordle: { threshold: 400, reward: 20 },
  blockblast: { threshold: 300, reward: 20 },
  tetris: { threshold: 500, reward: 20 },
};

export function GamePlayModal({ visible, gameId, onDismiss }: Props) {
  const theme = useTheme();
  const user = useAppStore((s) => s.user);
  const gameLives = useAppStore((s) => s.gameLives);
  const lastLifeConsumedAt = useAppStore((s) => s.lastLifeConsumedAt);
  const regenerateLives = useAppStore((s) => s.regenerateLives);
  const consumeLife = useAppStore((s) => s.consumeLife);
  const grantLife = useAppStore((s) => s.grantLife);
  const setHighScore = useAppStore((s) => s.setHighScore);
  const addCoinsOptimistic = useAppStore((s) => s.addCoinsOptimistic);
  const incrementMissionProgress = useAppStore((s) => s.incrementMissionProgress);

  const [liveScore, setLiveScore] = React.useState(0);
  const [sessionKey, setSessionKey] = React.useState(0);
  const [msLeft, setMsLeft] = React.useState<number | null>(null);
  const playedGamesRef = React.useRef<Set<GameId>>(new Set());

  const { isLoaded: rewardedAdLoaded, show: showRewardedAd } = useRewardedAdReward(
    React.useCallback(() => { if (gameId) grantLife(gameId); }, [gameId, grantLife])
  );

  React.useEffect(() => {
    if (!visible || !gameId) return;
    regenerateLives(gameId);
    setLiveScore(0);
    setSessionKey((k) => k + 1);
  }, [visible, gameId, regenerateLives]);

  React.useEffect(() => {
    if (!visible || !gameId) return;
    const interval = setInterval(() => {
      regenerateLives(gameId);
      const state = useAppStore.getState();
      const remaining = msUntilNextLife(state.gameLives[gameId], state.lastLifeConsumedAt[gameId]);
      setMsLeft(remaining);
    }, 1000);
    return () => clearInterval(interval);
  }, [visible, gameId, regenerateLives]);

  const handleGameOver = React.useCallback(
    (finalScore: number) => {
      if (!gameId) return;
      consumeLife(gameId);
      setHighScore(gameId, finalScore);
      playedGamesRef.current.add(gameId);
      incrementMissionProgress('playCount', 1);
      incrementMissionProgress('totalScore', finalScore);
      incrementMissionProgress('distinctGames', playedGamesRef.current.size);

      const rule = SCORE_COIN_THRESHOLDS[gameId];
      if (finalScore >= rule.threshold && user) {
        addCoins(user.uid, rule.reward).catch(() => {});
        addCoinsOptimistic(rule.reward);
      }
    },
    [gameId, consumeLife, setHighScore, incrementMissionProgress, user, addCoinsOptimistic]
  );

  function handleWatchAdForLife() {
    if (rewardedAdLoaded) showRewardedAd();
  }

  function renderGame() {
    if (!gameId) return null;
    const props = { onScoreUpdate: setLiveScore, onGameOver: handleGameOver };
    switch (gameId) {
      case 'game2048': return <Game2048 key={sessionKey} {...props} />;
      case 'flappy': return <GameFlappyBird key={sessionKey} {...props} />;
      case 'wordle': return <GameWordle key={sessionKey} {...props} />;
      case 'blockblast': return <GameBlockBlast key={sessionKey} {...props} />;
      case 'tetris': return <GameTetris key={sessionKey} {...props} />;
      default: return null;
    }
  }

  const secondsLeft = msLeft !== null ? Math.ceil(msLeft / 1000) : null;
  const currentLives = gameId ? gameLives[gameId] : 0;

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={[styles.container, { backgroundColor: theme.colors.surface }]}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <MaterialCommunityIcons name="heart" size={18} color="#e63946" />
              <Text style={[styles.headerText, { color: theme.colors.onSurface }]}>{currentLives}/{MAX_LIVES}</Text>
              <Text style={[styles.headerText, { color: theme.colors.onSurfaceVariant, marginLeft: 12 }]}>
                {gameId ? GAME_LABELS[gameId] : ''} · Skor: {liveScore}
              </Text>
            </View>
            <IconButton icon="close" size={22} onPress={onDismiss} />
          </View>

          <View style={styles.body}>
            {currentLives <= 0 ? (
              <View style={styles.noLives}>
                <MaterialCommunityIcons name="heart-off-outline" size={40} color={theme.colors.onSurfaceVariant} />
                <Text style={[styles.noLivesText, { color: theme.colors.onSurface }]}>Canların bitti</Text>
                {secondsLeft !== null && (
                  <Text style={[styles.noLivesSub, { color: theme.colors.onSurfaceVariant }]}>
                    {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')} sonra yeni can
                  </Text>
                )}
                <Button
                  mode="contained"
                  onPress={handleWatchAdForLife}
                  disabled={!rewardedAdLoaded}
                  style={{ marginTop: 12, borderRadius: 10 }}
                >
                  {rewardedAdLoaded ? 'Reklam İzleyerek Can Kazan' : 'Reklam yükleniyor…'}
                </Button>
              </View>
            ) : (
              renderGame()
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  container: { margin: 0, borderRadius: 0, flex: 1 },
  safeArea: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  headerText: { fontSize: 14, fontWeight: '700', marginLeft: 4 },
  body: { flex: 1, justifyContent: 'center' },
  noLives: { alignItems: 'center', paddingVertical: 48, gap: 6 },
  noLivesText: { fontSize: 16, fontWeight: '700' },
  noLivesSub: { fontSize: 13 },
});
