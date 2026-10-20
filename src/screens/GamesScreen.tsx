import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Surface, Button, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppStore } from '../store/useAppStore';
import { MAX_LIVES } from '../services/games/lifeService';
import { getMissionDef } from '../services/games/dailyMissionService';
import { GamePlayModal } from '../components/games/GamePlayModal';
import type { GameId } from '../types';

const GAME_CARDS: { id: GameId; label: string; icon: string }[] = [
  { id: 'game2048', label: '2048', icon: 'grid' },
  { id: 'flappy', label: 'Flappy Kuş', icon: 'bird' },
  { id: 'wordle', label: 'Kelime Bul', icon: 'alphabetical' },
  { id: 'tetris', label: 'Tetris', icon: 'shape' },
];

export function GamesScreen() {
  const theme = useTheme();
  const gameLives = useAppStore((s) => s.gameLives);
  const highScores = useAppStore((s) => s.highScores);
  const dailyMissions = useAppStore((s) => s.dailyMissions);
  const regenerateLives = useAppStore((s) => s.regenerateLives);
  const initOrRotateDailyMissions = useAppStore((s) => s.initOrRotateDailyMissions);

  const [selectedGame, setSelectedGame] = React.useState<GameId | null>(null);
  const [modalVisible, setModalVisible] = React.useState(false);

  useFocusEffect(
    React.useCallback(() => {
      GAME_CARDS.forEach((g) => regenerateLives(g.id));
      initOrRotateDailyMissions();
    }, [regenerateLives, initOrRotateDailyMissions])
  );

  function openGame(gameId: GameId) {
    setSelectedGame(gameId);
    setModalVisible(true);
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: theme.colors.onSurface }]}>Oyunlar</Text>
        </View>

        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Günlük Görevler</Text>
          {dailyMissions?.missionIds.map((id) => {
            const def = getMissionDef(id);
            if (!def) return null;
            const progress = dailyMissions.progress[id] ?? 0;
            const done = progress >= def.target;
            return (
              <View key={id} style={styles.missionRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.missionLabel, { color: theme.colors.onSurface }]}>{def.label}</Text>
                  <Text style={[styles.missionProgress, { color: theme.colors.onSurfaceVariant }]}>
                    {Math.min(progress, def.target)}/{def.target}
                  </Text>
                </View>
                {done && <MaterialCommunityIcons name="check-circle" size={22} color={theme.colors.primary} />}
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
              <View style={styles.gameLivesRow}>
                <MaterialCommunityIcons name="heart" size={12} color="#e63946" />
                <Text style={[styles.gameLivesText, { color: theme.colors.onSurfaceVariant }]}>
                  {gameLives[game.id]}/{MAX_LIVES}
                </Text>
              </View>
              <Button mode="contained" compact onPress={() => openGame(game.id)} style={{ borderRadius: 10 }}>
                Oyna
              </Button>
            </Surface>
          ))}
        </View>
      </ScrollView>

      <GamePlayModal visible={modalVisible} gameId={selectedGame} onDismiss={() => setModalVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, gap: 12, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 24, fontWeight: '800' },
  card: { borderRadius: 14, padding: 16, gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  missionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  missionLabel: { fontSize: 14, fontWeight: '600' },
  missionProgress: { fontSize: 12 },
  gamesGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  gameCard: { flex: 1, minWidth: '30%', borderRadius: 14, padding: 14, alignItems: 'center', gap: 6 },
  gameLabel: { fontSize: 14, fontWeight: '700' },
  gameHighScore: { fontSize: 12 },
  gameLivesRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  gameLivesText: { fontSize: 11 },
});
