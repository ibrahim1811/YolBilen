// Metro, tramvay, İZBAN ve İzdeniz verilerini tek bir rail.json'a dönüştürür.
// Kullanım: node scripts/build-rail-gtfs.mjs <gtfs-klasörü>
//   <gtfs-klasörü>/metro, /tram, /izban altında açılmış GTFS zip'leri beklenir:
//   https://www.izmirmetro.com.tr/gtfs/rail-metro-gtfs.zip
//   https://www.tramizmir.com/gtfs/rail-tramizmir-gtfs.zip
//   https://www.izban.com.tr/gtfs/rail-izban-gtfs.zip
// İZBAN GTFS'inin takvimi eski (2022-2025) olduğu için kalkış saatleri openapi.izmir.bel.tr'den alınır.
// İzdeniz GTFS zip'i yayında değil; vapur seferleri de aynı API'den gelir.
import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2];
const OUT = join(__dirname, '../src/data/gtfs/rail.json');
const API = 'https://openapi.izmir.bel.tr/api';

if (!SRC) {
  console.error('Kullanım: node scripts/build-rail-gtfs.mjs <gtfs-klasörü>');
  process.exit(1);
}

function parseLine(line) {
  const out = [];
  let cur = '', q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

async function readCsv(dir, file) {
  const text = (await readFile(join(SRC, dir, file), 'utf8')).replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = parseLine(lines[0]);
  return lines.slice(1).map(l => {
    const vals = parseLine(l);
    const o = {};
    headers.forEach((h, i) => { o[h] = vals[i] ?? ''; });
    return o;
  });
}

const toMins = (t) => {
  const [h, m, s] = t.split(':').map(Number);
  return h * 60 + m + Math.round((s || 0) / 60);
};
const uniqSorted = (a) => [...new Set(a)].sort((x, y) => x - y);
const SVC = { WEEKDAY: 'weekday', WEEKDAYS: 'weekday', SATURDAY: 'saturday', SUNDAY: 'sunday' };

async function getJson(url, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await new Promise(r => setTimeout(r, 250));
      return await res.json();
    } catch (e) {
      if (i === tries - 1) throw new Error(`${url}: ${e.message}`);
      await new Promise(r => setTimeout(r, 3000 * (i + 1)));
    }
  }
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

const data = { lines: {}, stops: [], seqs: {}, offsets: {}, deps: {}, builtAt: new Date().toISOString().slice(0, 10) };
const stopSeen = new Set();

function addStop(id, name, lat, lon) {
  if (stopSeen.has(id)) return;
  stopSeen.add(id);
  data.stops.push({ id, name, lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6 });
}

// lineDirOf(route, trip) → { lineNum, dir } | null
async function loadGtfs(dir, prefix, lineDirOf) {
  const [stops, routes, trips, stopTimes] = await Promise.all([
    readCsv(dir, 'stops.txt'), readCsv(dir, 'routes.txt'), readCsv(dir, 'trips.txt'), readCsv(dir, 'stop_times.txt'),
  ]);
  const stopById = new Map(stops.map(s => [s.stop_id, s]));
  const routeById = new Map(routes.map(r => [r.route_id, r]));
  const byTrip = new Map();
  for (const st of stopTimes) {
    if (!byTrip.has(st.trip_id)) byTrip.set(st.trip_id, []);
    byTrip.get(st.trip_id).push(st);
  }
  const groups = new Map();
  for (const t of trips) {
    const ld = lineDirOf(routeById.get(t.route_id), t);
    if (!ld) continue;
    const sts = (byTrip.get(t.trip_id) ?? []).sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
    if (sts.length < 2) continue;
    const key = `${ld.lineNum}_${ld.dir}`;
    if (!groups.has(key)) groups.set(key, { trips: [] });
    groups.get(key).trips.push({ svc: SVC[t.service_id] ?? 'weekday', sts });
  }
  for (const [key, g] of groups) {
    // En uzun sefer hattın durak dizisini temsil eder; kısa dönüşlü seferler ayrı tutulmaz.
    const rep = g.trips.reduce((a, b) => (b.sts.length > a.sts.length ? b : a));
    const seq = rep.sts.map(s => `${prefix}${s.stop_id}`);
    const t0 = toMins(rep.sts[0].departure_time || rep.sts[0].arrival_time);
    data.seqs[key] = seq;
    data.offsets[key] = rep.sts.map(s => toMins(s.arrival_time || s.departure_time) - t0);
    const firstStop = rep.sts[0].stop_id;
    const deps = { weekday: [], saturday: [], sunday: [] };
    for (const tr of g.trips) {
      if (tr.sts[0].stop_id !== firstStop) continue;
      deps[tr.svc].push(toMins(tr.sts[0].departure_time || tr.sts[0].arrival_time));
    }
    data.deps[key] = { weekday: uniqSorted(deps.weekday), saturday: uniqSorted(deps.saturday), sunday: uniqSorted(deps.sunday) };
    for (const s of rep.sts) {
      const st = stopById.get(s.stop_id);
      if (st) addStop(`${prefix}${s.stop_id}`, st.stop_name, parseFloat(st.stop_lat), parseFloat(st.stop_lon));
    }
  }
  return { routes, stopById };
}

