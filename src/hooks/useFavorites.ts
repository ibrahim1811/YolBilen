import { useEffect, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  getUserFavoriteLocations,
  getUserFavoriteLines,
  addFavoriteLocation as fsAddLocation,
  removeFavoriteLocation as fsRemoveLocation,
  addFavoriteLine as fsAddLine,
  removeFavoriteLine as fsRemoveLine,
} from '../services/firebase/firestore';
import type { FavoriteType, Location } from '../types';

export function useFavorites() {
  const user = useAppStore((s) => s.user);
  const favoriteLocations = useAppStore((s) => s.favoriteLocations);
  const favoriteLines = useAppStore((s) => s.favoriteLines);
  const setFavoriteLocations = useAppStore((s) => s.setFavoriteLocations);
  const setFavoriteLines = useAppStore((s) => s.setFavoriteLines);
  const addLocStore = useAppStore((s) => s.addFavoriteLocation);
  const removeLocStore = useAppStore((s) => s.removeFavoriteLocation);
  const addLineStore = useAppStore((s) => s.addFavoriteLine);
  const removeLineStore = useAppStore((s) => s.removeFavoriteLine);

  useEffect(() => {
    if (!user || user.isGuest) {
      setFavoriteLocations([]);
      setFavoriteLines([]);
      return;
    }
    getUserFavoriteLocations(user.uid).then(setFavoriteLocations).catch(() => {});
    getUserFavoriteLines(user.uid).then(setFavoriteLines).catch(() => {});
  }, [user?.uid, user?.isGuest]);

  const addLocation = useCallback(
    async (type: FavoriteType, label: string, location: Location) => {
      if (!user) return;
      const created = await fsAddLocation(user.uid, type, label, location);
      addLocStore(created);
    },
    [user]
  );

  const removeLocation = useCallback(async (id: string) => {
    await fsRemoveLocation(id);
    removeLocStore(id);
  }, []);

  const addLine = useCallback(
    async (lineNumber: string, lineName: string) => {
      if (!user) return;
      const created = await fsAddLine(user.uid, lineNumber, lineName);
      addLineStore(created);
    },
    [user]
  );

  const removeLine = useCallback(async (id: string) => {
    try { await fsRemoveLine(id); } catch {}
    removeLineStore(id);
  }, []);

  const isLineFavorited = useCallback(
    (lineNumber: string) => favoriteLines.some((l) => l.lineNumber === lineNumber),
    [favoriteLines]
  );

  const getLocationByType = useCallback(
    (type: FavoriteType) => favoriteLocations.find((l) => l.type === type) ?? null,
    [favoriteLocations]
  );

  return {
    favoriteLocations,
    favoriteLines,
    addLocation,
    removeLocation,
    addLine,
    removeLine,
    isLineFavorited,
    getLocationByType,
  };
}
