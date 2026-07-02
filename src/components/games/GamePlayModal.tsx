import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Portal, Modal, Text, IconButton, Button, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppStore } from '../../store/useAppStore';
import { MAX_LIVES, msUntilNextLife } from '../../services/games/lifeService';
import { addCoins } from '../../services/firebase/coinService';
import { Game2048 } from './Game2048';
import { GameFlappyBird } from './GameFlappyBird';
import { GameWordle } from './GameWordle';
import { DemoAdLoadingModal } from '../common/DemoAdLoadingModal';
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
};

const SCORE_COIN_THRESHOLDS: Record<GameId, { threshold: number; reward: number }> = {
  game2048: { threshold: 512, reward: 20 },
  flappy: { threshold: 10, reward: 20 },
  wordle: { threshold: 400, reward: 20 },
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
  const [adModalVisible, setAdModalVisible] = React.useState(false);
  const playedGamesRef = React.useRef<Set<GameId>>(new Set());

  React.useEffect(() => {
    if (!visible) return;
    regenerateLives();
    setLiveScore(0);
    setSessionKey((k) => k + 1);
  }, [visible, gameId, regenerateLives]);

  React.useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => {
      regenerateLives();
      const remaining = msUntilNextLife(useAppStore.getState().gameLives, useAppStore.getState().lastLifeConsumedAt);
      setMsLeft(remaining);
    }, 1000);
    return () => clearInterval(interval);
  }, [visible, regenerateLives]);

  const handleGameOver = React.useCallback(
    (finalScore: number) => {
      if (!gameId) return;
      consumeLife();
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
    setAdModalVisible(true);
  }

  function handleAdComplete() {
    setAdModalVisible(false);
    grantLife();
  }

  function renderGame() {
    if (!gameId) return null;
    const props = { onScoreUpdate: setLiveScore, onGameOver: handleGameOver };
    switch (gameId) {
      case 'game2048': return <Game2048 key={sessionKey} {...props} />;
      case 'flappy': return <GameFlappyBird key={sessionKey} {...props} />;
      case 'wordle': return <GameWordle key={sessionKey} {...props} />;
      default: return null;
    }
  }

  const secondsLeft = msLeft !== null ? Math.ceil(msLeft / 1000) : null;

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={[styles.container, { backgroundColor: theme.colors.surface }]}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <MaterialCommunityIcons name="heart" size={18} color="#e63946" />
            <Text style={[styles.headerText, { color: theme.colors.onSurface }]}>{gameLives}/{MAX_LIVES}</Text>
            <Text style={[styles.headerText, { color: theme.colors.onSurfaceVariant, marginLeft: 12 }]}>
              {gameId ? GAME_LABELS[gameId] : ''} · Skor: {liveScore}
            </Text>
          </View>
          <IconButton icon="close" size={20} onPress={onDismiss} />
        </View>

        {gameLives <= 0 ? (
          <View style={styles.noLives}>
            <MaterialCommunityIcons name="heart-off-outline" size={40} color={theme.colors.onSurfaceVariant} />
            <Text style={[styles.noLivesText, { color: theme.colors.onSurface }]}>Canların bitti</Text>
            {secondsLeft !== null && (
              <Text style={[styles.noLivesSub, { color: theme.colors.onSurfaceVariant }]}>
                {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')} sonra yeni can
              </Text>
            )}
            <Button mode="contained" onPress={handleWatchAdForLife} style={{ marginTop: 12, borderRadius: 10 }}>
              Reklam İzleyerek Can Kazan
            </Button>
          </View>
        ) : (
          renderGame()
        )}
      </Modal>

      <DemoAdLoadingModal
        visible={adModalVisible}
        kind="ad"
        rewardLabel="+1 Can"
        onComplete={handleAdComplete}
      />
    </Portal>
  );
}

const styles = StyleSheet.create({
  container: { margin: 12, borderRadius: 16, padding: 12, maxHeight: '90%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  headerText: { fontSize: 14, fontWeight: '700', marginLeft: 4 },
  noLives: { alignItems: 'center', paddingVertical: 48, gap: 6 },
  noLivesText: { fontSize: 16, fontWeight: '700' },
  noLivesSub: { fontSize: 13 },
});
