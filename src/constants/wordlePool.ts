export const WORDLE_POOL: string[] = [
  'KİTAP', 'MASAL', 'ELMAS', 'TAKIM', 'KAPAK', 'SEVGİ', 'ÇİÇEK', 'BALIK', 'KARGA', 'TAVUK',
  'ÇORAP', 'ASLAN', 'KUZEY', 'GÜNEŞ', 'DENİZ', 'ORMAN', 'SOKAK', 'KAZAN', 'YAZAR', 'SEPET',
  'PAZAR', 'KUTUP', 'TAKSİ', 'ZEMİN', 'HAVUÇ', 'KUTLU', 'BAHAR', 'TARIM', 'YAYLA', 'DURAK',
];

export function pickRandomWord(): string {
  return WORDLE_POOL[Math.floor(Math.random() * WORDLE_POOL.length)];
}
