const fs = require('fs');
const path = require('path');
const readline = require('readline');

const GTFS = path.join(__dirname, '../assets/gtfs/bus-eshot-gtfs');
const OUT = path.join(__dirname, '../src/data/schedules.json');

async function readCsv(file) {
  const rows = [];
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let headers = null;
  for await (const line of rl) {
    if (!headers) { headers = line.split(','); continue; }
    const vals = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = (vals[i] ?? '').trim(); });
    rows.push(obj);
  }
  return rows;
}

async function main() {
  console.log('Reading routes...');
  const routes = await readCsv(path.join(GTFS, 'routes.txt'));
  const routeMap = new Map(); // route_id -> short_name
  for (const r of routes) routeMap.set(r.route_id, r.route_short_name);

  console.log('Reading calendar...');
  const calendar = await readCsv(path.join(GTFS, 'calendar.txt'));
  const weekdayServices = new Set(calendar.filter(c => c.monday === '1').map(c => c.service_id));
  const saturdayServices = new Set(calendar.filter(c => c.saturday === '1').map(c => c.service_id));
  const sundayServices = new Set(calendar.filter(c => c.sunday === '1').map(c => c.service_id));

  console.log('Reading trips...');
  const trips = await readCsv(path.join(GTFS, 'trips.txt'));
  // trip_id -> { routeShortName, dir, serviceType }
  const tripMeta = new Map();
  for (const t of trips) {
    const shortName = routeMap.get(t.route_id);
    if (!shortName) continue;
    let serviceType = 'weekday';
    if (saturdayServices.has(t.service_id)) serviceType = 'saturday';
    else if (sundayServices.has(t.service_id)) serviceType = 'sunday';
    else if (!weekdayServices.has(t.service_id)) continue; // skip unknown
    tripMeta.set(t.trip_id, { routeShortName: shortName, dir: t.direction_id, serviceType });
  }

  // schedule[lineNumber][serviceType][dir] = Set of departure times
  const schedule = {};

  console.log('Reading stop_times (2.2M lines, please wait)...');
  const stFile = path.join(GTFS, 'stop_times.txt');
  const rl = readline.createInterface({ input: fs.createReadStream(stFile), crlfDelay: Infinity });
  let firstLine = true;
  let count = 0;

  for await (const line of rl) {
    if (firstLine) { firstLine = false; continue; }
    const idx1 = line.indexOf(',');
    const idx2 = line.indexOf(',', idx1 + 1);
    const idx3 = line.indexOf(',', idx2 + 1);
    const idx5 = line.lastIndexOf(',');
    const idx4 = line.lastIndexOf(',', idx5 - 1);

    const trip_id = line.slice(0, idx1);
    const departure_time = line.slice(idx2 + 1, idx3);
    const stop_sequence = parseInt(line.slice(idx4 + 1, idx5));

    if (stop_sequence !== 1) continue;

    const meta = tripMeta.get(trip_id);
    if (!meta) continue;

    const { routeShortName, dir, serviceType } = meta;
    if (!schedule[routeShortName]) schedule[routeShortName] = {};
    if (!schedule[routeShortName][serviceType]) schedule[routeShortName][serviceType] = {};
    if (!schedule[routeShortName][serviceType][dir]) schedule[routeShortName][serviceType][dir] = new Set();

    // normalize times past midnight (e.g. 25:00) to valid display
    const parts = departure_time.split(':');
    const h = parseInt(parts[0]) % 24;
    const normalized = `${String(h).padStart(2,'0')}:${parts[1]}`;
    schedule[routeShortName][serviceType][dir].add(normalized);

    count++;
    if (count % 100000 === 0) process.stdout.write(`  ${count} departures...\r`);
  }

  console.log(`\nProcessed ${count} first-stop departures.`);

  // Convert Sets to sorted arrays
  const out = {};
  for (const [line, byService] of Object.entries(schedule)) {
    out[line] = {};
    for (const [svc, byDir] of Object.entries(byService)) {
      out[line][svc] = {};
      for (const [dir, times] of Object.entries(byDir)) {
        out[line][svc][dir] = [...times].sort();
      }
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(out));
  const kb = Math.round(fs.statSync(OUT).size / 1024);
  console.log(`Done! ${OUT} (${kb} KB, ${Object.keys(out).length} lines)`);
}

main().catch(console.error);