async function buildMetro() {
  await loadGtfs('metro', 'MT', (r, t) => r && { lineNum: r.route_short_name || 'M1', dir: t.direction_id === '1' ? 1 : 0 });
  data.lines.M1 = { name: 'Evka 3 – Narlıdere Kaymakamlık', mode: 'metro', color: '#0038EF' };
}

const TRAM_LINES = {
  KARSIYAKA: { lineNum: 'T1', name: 'Karşıyaka Tramvayı' },
  KONAK: { lineNum: 'T2', name: 'Konak Tramvayı' },
  CIGLI_IC: { lineNum: 'T3-İç', name: 'Çiğli Tramvayı İç Hat' },
  CIGLI_DIS: { lineNum: 'T3-Dış', name: 'Çiğli Tramvayı Dış Hat' },
  TURUNCU: { lineNum: 'T1-Ring', name: 'Karşıyaka Tramvayı Ring Hat' },
};

async function buildTram() {
  const { routes } = await loadGtfs('tram', 'TR', (r, t) => {
    const m = r && TRAM_LINES[r.route_id];
    return m && { lineNum: m.lineNum, dir: t.direction_id === '1' ? 1 : 0 };
  });
  for (const r of routes) {
    const m = TRAM_LINES[r.route_id];
    if (m) data.lines[m.lineNum] = { name: m.name, mode: 'tram', color: `#${r.route_color || 'AD1457'}` };
  }
}

// İZBAN GTFS'inde route_id'ler sefer desenleriyle uyuşmuyor (ör. "Aliağa-Çiğli" rotasında Cumaovası seferleri),
// bu yüzden hatlar ana sefer desenlerinden (ilk–son istasyon) kurulur. Durak dizisi ve yolculuk süreleri GTFS'ten,
// kalkışlar API'den: /izban/sefersaatleri/{ilk}/{son} yalnızca iki istasyon arasını gerçekten giden trenleri döner.
const IZBAN_LINES = [
  { lineNum: 'İZBAN-1', from: 'Aliağa', to: 'Cumaovası' },
  { lineNum: 'İZBAN-2', from: 'Menemen', to: 'Tepeköy' },
  { lineNum: 'İZBAN-3', from: 'Tepeköy', to: 'Selçuk' },
  { lineNum: 'İZBAN-4', from: 'Alsancak', to: 'Gaziemir' },
];

async function buildIzban() {
  const [stops, stopTimes] = await Promise.all([readCsv('izban', 'stops.txt'), readCsv('izban', 'stop_times.txt')]);
  const stopById = new Map(stops.map(s => [s.stop_id, s]));
  const byTrip = new Map();
  for (const st of stopTimes) {
    if (!byTrip.has(st.trip_id)) byTrip.set(st.trip_id, []);
    byTrip.get(st.trip_id).push(st);
  }
  const tripsByEnds = new Map();
  for (const sts of byTrip.values()) {
    sts.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
    if (new Set(sts.map(s => s.stop_id)).size !== sts.length) continue;
    const k = `${stopById.get(sts[0].stop_id)?.stop_name}>${stopById.get(sts[sts.length - 1].stop_id)?.stop_name}`;
    if (!tripsByEnds.has(k)) tripsByEnds.set(k, sts);
  }
  for (const { lineNum, from, to } of IZBAN_LINES) {
    for (const [dir, a, b] of [[0, from, to], [1, to, from]]) {
      const rep = tripsByEnds.get(`${a}>${b}`);
      if (!rep) { console.warn(`  İZBAN ${a}→${b}: GTFS'te sefer deseni yok`); continue; }
      const key = `${lineNum}_${dir}`;
      const t0 = toMins(rep[0].departure_time);
      data.seqs[key] = rep.map(s => `IZ${s.stop_id}`);
      data.offsets[key] = rep.map(s => toMins(s.arrival_time) - t0);
      for (const s of rep) {
        const st = stopById.get(s.stop_id);
        addStop(`IZ${s.stop_id}`, st.stop_name, parseFloat(st.stop_lat), parseFloat(st.stop_lon));
      }
      const rows = await getJson(`${API}/izban/sefersaatleri/${rep[0].stop_id}/${rep[rep.length - 1].stop_id}`);
      const deps = Array.isArray(rows) ? uniqSorted(rows.map(x => toMins(x.HareketSaati))) : [];
      if (deps.length === 0) console.warn(`  İZBAN ${a}→${b}: API sefer döndürmedi`);
      data.deps[key] = { weekday: deps, saturday: deps, sunday: deps };
    }
    data.lines[lineNum] = { name: `İZBAN ${from} – ${to}`, mode: 'rail', color: '#00A0DF' };
  }
}

