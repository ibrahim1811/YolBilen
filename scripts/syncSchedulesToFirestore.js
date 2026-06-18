/**
 * ESHOT Sefer Saatleri → Firestore Sync
 *
 * Kullanım:
 *   SERVICE_ACCOUNT=./serviceAccount.json node scripts/syncSchedulesToFirestore.js
 *
 * serviceAccount.json nasıl alınır:
 *   Firebase Console → Proje Ayarları → Hizmet Hesapları → "Yeni özel anahtar oluştur"
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const fetch = require('node-fetch');
const path = require('path');

const RESOURCE_ID = 'c6fa6046-f755-47d7-b69e-db6bb06a8b5a';
const API_BASE = 'https://acikveri.bizizmir.com/tr/api/3/action/datastore_search';
const PAGE_SIZE = 5000;
const TARIFE = { 1: 'weekday', 2: 'saturday', 3: 'sunday' };

// Firebase Admin init
const saPath = process.env.SERVICE_ACCOUNT || path.join(__dirname, '../serviceAccount.json');
const sa = require(saPath);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

async function fetchPage(offset) {
  const url = `${API_BASE}?resource_id=${RESOURCE_ID}&limit=${PAGE_SIZE}&offset=${offset}`;
  const res = await fetch(url);
  const json = await res.json();
  if (!json.success) throw new Error('API error: ' + JSON.stringify(json.error));
  return json.result;
}

async function main() {
  console.log('Fetching total count...');
  const first = await fetchPage(0);
  const total = first.total;
  console.log(`Total records: ${total}`);

  // hat → tarife → { gidis: Set, donus: Set }
  const schedule = {};

  function addRecord(r) {
    const hat = String(r.HAT_NO);
    const svc = TARIFE[r.TARIFE_ID] ?? 'weekday';
    if (!schedule[hat]) schedule[hat] = {};
    if (!schedule[hat][svc]) schedule[hat][svc] = { gidis: new Set(), donus: new Set() };
    if (r.GIDIS_SAATI) schedule[hat][svc].gidis.add(r.GIDIS_SAATI);
    if (r.DONUS_SAATI) schedule[hat][svc].donus.add(r.DONUS_SAATI);
  }

  // First page already fetched
  first.records.forEach(addRecord);

  // Remaining pages
  const pages = Math.ceil((total - PAGE_SIZE) / PAGE_SIZE);
  for (let i = 1; i <= pages; i++) {
    process.stdout.write(`  Fetching page ${i}/${pages}...\r`);
    const page = await fetchPage(i * PAGE_SIZE);
    page.records.forEach(addRecord);
  }
  console.log('\nAll pages fetched.');

  // Build final docs
  const lines = Object.keys(schedule);
  console.log(`Writing ${lines.length} lines to Firestore...`);

  const now = FieldValue.serverTimestamp();

  // Batch write (500 ops max per batch)
  const BATCH_SIZE = 400;
  for (let i = 0; i < lines.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = lines.slice(i, i + BATCH_SIZE);

    for (const hat of chunk) {
      const data = { updatedAt: now };
      for (const [svc, dirs] of Object.entries(schedule[hat])) {
        data[svc] = {
          gidis: [...dirs.gidis].sort(),
          donus: [...dirs.donus].sort(),
        };
      }
      batch.set(db.collection('schedules').doc(hat), data);
    }

    await batch.commit();
    console.log(`  Committed ${Math.min(i + BATCH_SIZE, lines.length)}/${lines.length}`);
  }

  // Meta doc
  await db.collection('meta').doc('scheduleSync').set({
    lastUpdated: now,
    totalLines: lines.length,
    totalRecords: total,
    source: 'acikveri.bizizmir.com',
  });

  console.log('Done! Firestore sync complete.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
