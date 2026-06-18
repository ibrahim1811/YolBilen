import { useState, useEffect } from 'react';
import * as Location from 'expo-location';
import { fetchWeather } from '../services/weather/weatherService';
import type { WeatherData } from '../types';

interface WeatherState {
  data: WeatherData | null;
  loading: boolean;
  error: string | null;
}

export function useWeather() {
  const [state, setState] = useState<WeatherState>({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) setState({ data: null, loading: false, error: 'permission_denied' });
          return;
        }

        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const data = await fetchWeather(loc.coords.latitude, loc.coords.longitude);
        if (!cancelled) setState({ data, loading: false, error: null });
      } catch {
        if (!cancelled) setState({ data: null, loading: false, error: 'fetch_failed' });
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return state;
}
