/**
 * Rebooking protection — when a host cancels, the stranded guest gets similar
 * cars free for their exact dates and rebooks in one tap.
 *
 * Run: node scripts/rebooking-e2e.js
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
const RUN = 4200 + ((Math.floor(Date.now() / 1000) * 210) % 500_000);
const BASE = Date.now() + RUN * 864e5;
const day = (n) => new Date(BASE + n * 864e5).toISOString();

(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(mongoUri());
  const db = mongoose.connection;
  console.log('\nRebooking protection\n');

  const email = `rbk${Date.now()}@test.com`;
  await call('POST', '/auth/register', { body: { email, password: 'Test@1234', firstName: 'Rbk', lastName: 'T' } });
  const login = () => call('POST', '/auth/login', { body: { email, password: 'Test@1234' } });
  const gid = (await login()).body.data.user.id;
  await db.collection('users').updateOne({ _id: gid }, { $set: { emailVerified: true, phoneVerified: true } });
  await db.collection('kycs').updateOne({ userId: gid }, { $set: { status: 'approved', level: 'full', updatedAt: new Date() }, $setOnInsert: { _id: `kyc_${gid}`, documents: [], createdAt: new Date() } }, { upsert: true });
  const token = (await login()).body.data.tokens.accessToken;
  const car = (await call('GET', '/search/vehicles?lng=-74.006&lat=40.7128&radiusKm=100&limit=1&instantBook=true')).body.data[0];

  const ids = [];
  try {
    const b = await call('POST', '/bookings', { token, key: `rbk${Date.now()}`, body: { vehicleId: car._id, start: day(5), end: day(7) } });
    const bookingId = b.body?.data?._id;
    ids.push(bookingId);
    ok('original booking created', b.body?.data?.status === 'paid');

    // Not rebookable while still active.
    const tooSoon = await call('POST', `/bookings/${bookingId}/rebook`, { token, body: { vehicleId: 'x' } });
    ok('cannot rebook an active booking', tooSoon.status >= 400 && tooSoon.body?.error?.code === 'NOT_REBOOKABLE', `${tooSoon.status} ${JSON.stringify(tooSoon.body?.error)}`);

    // Simulate a host cancellation: status → cancelled_host, dates freed.
    await db.collection('bookings').updateOne({ _id: bookingId }, { $set: { status: 'cancelled_host' } });
    await db.collection('availabilities').deleteMany({ bookingId });

    const opts = await call('GET', `/bookings/${bookingId}/rebooking-options`, { token });
    const alts = opts.body?.data ?? [];
    ok('similar free cars are offered', opts.ok && alts.length >= 1, `${opts.status} count=${alts.length}`);
    ok('the offer excludes the original car', !alts.some((v) => v._id === car._id));

    const target = alts[0];
    const rb = await call('POST', `/bookings/${bookingId}/rebook`, { token, body: { vehicleId: target._id } });
    ids.push(rb.body?.data?._id);
    ok('one-tap rebook creates a paid booking on the alternative', rb.body?.data?.status === 'paid' && rb.body?.data?.vehicleId === target._id, `${rb.status} ${JSON.stringify(rb.body?.error ?? '')}`);
    ok('rebooked trip keeps the original dates', rb.body?.data?.period?.start?.slice(0, 10) === day(5).slice(0, 10), rb.body?.data?.period?.start);

    const sameCar = await call('POST', `/bookings/${bookingId}/rebook`, { token, body: { vehicleId: car._id } });
    ok('cannot rebook onto the same car', sameCar.status >= 400, String(sameCar.status));
  } finally {
    for (const id of ids) if (id) await db.collection('availabilities').deleteMany({ bookingId: id });
  }

  console.log('\n' + '='.repeat(46));
  console.log(`  PASS ${pass}   FAIL ${fail}`);
  console.log('='.repeat(46) + '\n');
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})();
