const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CSV = 'C:/Users/Kayra/Downloads/eshot-otobus-hareketsaatleri.csv';
const OUT = path.join(__dirname, '../src/data/schedules.json');

const TARIFE = { '1': 'weekday', '2': 'saturday', '3': 'sunday' };

async function main() {
  const schedule = {};

  const rl = readline.createInterface({ input: fs.createReadStream(CSV), crlfDelay: Infinity });
  let first = true;

  for await (const line of rl) {
    if (first) { first = false; continue; }
    const cols = line.split(';');
    const hat = cols[0]?.trim();
    const tarife = cols[1]?.trim();
    const gidis = cols[2]?.trim();
    const donus = cols[3]?.trim();
    if (!hat || !tarife || !gidis || !donus) continue;

    const svc = TARIFE[tarife] ?? 'weekday';

    if (!schedule[hat]) schedule[hat] = {};
    if (!schedule[hat][svc]) schedule[hat][svc] = { '0': new Set(), '1': new Set() };

    if (gidis) schedule[hat][svc]['0'].add(gidis);
    if (donus) schedule[hat][svc]['1'].add(donus);
  }

  // Convert Sets → sorted arrays
  const out = {};
  for (const [hat, bySvc] of Object.entries(schedule)) {
    out[hat] = {};
    for (const [svc, dirs] of Object.entries(bySvc)) {
      out[hat][svc] = {
        '0': [...dirs['0']].sort(),
        '1': [...dirs['1']].sort(),
      };
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(out));
  const kb = Math.round(fs.statSync(OUT).size / 1024);
  console.log(`Done: ${Object.keys(out).length} lines, ${kb} KB → ${OUT}`);
}

main().catch(console.error);
