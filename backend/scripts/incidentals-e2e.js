/**
 * Post-trip incidentals.
 *
 * Fuel charges itself from the measured return level; cleaning/smoking/tolls are
 * host-reported. All priced from config, charged to the guest, credited to the
 * host (credit clearing / debit host payable), recorded on the booking, ledger
 * balanced. Only the host/ops may apply them.
 *
 * Run: node scripts/incidentals-e2e.js
 */
const path = require('path');
const fs = require('fs');
const API = process.env.API || 'http://127.0.0.1:8080/api/v1';
const ADMIN = { email: 'admin@cato.com', password: 'Cato@Admin2026' };

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? `  -> ${d}` : ''}`); } };
const section = (t) => console.log(`\n-- ${t} ${'-'.repeat(Math.max(0, 44 - t.length))}`);

async function call(method, p, { token, body, key } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (key) headers['Idempotency-Key'] = key;
  const res = await fetch(`${API}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, ok: res.ok, body: json };
}
const mongoUri = () => fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').match(/^MONGO_URI=(.+)$/m)[1].trim();
const RUN = 3800 + ((Math.floor(Date.now() / 1000) * 190) % 600_000);
const BASE = Date.now() + RUN * 864e5;
const day = (n) => new Date(BASE + n * 864e5).toISOString();
const photos = (n) => Array.from({ length: n }, (_, i) => ({ url: `https://cdn.example.com/t/${Date.now()}_${i}.jpg` }));

// Defaults from PlatformConfig.incidentals.
const FUEL_PER_PCT = 300, CLEANING = 7500;

(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(mongoUri());
  const db = mongoose.connection;
  console.log('\nPost-trip incidentals\n');

  const adminToken = (await call('POST', '/auth/login', { body: ADMIN })).body?.data?.tokens?.accessToken;
  const email = `inc${Date.now()}@test.com`;
  await call('POST', '/auth/register', { body: { email, password: 'Test@1234', firstName: 'Inc', lastName: 'T' } });
  const login = () => call('POST', '/auth/login', { body: { email, password: 'Test@1234' } });
  const gid = (await login()).body.data.user.id;
  await db.collection('users').updateOne({ _id: gid }, { $set: { emailVerified: true, phoneVerified: true } });
  await db.collection('kycs').updateOne({ userId: gid }, { $set: { status: 'approved', level: 'full', updatedAt: new Date() }, $setOnInsert: { _id: `kyc_${gid}`, documents: [], createdAt: new Date() } }, { upsert: true });
  const token = (await login()).body.data.tokens.accessToken;
  const car = (await call('GET', '/search/vehicles?lng=-74.006&lat=40.7128&radiusKm=100&limit=1&instantBook=true')).body.data[0];

  let bookingId;
  try {
    // Book → start (fuel 90) → return photos → complete (fuel 70) = 20% short.
    const b = await call('POST', '/bookings', { token, key: `inc${Date.now()}`, body: { vehicleId: car._id, start: day(5), end: day(7) } });
    bookingId = b.body?.data?._id;
    ok('booking created and paid', b.body?.data?.status === 'paid', String(b.body?.data?.status));
    const start = await call('POST', '/trips/start', { token, body: { bookingId, odometerStart: 1000, fuelStart: 90 } });
    const tripId = start.body?.data?._id;
    await call('POST', `/trips/${tripId}/photos`, { token, body: { phase: 'post', photos: photos(2) } });
    const done = await call('POST', `/trips/${tripId}/complete`, { token, body: { odometerEnd: 1050, fuelEnd: 70 } });
    ok('trip completes', done.ok && done.body?.data?.status === 'completed', `${done.status}`);

    section('Auto fuel shortfall');
    const bk1 = (await call('GET', `/bookings/${bookingId}`, { token })).body?.data;
    const fuelItem = (bk1.incidentals ?? []).find((i) => i.type === 'fuel');
    ok('a fuel charge is auto-applied for the 20% shortfall', fuelItem && fuelItem.amount === 20 * FUEL_PER_PCT, `${JSON.stringify(fuelItem)} vs ${20 * FUEL_PER_PCT}`);

    section('Host-reported incidentals');
    const guestTry = await call('POST', `/bookings/${bookingId}/incidentals`, { token, body: { items: [{ type: 'cleaning' }] } });
    ok('a guest cannot apply incidentals to themselves', guestTry.status === 403, String(guestTry.status));

    const applied = await call('POST', `/bookings/${bookingId}/incidentals`, { token: adminToken, body: { items: [{ type: 'cleaning' }, { type: 'toll', amount: 1500, note: 'FastTrak' }] } });
    ok('ops applies cleaning + a toll', applied.ok && applied.body?.data?.total === CLEANING + 1500, `${applied.status} ${JSON.stringify(applied.body?.data ?? applied.body?.error)}`);

    const bk2 = (await call('GET', `/bookings/${bookingId}`, { token })).body?.data;
    ok('all incidentals are recorded on the booking', (bk2.incidentals ?? []).length === 3, `count=${(bk2.incidentals ?? []).length}`);

    const empty = await call('POST', `/bookings/${bookingId}/incidentals`, { token: adminToken, body: { items: [{ type: 'toll', amount: 0 }] } });
    ok('a zero charge is rejected', empty.status >= 400, String(empty.status));

    section('Ledger integrity');
    const rows = await db.collection('ledgerentries').aggregate([{ $group: { _id: '$direction', t: { $sum: '$amount' } } }]).toArray();
    const credit = (rows.find((x) => x._id === 'credit') || { t: 0 }).t;
    const debit = (rows.find((x) => x._id === 'debit') || { t: 0 }).t;
    ok('ledger globally balanced', credit === debit, `${credit} vs ${debit}`);
  } finally {
    if (bookingId) await db.collection('availabilities').deleteMany({ bookingId });
  }

  console.log('\n' + '='.repeat(46));
  console.log(`  PASS ${pass}   FAIL ${fail}`);
  console.log('='.repeat(46) + '\n');
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})();
