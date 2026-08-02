/**
 * Reputation-scaled deposit.
 *
 * The security deposit now reads the guest's trust tier: an unproven guest
 * carries the full band, a Silver guest 50%, a Gold guest none at all. Proves
 * the trust engine is load-bearing, not decorative — the exact business rule
 * that rewards proven guests without lowering exposure on risky ones.
 *
 * Run: node scripts/deposit-trust-e2e.js
 */
const path = require('path');
const fs = require('fs');
const API = process.env.API || 'http://127.0.0.1:8080/api/v1';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? `  -> ${d}` : ''}`); } };

async function call(method, p, { token, body, key } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (key) headers['Idempotency-Key'] = key;
  const res = await fetch(`${API}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, ok: res.ok, body: json };
}
const mongoUri = () => fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').match(/^MONGO_URI=(.+)$/m)[1].trim();

const RUN = 2000 + ((Math.floor(Date.now() / 1000) * 130) % 900_000);
const BASE = Date.now() + RUN * 864e5;
const day = (n) => new Date(BASE + n * 864e5).toISOString();

async function verifiedGuest(db, prefix) {
  const email = `${prefix}${Date.now()}${Math.floor(Math.random() * 1e4)}@test.com`;
  await call('POST', '/auth/register', { body: { email, password: 'Test@1234', firstName: prefix, lastName: 'T' } });
  const login = () => call('POST', '/auth/login', { body: { email, password: 'Test@1234' } });
  const id = (await login()).body.data.user.id;
  await db.collection('users').updateOne({ _id: id }, { $set: { emailVerified: true, phoneVerified: true } });
  await db.collection('kycs').updateOne({ userId: id }, { $set: { status: 'approved', level: 'full', updatedAt: new Date() }, $setOnInsert: { _id: `kyc_${id}`, documents: [], createdAt: new Date() } }, { upsert: true });
  return { id, token: (await login()).body.data.tokens.accessToken };
}

// Depost held for a booking after the trip starts (authorised at handover).
async function depositAfterStart(db, guest, carId, off) {
  const b = await call('POST', '/bookings', { token: guest.token, key: `dt${Date.now()}${Math.random()}`, body: { vehicleId: carId, start: day(off), end: day(off + 2) } });
  const bookingId = b.body?.data?._id;
  if (!bookingId) return { err: `${b.status} ${JSON.stringify(b.body?.error ?? '')}`, bookingId: null };
  const start = await call('POST', '/trips/start', { token: guest.token, body: { bookingId } });
  if (!start.ok) return { err: `start ${start.status} ${JSON.stringify(start.body?.error ?? '')}`, bookingId };
  const dep = await call('GET', `/payments/deposits/${bookingId}`, { token: guest.token });
  const a = dep.body?.data?.amount;
  return { held: dep.body?.data?.held, amount: (a && typeof a === 'object' ? a.amount : a) ?? 0, bookingId };
}

(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(mongoUri());
  const db = mongoose.connection;
  console.log('\nReputation-scaled deposit\n');

  const pub = (await call('GET', '/platform/config')).body?.data?.deposit;
  const car = (await call('GET', '/search/vehicles?lng=-74.006&lat=40.7128&radiusKm=100&limit=1&instantBook=true')).body.data[0];
  const daily = car.pricing.dailyPrice;
  const base = Math.min(Math.max(Math.round((daily * pub.multiplierBps) / 10000), pub.minCents), pub.maxCents);
  console.log(`  daily=${daily} base deposit=${base} (min ${pub.minCents}/max ${pub.maxCents}/×${pub.multiplierBps}bps)\n`);

  const cleanup = [];
  try {
    // ── New/bronze guest → full deposit ────────────────────────────────
    const bronze = await verifiedGuest(db, 'dep_bronze');
    const perksB = (await call('GET', '/trust/me', { token: bronze.token })).body?.data;
    const rB = await depositAfterStart(db, bronze, car._id, 10); cleanup.push(rB.bookingId);
    ok('unproven guest holds the full deposit', rB.held === true && rB.amount === base, `held=${rB.held} amount=${rB.amount} vs ${base} (${rB.err ?? ''})`);

    // ── Silver guest (2 five-star reviews) → 50% deposit ───────────────
    const silver = await verifiedGuest(db, 'dep_silver');
    await db.collection('reviews').insertMany([1, 2].map((i) => ({ _id: `rev_${silver.id}_${i}`, subjectId: silver.id, rating: 5, status: 'published', direction: 'host_to_guest', bookingId: `revbk_${silver.id}_${i}`, authorId: 'seed', createdAt: new Date() })));
    const perksS = (await call('GET', '/trust/me', { token: silver.token })).body?.data;
    const rS = await depositAfterStart(db, silver, car._id, 40); cleanup.push(rS.bookingId);
    ok('Silver guest holds half the deposit', rS.held === true && rS.amount === Math.round(base * 0.5), `tier=${perksS?.tier} amount=${rS.amount} vs ${Math.round(base * 0.5)} (${rS.err ?? ''})`);

    // ── Gold guest (verified + trips + reviews) → deposit waived ────────
    const gold = await verifiedGuest(db, 'dep_gold');
    await db.collection('bookings').insertMany(Array.from({ length: 30 }, (_, i) => ({ _id: `seed_${gold.id}_${i}`, code: `seed_${gold.id}_${i}`, guestId: gold.id, status: 'completed', createdAt: new Date() })));
    await db.collection('reviews').insertMany([1, 2].map((i) => ({ _id: `revg_${gold.id}_${i}`, subjectId: gold.id, rating: 5, status: 'published', direction: 'host_to_guest', bookingId: `revbkg_${gold.id}_${i}`, authorId: 'seed', createdAt: new Date() })));
    const perksG = (await call('GET', '/trust/me', { token: gold.token })).body?.data;
    const rG = await depositAfterStart(db, gold, car._id, 70); cleanup.push(rG.bookingId);
    ok('Gold guest deposit is waived (nothing held)', rG.held === false, `tier=${perksG?.tier} held=${rG.held} amount=${rG.amount} (${rG.err ?? ''})`);

    console.log(`\n  tiers observed: bronze=${perksB?.tier} silver=${perksS?.tier} gold=${perksG?.tier}`);
  } finally {
    for (const id of cleanup) if (id) await db.collection('availabilities').deleteMany({ bookingId: id });
    await db.collection('bookings').deleteMany({ _id: /^seed_/ });
    await db.collection('reviews').deleteMany({ authorId: 'seed' });
  }

  console.log('\n' + '='.repeat(48));
  console.log(`  PASS ${pass}   FAIL ${fail}`);
  console.log('='.repeat(48) + '\n');
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})();
