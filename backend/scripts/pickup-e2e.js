/**
 * Pickup verification — a 6-digit handover handshake proving the guest is
 * physically present. The guest holds the code; the host (or ops) verifies it.
 *
 * Run: node scripts/pickup-e2e.js
 */
const path = require('path');
const fs = require('fs');
const API = process.env.API || 'http://127.0.0.1:8080/api/v1';
const ADMIN = { email: 'admin@cato.com', password: 'Cato@Admin2026' };

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
const RUN = 5200 + ((Math.floor(Date.now() / 1000) * 250) % 300_000);
const BASE = Date.now() + RUN * 864e5;
const day = (n) => new Date(BASE + n * 864e5).toISOString();

(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(mongoUri());
  const db = mongoose.connection;
  console.log('\nPickup verification\n');

  const adminToken = (await call('POST', '/auth/login', { body: ADMIN })).body?.data?.tokens?.accessToken;
  const mk = async (prefix) => {
    const email = `${prefix}${Date.now()}${Math.floor(Math.random() * 1e4)}@test.com`;
    await call('POST', '/auth/register', { body: { email, password: 'Test@1234', firstName: prefix, lastName: 'T' } });
    const login = () => call('POST', '/auth/login', { body: { email, password: 'Test@1234' } });
    const id = (await login()).body.data.user.id;
    await db.collection('users').updateOne({ _id: id }, { $set: { emailVerified: true, phoneVerified: true } });
    await db.collection('kycs').updateOne({ userId: id }, { $set: { status: 'approved', level: 'full', updatedAt: new Date() }, $setOnInsert: { _id: `kyc_${id}`, documents: [], createdAt: new Date() } }, { upsert: true });
    return { id, token: (await login()).body.data.tokens.accessToken };
  };
  const guest = await mk('pk');
  const stranger = await mk('pks');
  const car = (await call('GET', '/search/vehicles?lng=-74.006&lat=40.7128&radiusKm=100&limit=1&instantBook=true')).body.data[0];

  let bookingId;
  try {
    const b = await call('POST', '/bookings', { token: guest.token, key: `pk${Date.now()}`, body: { vehicleId: car._id, start: day(5), end: day(7) } });
    bookingId = b.body?.data?._id;
    const start = await call('POST', '/trips/start', { token: guest.token, body: { bookingId, odometerStart: 1000, fuelStart: 90 } });
    const tripId = start.body?.data?._id;

    const notYours = await call('POST', `/bookings/${bookingId}/pickup-code`, { token: stranger.token });
    ok('only the guest can fetch the pickup code', notYours.status === 403, String(notYours.status));

    const codeRes = await call('POST', `/bookings/${bookingId}/pickup-code`, { token: guest.token });
    const code = codeRes.body?.data?.code;
    ok('guest gets a 6-digit pickup code', /^\d{6}$/.test(code || ''), String(code));

    const bad = await call('POST', `/trips/${tripId}/verify-pickup`, { token: adminToken, body: { code: code === '000000' ? '111111' : '000000' } });
    ok('a wrong code is rejected', bad.status === 409 && bad.body?.error?.code === 'PICKUP_CODE_INVALID', `${bad.status} ${JSON.stringify(bad.body?.error)}`);

    const good = await call('POST', `/trips/${tripId}/verify-pickup`, { token: adminToken, body: { code } });
    ok('the correct code verifies pickup', good.ok && good.body?.data?.pickupVerified === true, `${good.status} ${JSON.stringify(good.body?.error ?? '')}`);

    // Rotating the code invalidates the old one.
    const rotated = (await call('POST', `/bookings/${bookingId}/pickup-code`, { token: guest.token })).body?.data?.code;
    const stale = await call('POST', `/trips/${tripId}/verify-pickup`, { token: adminToken, body: { code } });
    ok('re-issuing rotates the code (old one no longer verifies)', rotated !== code && stale.status === 409, `rotated=${rotated} old=${code} ${stale.status}`);
  } finally {
    if (bookingId) await db.collection('availabilities').deleteMany({ bookingId });
  }

  console.log('\n' + '='.repeat(46));
  console.log(`  PASS ${pass}   FAIL ${fail}`);
  console.log('='.repeat(46) + '\n');
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})();
