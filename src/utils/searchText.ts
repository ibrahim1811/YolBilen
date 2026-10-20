const FOLD: Record<string, string> = { ı: 'i', ç: 'c', ş: 's', ğ: 'g', ü: 'u', ö: 'o' };

// "FAHRETTİN" / "fahrettin" / "Fahrettin" ve "Üçyol" / "ucyol" aynı anahtara iner.
export function normalizeSearch(text: string): string {
  return text
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLocaleLowerCase('tr')
    .replace(/[ıçşğüö]/g, c => FOLD[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}
