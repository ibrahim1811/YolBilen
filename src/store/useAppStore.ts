import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  User,
  Location,
  Route,
  FavoriteLocation,
  FavoriteLine,
  NotificationPrefs,
  GameId,
  DailyMissionState,
  MissionMetric,
} from '../types';
import { MAX_LIVES, computeRegeneratedLives } from '../services/games/lifeService';
import { todayDateSeed, pickDailyMissions, getMissionDef } from '../services/games/dailyMissionService';

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  busArrivals: true,
  lineAlerts: true,
};

const DEFAULT_HIGH_SCORES: Record<GameId, number> = {
  game2048: 0,
  flappy: 0,
  wordle: 0,
  tetris: 0,
};

const DEFAULT_GAME_LIVES: Record<GameId, number> = {
  game2048: MAX_LIVES,
  flappy: MAX_LIVES,
  wordle: MAX_LIVES,
  tetris: MAX_LIVES,
};

const DEFAULT_LAST_LIFE_CONSUMED: Record<GameId, number | null> = {
  game2048: null,
  flappy: null,
  wordle: null,
  tetris: null,
};

interface AppState {
  user: User | null;
  isDarkMode: boolean;
  allowLongWalk: boolean;
  nightSafeMode: boolean;
  notificationPrefs: NotificationPrefs;
  origin: Location | null;
  destination: Location | null;
  routes: Route[];
  selectedRoute: Route | null;
  isLoading: boolean;
  favoriteLocations: FavoriteLocation[];
  favoriteLines: FavoriteLine[];
  pendingFeedbackPlate: string | null;
  gameLives: Record<GameId, number>;
  lastLifeConsumedAt: Record<GameId, number | null>;
  highScores: Record<GameId, number>;
  dailyMissions: DailyMissionState | null;

  setUser: (user: User | null) => void;
  toggleDarkMode: () => void;
  setAllowLongWalk: (v: boolean) => void;
  toggleNightSafeMode: () => void;
  setNotificationPrefs: (prefs: NotificationPrefs) => void;
  setOrigin: (location: Location | null) => void;
  setDestination: (destination: Location | null) => void;
  setRoutes: (routes: Route[]) => void;
  setSelectedRoute: (route: Route | null) => void;
  setLoading: (loading: boolean) => void;
  setFavoriteLocations: (locations: FavoriteLocation[]) => void;
  setFavoriteLines: (lines: FavoriteLine[]) => void;
  addFavoriteLocation: (loc: FavoriteLocation) => void;
  removeFavoriteLocation: (id: string) => void;
  addFavoriteLine: (line: FavoriteLine) => void;
  removeFavoriteLine: (id: string) => void;
  setPendingFeedbackPlate: (plate: string | null) => void;
  consumeLife: (gameId: GameId) => void;
  regenerateLives: (gameId: GameId) => void;
  grantLife: (gameId: GameId) => void;
  setHighScore: (gameId: GameId, score: number) => void;
  initOrRotateDailyMissions: () => void;
  incrementMissionProgress: (metric: MissionMetric, amount: number) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      isDarkMode: false,
      allowLongWalk: false,
      nightSafeMode: true,
      notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
      origin: null,
      destination: null,
      routes: [],
      selectedRoute: null,
      isLoading: false,
      favoriteLocations: [],
      favoriteLines: [],
      pendingFeedbackPlate: null,
      gameLives: DEFAULT_GAME_LIVES,
      lastLifeConsumedAt: DEFAULT_LAST_LIFE_CONSUMED,
      highScores: DEFAULT_HIGH_SCORES,
      dailyMissions: null,
      setUser: (user) => set({ user }),
      toggleDarkMode: () => set((s) => ({ isDarkMode: !s.isDarkMode })),
      setAllowLongWalk: (allowLongWalk) => set({ allowLongWalk }),
      toggleNightSafeMode: () => set((s) => ({ nightSafeMode: !s.nightSafeMode })),
      setNotificationPrefs: (notificationPrefs) => set({ notificationPrefs }),
      setOrigin: (origin) => set({ origin }),
      setDestination: (destination) => set({ destination }),
      setRoutes: (routes) => set({ routes }),
      setSelectedRoute: (selectedRoute) => set({ selectedRoute }),
      setLoading: (isLoading) => set({ isLoading }),
      setFavoriteLocations: (favoriteLocations) => set({ favoriteLocations }),
      setFavoriteLines: (favoriteLines) => set({ favoriteLines }),
      addFavoriteLocation: (loc) =>
        set((s) => ({ favoriteLocations: [...s.favoriteLocations, loc] })),
      removeFavoriteLocation: (id) =>
        set((s) => ({ favoriteLocations: s.favoriteLocations.filter((l) => l.id !== id) })),
      addFavoriteLine: (line) =>
        set((s) => ({ favoriteLines: [...s.favoriteLines, line] })),
      removeFavoriteLine: (id) =>
        set((s) => ({ favoriteLines: s.favoriteLines.filter((l) => l.id !== id) })),
      setPendingFeedbackPlate: (plate) => set({ pendingFeedbackPlate: plate }),

