import type { WeatherData } from '../../types';

// WMO Weather Code → { icon, description, isRainy }
const WMO_MAP: Record<number, { icon: string; description: string; isRainy: boolean }> = {
  0:  { icon: 'weather-sunny',           description: 'Açık',              isRainy: false },
  1:  { icon: 'weather-sunny',           description: 'Çoğunlukla Açık',   isRainy: false },
  2:  { icon: 'weather-partly-cloudy',   description: 'Parçalı Bulutlu',   isRainy: false },
  3:  { icon: 'weather-cloudy',          description: 'Bulutlu',           isRainy: false },
  45: { icon: 'weather-fog',             description: 'Sisli',             isRainy: false },
  48: { icon: 'weather-fog',             description: 'Kırağılı Sis',      isRainy: false },
  51: { icon: 'weather-rainy',           description: 'Hafif Çisenti',     isRainy: true  },
  53: { icon: 'weather-rainy',           description: 'Çisenti',           isRainy: true  },
  55: { icon: 'weather-rainy',           description: 'Yoğun Çisenti',     isRainy: true  },
  61: { icon: 'weather-rainy',           description: 'Hafif Yağmur',      isRainy: true  },
  63: { icon: 'weather-rainy',           description: 'Yağmurlu',          isRainy: true  },
  65: { icon: 'weather-pouring',         description: 'Şiddetli Yağmur',   isRainy: true  },
  71: { icon: 'weather-snowy',           description: 'Hafif Kar',         isRainy: false },
  73: { icon: 'weather-snowy',           description: 'Karlı',             isRainy: false },
  75: { icon: 'weather-snowy-heavy',     description: 'Yoğun Kar',         isRainy: false },
  80: { icon: 'weather-partly-rainy',    description: 'Sağanak',           isRainy: true  },
  81: { icon: 'weather-pouring',         description: 'Kuvvetli Sağanak',  isRainy: true  },
  95: { icon: 'weather-lightning-rainy', description: 'Fırtınalı',         isRainy: true  },
  99: { icon: 'weather-lightning-rainy', description: 'Dolu Fırtınası',    isRainy: true  },
};

function resolveWmo(code: number) {
  return WMO_MAP[code] ?? { icon: 'weather-cloudy', description: 'Bilinmiyor', isRainy: false };
}

export async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,weathercode&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Weather fetch failed');

  const json = await res.json();
  const current = json.current;
  const temp = Math.round(current.temperature_2m);
  const feelsLike = Math.round(current.apparent_temperature);
  const code = current.weathercode as number;
  const { icon, description, isRainy } = resolveWmo(code);

  return {
    temperature: temp,
    feelsLike,
    weatherCode: code,
    description,
    icon,
    isHot: temp >= 30,
    isRainy,
  };
}
