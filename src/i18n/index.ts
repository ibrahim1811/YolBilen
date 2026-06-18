import { tr } from './tr';

// Şu an sadece Türkçe destekleniyor.
// İleride: { tr, en, de, ... } map'i + AsyncStorage'dan dil okuma
const translations = tr;

export type TranslationKey = keyof typeof tr;
export type Translations = typeof tr;

export function t<K extends TranslationKey>(key: K): (typeof tr)[K] {
  return translations[key];
}

// Dinamik string fonksiyonları için (ör: t('stop_arrival_min')(5))
export { tr };
