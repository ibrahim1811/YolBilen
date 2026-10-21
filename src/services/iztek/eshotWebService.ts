// ESHOT'un "Otobüsüm Nerede" sayfası (durak QR kodlarının açtığı sayfa). Resmi kalan süre/mesafe buradan gelir;
// JSON değil HTML döner, hatId yok sayılır — yalnızca durakId önemli.
const URL = 'https://www.eshot.gov.tr/tr/OtobusumNerede/290';
const CACHE_TTL_MS = 20_000;
const TIMEOUT_MS = 6_000;

export interface EshotArrival {
  hatNumarasi: number;
  hatAdi: string;
  mesafeM: number;
  kalanDk: number;
}

const _cache = new Map<number, { at: number; promise: Promise<EshotArrival[]> }>();

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export function parseArrivals(html: string): EshotArrival[] {
  const start = html.indexOf('table-responsive only-desktop');
  if (start < 0) return [];
  const table = html.slice(start, html.indexOf('</table>', start));
  const result: EshotArrival[] = [];
  for (const row of table.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []) {
    const cells = [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(m => decodeEntities(m[1]));
    if (cells.length !== 4) continue;
    const [hat, hatAdi, mesafe, sure] = cells;
    const hatNumarasi = Number(hat);
    if (!Number.isFinite(hatNumarasi)) continue;
    result.push({
      hatNumarasi,
      hatAdi,
      mesafeM: /durakta/i.test(mesafe) ? 0 : parseInt(mesafe, 10) || 0,
      kalanDk: /durakta/i.test(sure) ? 0 : parseInt(sure, 10) || 0,
    });
  }
  return result;
}

async function fetchArrivals(durakId: number): Promise<EshotArrival[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `hatId=&durakId=${durakId}&hatYon=1`,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`ESHOT sayfası yanıtı geçersiz (HTTP ${res.status})`);
    const html = await res.text();
    if (!html.includes('OtobusumNerede')) throw new Error('ESHOT sayfası beklenmeyen içerik döndü');
    return parseArrivals(html);
  } finally {
    clearTimeout(timer);
  }
}

export function getEshotArrivals(durakId: number): Promise<EshotArrival[]> {
  const hit = _cache.get(durakId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.promise;
  const promise = fetchArrivals(durakId);
  _cache.set(durakId, { at: Date.now(), promise });
  promise.catch(() => _cache.delete(durakId));
  return promise;
}
