// ESHOT GTFS stop_times'tan her hat/yön için durak bazlı yolculuk süreleri üretir.
// Çıktı: src/data/gtfs/route-offsets.json
//   { "<hat>_<yön>": { o: [ilk duraktan dakika, ...], m: [saat dilimi çarpanları] } }
// Saat dilimleri: 0: 05-07, 1: 07-10, 2: 10-16, 3: 16-20, 4: 20-05
// Kullanım: node scripts/build-bus-offsets.mjs
import { createReadStream } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { createInterface } from 'readline';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GTFS = join(__dirname, '../assets/gtfs/bus-eshot-gtfs');
const OUT = join(__dirname, '../src/data/gtfs');

async function readCsv(file) {
  const rl = createInterface({ input: createReadStream(join(GTFS, file)), crlfDelay: Infinity });
  const rows = [];
  let headers = null;
  for await (const line of rl) {
    const vals = line.replace(/\r/g, '').split(',');
    if (!headers) { headers = vals.map(h => h.trim()); continue; }
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim(); });
    rows.push(obj);
  }
  return rows;
}

function toSecs(t) {
  const [h, m, s] = t.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

function bucketOf(startSecs) {
  const h = Math.floor(startSecs / 3600) % 24;
  if (h >= 5 && h < 7) return 0;
  if (h >= 7 && h < 10) return 1;
  if (h >= 10 && h < 16) return 2;
  if (h >= 16 && h < 20) return 3;
  return 4;
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

async function main() {
  const [routes, trips] = await Promise.all([readCsv('routes.txt'), readCsv('trips.txt')]);
  const lineOf = new Map(routes.map(r => [r.route_id, r.route_short_name]));
  const tripKey = new Map();
  for (const t of trips) {
    const ln = lineOf.get(t.route_id);
    if (ln) tripKey.set(t.trip_id, `${ln}_${t.direction_id === '1' ? 1 : 0}`);
  }
  const seqs = JSON.parse(await readFile(join(OUT, 'route-stop-seqs.json'), 'utf8'));

  console.log('Reading stop_times.txt...');
  const tripTimes = new Map();
  const rl = createInterface({ input: createReadStream(join(GTFS, 'stop_times.txt')), crlfDelay: Infinity });
  let header = true;
  for await (const line of rl) {
    if (header) { header = false; continue; }
    const p = line.replace(/\r/g, '').split(',');
    let arr = tripTimes.get(p[0]);
    if (!arr) { arr = []; tripTimes.set(p[0], arr); }
    arr.push([parseInt(p[4], 10), p[3], toSecs(p[2])]);
  }

  // key -> { perStop: number[][], buckets: number[][] (toplam süre örnekleri) }
  const acc = new Map();
  let used = 0;
  for (const [tripId, rows] of tripTimes) {
    const key = tripKey.get(tripId);
    const seq = key && seqs[key];
    if (!seq) continue;
    rows.sort((a, b) => a[0] - b[0]);
    // Yalnızca temsilci durak sırasıyla birebir aynı seferler (kısa dönüş/varyantlar karışmasın)
    if (rows.length !== seq.length || rows.some((r, i) => r[1] !== seq[i])) continue;
    const t0 = rows[0][2];
    const offs = rows.map(r => (r[2] - t0) / 60);
    if (offs.some((o, i) => i > 0 && o < offs[i - 1])) continue;
    let a = acc.get(key);
    if (!a) { a = { perStop: seq.map(() => []), buckets: [[], [], [], [], []] }; acc.set(key, a); }
    offs.forEach((o, i) => a.perStop[i].push(o));
    a.buckets[bucketOf(t0)].push(offs[offs.length - 1]);
    used++;
  }

  const out = {};
  for (const [key, a] of acc) {
    const o = a.perStop.map(v => Math.round(median(v) * 10) / 10);
    const total = o[o.length - 1] || 1;
    const m = a.buckets.map(b => (b.length ? Math.round((median(b) / total) * 100) / 100 : 1));
    out[key] = { o, m };
  }
  await writeFile(join(OUT, 'route-offsets.json'), JSON.stringify(out));
  console.log(`patterns: ${Object.keys(out).length} / ${Object.keys(seqs).length}, trips used: ${used}`);
}

main().catch(e => { console.error(e); process.exit(1); });
