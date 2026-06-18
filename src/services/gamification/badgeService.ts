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
