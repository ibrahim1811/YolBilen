import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UPDATE_BASE_URL } from '../update/updateService';

// Cloudflare'daki config.json (update-worker/config.json, ayar-yayinla.ps1 ile güncellenir).
// Uygulama yeni build gerekmeden bu değerlere göre davranır.
export interface RemoteConfig {
  announcement: { id: string; text: string; level?: 'info' | 'warning' } | null;
  features: { liveArrivals: boolean };
  minVersionCode: number;
}

export const DEFAULT_CONFIG: RemoteConfig = {
  announcement: null,
  features: { liveArrivals: true },
  minVersionCode: 0,
};

const CACHE_KEY = 'remote_config:v1';

let current: RemoteConfig = DEFAULT_CONFIG;
const listeners = new Set<(c: RemoteConfig) => void>();

function merge(raw: Partial<RemoteConfig> | null | undefined): RemoteConfig {
  return {
    announcement: raw?.announcement ?? null,
    features: { ...DEFAULT_CONFIG.features, ...(raw?.features ?? {}) },
    minVersionCode: Number(raw?.minVersionCode ?? 0) || 0,
  };
}

function publish(c: RemoteConfig) {
  current = c;
  listeners.forEach(l => l(c));
}

export function getRemoteConfig(): RemoteConfig {
  return current;
}

// Önce önbellekteki son değer, sonra sunucudaki taze değer yüklenir; ağ yoksa önbellek geçerli kalır.
export async function loadRemoteConfig(): Promise<void> {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached) publish(merge(JSON.parse(cached)));
  } catch (e) {
    console.warn('[remoteConfig] önbellek okunamadı:', e);
  }
  const res = await fetch(`${UPDATE_BASE_URL}/config.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`config.json HTTP ${res.status}`);
  const fresh = merge(await res.json());
  publish(fresh);
  AsyncStorage.setItem(CACHE_KEY, JSON.stringify(fresh)).catch(e => console.warn('[remoteConfig] önbelleğe yazılamadı:', e));
}

export function useRemoteConfig(): RemoteConfig {
  const [c, setC] = useState(current);
  useEffect(() => {
    listeners.add(setC);
    setC(current);
    return () => { listeners.delete(setC); };
  }, []);
  return c;
}
