import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User, Location, Route, FavoriteLocation, FavoriteLine, NotificationPrefs } from '../types';

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  busArrivals: true,
  lineAlerts: true,
  crowdAlerts: false,
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
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
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
    }),
    {
      name: 'yolbul-store',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      migrate: (persistedState: any, version: number) => {
        if (version === 0) {
          return {
            ...persistedState,
            nightSafeMode: true,
            notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
          };
        }
        return persistedState;
      },
      partialize: (state) => ({
        user: state.user,
        isDarkMode: state.isDarkMode,
        allowLongWalk: state.allowLongWalk,
        nightSafeMode: state.nightSafeMode,
        notificationPrefs: state.notificationPrefs,
        favoriteLocations: state.favoriteLocations,
        favoriteLines: state.favoriteLines,
      }),
    }
  )
);