// Vapur: aktif iskele çiftlerinin her biri iki duraklı tek yönlü bir hat (aktarmasız sefer).
const FERRY_DAYS = { weekday: 1, saturday: 6, sunday: 7 };

async function buildFerry() {
  const piers = (await getJson(`${API}/izdeniz/iskeleler`)).filter(p => p.AktifMi);
  for (const p of piers) addStop(`VP${p.IskeleId}`, `${p.Adi} İskelesi`, p.Enlem, p.Boylam);
  // Önce iskele bazlı seferlerden gerçekten sefer olan çiftler çıkarılır (API rate limit'i aşmamak için).
  const byName = new Map(piers.map(p => [p.Adi, p]));
  const pairKeys = new Set();
  await pool(piers.flatMap(p => [1, 6, 7].map(gun => ({ p, gun }))), 2, async ({ p, gun }) => {
    const res = await getJson(`${API}/izdeniz/iskelesefersaatleri/${p.IskeleId}/${gun}`);
    for (const s of res?.seferler ?? []) {
      for (const v of s.VarisYerleri ?? []) {
        const b = byName.get(v.iskeleAdi);
        if (b && b.IskeleId !== p.IskeleId) pairKeys.add(`${p.IskeleId}-${b.IskeleId}`);
      }
    }
  });
  const pairs = [...pairKeys].map(k => k.split('-').map(id => piers.find(p => String(p.IskeleId) === id)));
  console.log(`  ${pairs.length} iskele çifti`);
  const tasks = pairs.flatMap(([a, b]) => Object.entries(FERRY_DAYS).map(([svc, gun]) => ({ a, b, svc, gun })));
  const results = await pool(tasks, 2, async ({ a, b, svc, gun }) => {
    const res = await getJson(`${API}/izdeniz/vapursaatleri/${a.IskeleId}/${b.IskeleId}/${gun}/0`);
    const rows = (Array.isArray(res) ? res : []).flatMap(h => h.seferSatirlari ?? []).filter(s => !s.IptalMi);
    const trips = rows.map(s => {
      const dep = s.seferSaatleri?.find(x => x.KalkisSaati)?.KalkisSaati;
      const arr = [...(s.seferSaatleri ?? [])].reverse().find(x => x.VarisSaati)?.VarisSaati;
      return dep && arr ? { dep: toMins(dep), dur: (toMins(arr) - toMins(dep) + 1440) % 1440 } : null;
    }).filter(Boolean);
    return { a, b, svc, trips };
  });
  const byPair = new Map();
  for (const r of results) {
    if (r.trips.length === 0) continue;
    const k = `${r.a.IskeleId}-${r.b.IskeleId}`;
    if (!byPair.has(k)) byPair.set(k, { a: r.a, b: r.b, deps: { weekday: [], saturday: [], sunday: [] }, durs: [] });
    const e = byPair.get(k);
    e.deps[r.svc] = uniqSorted(r.trips.map(t => t.dep));
    e.durs.push(...r.trips.map(t => t.dur).filter(d => d > 0 && d < 180));
  }
  for (const { a, b, deps, durs } of byPair.values()) {
    if (durs.length === 0) continue;
    const lineNum = `V${a.IskeleId}-${b.IskeleId}`;
    const sorted = [...durs].sort((x, y) => x - y);
    const key = `${lineNum}_0`;
    data.lines[lineNum] = { name: `${a.Adi} → ${b.Adi} Vapuru`, mode: 'ferry', color: '#0277BD' };
    data.seqs[key] = [`VP${a.IskeleId}`, `VP${b.IskeleId}`];
    data.offsets[key] = [0, sorted[Math.floor(sorted.length / 2)]];
    data.deps[key] = deps;
  }
}

async function main() {
  console.log('Metro...'); await buildMetro();
  console.log('Tramvay...'); await buildTram();
  console.log('İZBAN...'); await buildIzban();
  console.log('Vapur...'); await buildFerry();
  const json = JSON.stringify(data);
  await writeFile(OUT, json);
  const modes = {};
  for (const l of Object.values(data.lines)) modes[l.mode] = (modes[l.mode] ?? 0) + 1;
  console.log(`Bitti: ${Object.keys(data.lines).length} hat ${JSON.stringify(modes)}, ${data.stops.length} durak, ${Math.round(json.length / 1024)} KB → ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
