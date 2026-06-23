import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User, Location, Route, FavoriteLocation, FavoriteLine } from '../types';

interface AppState {
  user: User | null;
  isDarkMode: boolean;
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
      partialize: (state) => ({
        user: state.user,
        isDarkMode: state.isDarkMode,
        favoriteLocations: state.favoriteLocations,
        favoriteLines: state.favoriteLines,
      }),
    }
  )
);
