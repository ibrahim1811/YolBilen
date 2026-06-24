import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Route, Location } from '../../types';

const CACHE_KEY = 'route_cache_v2';
const MAX_ENTRIES = 10;
const TTL_REALTIME_MS = 5 * 60 * 1000;
const TTL_STATIC_MS = 30 * 60 * 1000;

type CacheType = 'realtime' | 'static';

interface CacheEntry {
  originName: string;
  destinationName: string;
  routes: Route[];
  savedAt: number;
  cacheType: CacheType;
}

async function readAll(): Promise<CacheEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function writeAll(entries: CacheEntry[]): Promise<void> {
  try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entries)); } catch {}
}

export async function saveRouteCache(
  origin: Location,
  destination: Location,
  routes: Route[],
  cacheType: CacheType = 'static'
): Promise<void> {
  const all = await readAll();
  const filtered = all.filter(
    e => !(e.originName === origin.name && e.destinationName === destination.name)
  );
  filtered.unshift({ originName: origin.name, destinationName: destination.name, routes, savedAt: Date.now(), cacheType });
  await writeAll(filtered.slice(0, MAX_ENTRIES));
}

export async function loadRouteCache(
  origin: Location,
  destination: Location
): Promise<Route[] | null> {
  const all = await readAll();
  const entry = all.find(
    e => e.originName === origin.name && e.destinationName === destination.name
  );
  if (!entry) return null;
  const ttl = entry.cacheType === 'realtime' ? TTL_REALTIME_MS : TTL_STATIC_MS;
  if (Date.now() - entry.savedAt > ttl) return null;
  return entry.routes;
}
