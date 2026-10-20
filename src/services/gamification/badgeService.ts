export interface SeasonalBadge {
  id: string;
  icon: string;
  label: string;
  description: string;
  earned: boolean;
  progress: number;
}

interface JourneyStatsForBadge {
  total: number;
  totalKm: number;
  uniqueLines: number;
  feedbackCount: number;
}

export function computeSeasonalBadges(stats: JourneyStatsForBadge): SeasonalBadge[] {
  return [
    {
      id: 'reporter100',
      icon: 'bell-badge',
      label: '100 Bildirim',
      description: '100 topluluk bildirimi gönder',
      earned: stats.feedbackCount >= 100,
      progress: Math.min(stats.feedbackCount / 100, 1),
    },
    {
      id: 'km1000',
      icon: 'road-variant',
      label: '1000 km',
      description: '1000 km yolculuk yap',
      earned: stats.totalKm >= 1000,
      progress: Math.min(stats.totalKm / 1000, 1),
    },
    {
      id: 'lines50',
      icon: 'bus-multiple',
      label: '50 Hat Gezgin',
      description: '50 farklı hat kullan',
      earned: stats.uniqueLines >= 50,
      progress: Math.min(stats.uniqueLines / 50, 1),
    },
  ];
}
