/**
 * Emergency incident — a structured emergency pauses the trip so no charge
 * lands mid-crisis, and the trip cannot complete until it is resolved.
 *
 * Run: node scripts/emergency-e2e.js
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
const RUN = 4700 + ((Math.floor(Date.now() / 1000) * 230) % 400_000);
const BASE = Date.now() + RUN * 864e5;
const day = (n) => new Date(BASE + n * 864e5).toISOString();
const photos = (n) => Array.from({ length: n }, (_, i) => ({ url: `https://cdn.example.com/e/${Date.now()}_${i}.jpg` }));

(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(mongoUri());
  const db = mongoose.connection;
  console.log('\nEmergency incident\n');

  const mk = async (prefix) => {
    const email = `${prefix}${Date.now()}${Math.floor(Math.random() * 1e4)}@test.com`;
    await call('POST', '/auth/register', { body: { email, password: 'Test@1234', firstName: prefix, lastName: 'T' } });
    const login = () => call('POST', '/auth/login', { body: { email, password: 'Test@1234' } });
    const id = (await login()).body.data.user.id;
    await db.collection('users').updateOne({ _id: id }, { $set: { emailVerified: true, phoneVerified: true } });
    await db.collection('kycs').updateOne({ userId: id }, { $set: { status: 'approved', level: 'full', updatedAt: new Date() }, $setOnInsert: { _id: `kyc_${id}`, documents: [], createdAt: new Date() } }, { upsert: true });
    return { id, token: (await login()).body.data.tokens.accessToken };
  };
  const guest = await mk('emg');
  const stranger = await mk('str');
  const car = (await call('GET', '/search/vehicles?lng=-74.006&lat=40.7128&radiusKm=100&limit=1&instantBook=true')).body.data[0];

  let bookingId;
  try {
    const b = await call('POST', '/bookings', { token: guest.token, key: `emg${Date.now()}`, body: { vehicleId: car._id, start: day(5), end: day(7) } });
    bookingId = b.body?.data?._id;
    const start = await call('POST', '/trips/start', { token: guest.token, body: { bookingId, odometerStart: 1000, fuelStart: 90 } });
    const tripId = start.body?.data?._id;
    await call('POST', `/trips/${tripId}/photos`, { token: guest.token, body: { phase: 'post', photos: photos(2) } });

    const strangerRaise = await call('POST', `/trips/${tripId}/incident`, { token: stranger.token, body: { type: 'breakdown' } });
    ok('a non-participant cannot raise an incident', strangerRaise.status === 403, String(strangerRaise.status));

    const raise = await call('POST', `/trips/${tripId}/incident`, { token: guest.token, body: { type: 'breakdown', note: 'Flat tyre on the highway' } });
    ok('incident raised and trip paused', raise.ok && raise.body?.data?.pausedForIncident === true && (raise.body?.data?.incidents ?? []).some((i) => i.status === 'open'), `${raise.status} ${JSON.stringify(raise.body?.error ?? '')}`);

    const blocked = await call('POST', `/trips/${tripId}/complete`, { token: guest.token, body: { odometerEnd: 1050, fuelEnd: 90 } });
    ok('trip cannot complete while an incident is open', blocked.status === 409 && blocked.body?.error?.code === 'INCIDENT_OPEN', `${blocked.status} ${JSON.stringify(blocked.body?.error)}`);

    const resolve = await call('POST', `/trips/${tripId}/incident/resolve`, { token: guest.token, body: { note: 'Roadside changed the tyre' } });
    ok('incident resolved and trip un-paused', resolve.ok && resolve.body?.data?.pausedForIncident === false, `${resolve.status}`);

    const done = await call('POST', `/trips/${tripId}/complete`, { token: guest.token, body: { odometerEnd: 1050, fuelEnd: 90 } });
    ok('trip completes after the incident is resolved', done.ok && done.body?.data?.status === 'completed', `${done.status} ${JSON.stringify(done.body?.error ?? '')}`);
  } finally {
    if (bookingId) await db.collection('availabilities').deleteMany({ bookingId });
  }

  console.log('\n' + '='.repeat(46));
  console.log(`  PASS ${pass}   FAIL ${fail}`);
  console.log('='.repeat(46) + '\n');
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})();
