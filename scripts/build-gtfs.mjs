import { createReadStream } from 'fs';
import { writeFile, mkdir } from 'fs/promises';
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
    const trimmed = line.replace(/\r/g, '');
    if (!headers) { headers = trimmed.split(',').map(h => h.trim()); continue; }
    const vals = trimmed.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim(); });
    rows.push(obj);
  }
  return rows;
}

function douglasPeucker(pts, eps) {
  if (pts.length <= 2) return pts;
  const [lat1, lon1] = pts[0], [lat2, lon2] = pts[pts.length - 1];
  const dx = lat2 - lat1, dy = lon2 - lon1, len = Math.sqrt(dx * dx + dy * dy);
  let maxDist = 0, maxIdx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [lat, lon] = pts[i];
    const dist = len === 0
      ? Math.sqrt((lat - lat1) ** 2 + (lon - lon1) ** 2)
      : Math.abs(dy * lat - dx * lon + lat2 * lon1 - lon2 * lat1) / len;
    if (dist > maxDist) { maxDist = dist; maxIdx = i; }
  }
  if (maxDist > eps) {
    const l = douglasPeucker(pts.slice(0, maxIdx + 1), eps);
    const r = douglasPeucker(pts.slice(maxIdx), eps);
    return [...l.slice(0, -1), ...r];
  }
  return [pts[0], pts[pts.length - 1]];
}

async function main() {
  await mkdir(OUT, { recursive: true });
  console.log('Reading routes, trips...');

  const [routesRaw, tripsRaw] = await Promise.all([
    readCsv('routes.txt'),
    readCsv('trips.txt'),
  ]);

  const routeMap = new Map();
  for (const r of routesRaw) {
    routeMap.set(r.route_id, { lineNum: r.route_short_name, name: r.route_long_name });
  }

  const routeMeta = {};
  for (const { lineNum, name } of routeMap.values()) {
    if (lineNum) routeMeta[lineNum] = { name };
  }

  const tripMeta = new Map();
  for (const t of tripsRaw) {
    const meta = routeMap.get(t.route_id);
    if (!meta || !meta.lineNum) continue;
    tripMeta.set(t.trip_id, {
      lineNum: meta.lineNum,
      dir: t.direction_id === '1' ? 1 : 0,
      shapeId: t.shape_id,
    });
  }

  const lineDirs = new Map();
  for (const { lineNum, dir } of tripMeta.values()) {
    if (!lineDirs.has(lineNum)) lineDirs.set(lineNum, new Set());
    lineDirs.get(lineNum).add(dir);
  }
  const ringRoutes = [...lineDirs.entries()]
    .filter(([, dirs]) => dirs.size === 1 && dirs.has(0))
    .map(([ln]) => ln);

  const repTrip = new Map();
  for (const [tripId, { lineNum, dir }] of tripMeta) {
    const key = `${lineNum}_${dir}`;
    if (!repTrip.has(key)) repTrip.set(key, tripId);
  }
  const wantedTrips = new Set(repTrip.values());

  const shapeToKey = new Map();
  for (const [key, tripId] of repTrip) {
    const info = tripMeta.get(tripId);
    if (info?.shapeId) shapeToKey.set(info.shapeId, key);
  }

  console.log('Reading stop_times.txt (2.2M rows)...');
  const tripStops = new Map();
  {
    const rl = createInterface({ input: createReadStream(join(GTFS, 'stop_times.txt')), crlfDelay: Infinity });
    let isHeader = true;
    for await (const line of rl) {
      if (isHeader) { isHeader = false; continue; }
      const parts = line.replace(/\r/g, '').split(',');
      const tripId = parts[0];
      if (!wantedTrips.has(tripId)) continue;
      const stopId = parts[3];
      const seq = parseInt(parts[4], 10);
      if (!tripStops.has(tripId)) tripStops.set(tripId, []);
      tripStops.get(tripId).push({ stopId, seq });
    }
  }

  const routeStopSeqs = {};
  const stopRouteDirs = {};
  for (const [key, tripId] of repTrip) {
    const [lineNum, dirStr] = key.split('_');
    const dir = parseInt(dirStr, 10);
    const stops = (tripStops.get(tripId) ?? []).sort((a, b) => a.seq - b.seq);
    routeStopSeqs[key] = stops.map(s => s.stopId);
    for (const { stopId } of stops) {
      if (!stopRouteDirs[stopId]) stopRouteDirs[stopId] = [];
      if (!stopRouteDirs[stopId].some(e => e.lineNum === lineNum && e.dir === dir)) {
        stopRouteDirs[stopId].push({ lineNum, dir });
      }
    }
  }

  console.log('Reading stops.txt...');
  const stopsRaw = await readCsv('stops.txt');
  const stops = stopsRaw.map(s => ({
    id: s.stop_id,
    name: s.stop_name,
    lat: parseFloat(s.stop_lat),
    lon: parseFloat(s.stop_lon),
  }));

  console.log('Reading shapes.txt...');
  const shapePoints = new Map();
  {
    const rl = createInterface({ input: createReadStream(join(GTFS, 'shapes.txt')), crlfDelay: Infinity });
    let isHeader = true;
    for await (const line of rl) {
      if (isHeader) { isHeader = false; continue; }
      const parts = line.replace(/\r/g, '').split(',');
      const shapeId = parts[0];
      if (!shapeToKey.has(shapeId)) continue;
      const lat = parseFloat(parts[1]);
      const lon = parseFloat(parts[2]);
      const seq = parseInt(parts[3], 10);
      if (!shapePoints.has(shapeId)) shapePoints.set(shapeId, []);
      shapePoints.get(shapeId).push([lat, lon, seq]);
    }
  }

  const shapes = {};
  for (const [shapeId, pts] of shapePoints) {
    const key = shapeToKey.get(shapeId);
    if (!key) continue;
    pts.sort((a, b) => a[2] - b[2]);
    const raw = pts.map(([lat, lon]) => [lat, lon]);
    const simplified = douglasPeucker(raw, 0.0001);
    shapes[key] = simplified.map(([lat, lon]) => [
      Math.round(lat * 10000) / 10000,
      Math.round(lon * 10000) / 10000,
    ]);
  }

  console.log('Writing output files...');
  await Promise.all([
    writeFile(join(OUT, 'stops.json'), JSON.stringify(stops)),
    writeFile(join(OUT, 'stop-route-dirs.json'), JSON.stringify(stopRouteDirs)),
    writeFile(join(OUT, 'route-stop-seqs.json'), JSON.stringify(routeStopSeqs)),
    writeFile(join(OUT, 'ring-routes.json'), JSON.stringify(ringRoutes)),
    writeFile(join(OUT, 'shapes.json'), JSON.stringify(shapes)),
    writeFile(join(OUT, 'route-meta.json'), JSON.stringify(routeMeta)),
  ]);

  console.log(`Done.`);
  console.log(`  Stops: ${stops.length}`);
  console.log(`  Route+dir sequences: ${Object.keys(routeStopSeqs).length}`);
  console.log(`  Ring routes: ${ringRoutes.join(', ')}`);
  console.log(`  Shapes: ${Object.keys(shapes).length}`);
}

main().catch(console.error);
