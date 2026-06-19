import type { Badge } from '../../types';

const BADGE_DEFS: Omit<Badge, 'earned'>[] = [
  { id: 'newcomer',    icon: 'bus',                label: 'Yeni Yolcu',      description: 'İlk geri bildirimini ver',      requiredPoints: 10  },
  { id: 'helper',     icon: 'hand-heart',          label: 'Yardımsever',     description: '50 puan kazan',                 requiredPoints: 50  },
  { id: 'regular',    icon: 'star',                label: 'Düzenli Yolcu',   description: '100 puan kazan',                requiredPoints: 100 },
  { id: 'contributor',icon: 'account-heart',       label: 'Katkıcı',         description: '250 puan kazan',                requiredPoints: 250 },
  { id: 'expert',     icon: 'shield-star',         label: 'Yolculuk Uzmanı', description: '500 puan kazan',                requiredPoints: 500 },
  { id: 'champion',   icon: 'trophy',              label: 'Şampiyon',        description: '1000 puan kazan',               requiredPoints: 1000},
];

export function computeBadges(points: number): Badge[] {
  return BADGE_DEFS.map(b => ({ ...b, earned: points >= b.requiredPoints }));
}

export function nextBadge(points: number): Omit<Badge, 'earned'> | null {
  return [...BADGE_DEFS].sort((a, b) => a.requiredPoints - b.requiredPoints).find(b => points < b.requiredPoints) ?? null;
}

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
}

export function computeSeasonalBadges(stats: JourneyStatsForBadge): SeasonalBadge[] {
  return [
    {
      id: 'reporter100',
      icon: 'bell-badge',
      label: '100 Bildirim',
      description: '100 topluluk bildirimi gönder',
      earned: stats.total >= 100,
      progress: Math.min(stats.total / 100, 1),
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