      consumeLife: (gameId) =>
        set((s) => ({
          gameLives: { ...s.gameLives, [gameId]: Math.max(0, s.gameLives[gameId] - 1) },
          lastLifeConsumedAt: { ...s.lastLifeConsumedAt, [gameId]: s.lastLifeConsumedAt[gameId] ?? Date.now() },
        })),
      regenerateLives: (gameId) =>
        set((s) => {
          const { lives, lastConsumedAt } = computeRegeneratedLives(s.gameLives[gameId], s.lastLifeConsumedAt[gameId]);
          return {
            gameLives: { ...s.gameLives, [gameId]: lives },
            lastLifeConsumedAt: { ...s.lastLifeConsumedAt, [gameId]: lastConsumedAt },
          };
        }),
      grantLife: (gameId) =>
        set((s) => {
          const lives = Math.min(MAX_LIVES, s.gameLives[gameId] + 1);
          return {
            gameLives: { ...s.gameLives, [gameId]: lives },
            lastLifeConsumedAt: { ...s.lastLifeConsumedAt, [gameId]: lives >= MAX_LIVES ? null : s.lastLifeConsumedAt[gameId] },
          };
        }),
      setHighScore: (gameId, score) =>
        set((s) => ({
          highScores: {
            ...s.highScores,
            [gameId]: Math.max(s.highScores[gameId] ?? 0, score),
          },
        })),
      initOrRotateDailyMissions: () => {
        const today = todayDateSeed();
        const current = get().dailyMissions;
        if (current && current.date === today) return;
        const missionIds = pickDailyMissions(today);
        set({
          dailyMissions: {
            date: today,
            missionIds,
            progress: Object.fromEntries(missionIds.map((id) => [id, 0])),
            claimed: Object.fromEntries(missionIds.map((id) => [id, false])),
          },
        });
      },
      incrementMissionProgress: (metric, amount) =>
        set((s) => {
          if (!s.dailyMissions) return {};
          const progress = { ...s.dailyMissions.progress };
          for (const id of s.dailyMissions.missionIds) {
            const def = getMissionDef(id);
            if (def && def.metric === metric) {
              progress[id] = Math.min(def.target, (progress[id] ?? 0) + amount);
            }
          }
          return { dailyMissions: { ...s.dailyMissions, progress } };
        }),
    }),
    {
      name: 'yolbul-store',
      storage: createJSONStorage(() => AsyncStorage),
      version: 5,
      migrate: (persistedState: any, version: number) => {
        let state = persistedState;
        if (version === 0) {
          state = {
            ...state,
            nightSafeMode: true,
            notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
          };
        }
        if (version < 2) {
          state = {
            ...state,
            gameLives: MAX_LIVES,
            lastLifeConsumedAt: null,
            highScores: DEFAULT_HIGH_SCORES,
            dailyMissions: null,
          };
        }
        if (version < 3) {
          // gameLives/lastLifeConsumedAt tek sayıdan oyun başına Record'a geçti
          state = {
            ...state,
            gameLives: DEFAULT_GAME_LIVES,
            lastLifeConsumedAt: DEFAULT_LAST_LIFE_CONSUMED,
          };
        }
        if (version < 4) {
          // Block Blast ve Tetris eklendi — yeni GameId anahtarlarını mevcut Record'lara ekle
          state = {
            ...state,
            gameLives: { ...DEFAULT_GAME_LIVES, ...state.gameLives },
            lastLifeConsumedAt: { ...DEFAULT_LAST_LIFE_CONSUMED, ...state.lastLifeConsumedAt },
            highScores: { ...DEFAULT_HIGH_SCORES, ...state.highScores },
          };
        }
        if (version < 5) {
          // Block Blast kaldırıldı — eski anahtarı temizle
          const strip = (r: Record<string, unknown> | undefined) => {
            const { blockblast: _removed, ...rest } = r ?? {};
            return rest;
          };
          state = {
            ...state,
            gameLives: { ...DEFAULT_GAME_LIVES, ...strip(state.gameLives) },
            lastLifeConsumedAt: { ...DEFAULT_LAST_LIFE_CONSUMED, ...strip(state.lastLifeConsumedAt) },
            highScores: { ...DEFAULT_HIGH_SCORES, ...strip(state.highScores) },
          };
        }
        return state;
      },
      partialize: (state) => ({
        user: state.user,
        isDarkMode: state.isDarkMode,
        allowLongWalk: state.allowLongWalk,
        nightSafeMode: state.nightSafeMode,
        notificationPrefs: state.notificationPrefs,
        favoriteLocations: state.favoriteLocations,
        favoriteLines: state.favoriteLines,
        gameLives: state.gameLives,
        lastLifeConsumedAt: state.lastLifeConsumedAt,
        highScores: state.highScores,
        dailyMissions: state.dailyMissions,
      }),
    }
  )
);
