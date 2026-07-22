/**
 * Risk engine, trust score and account lifecycle.
 *
 * There was no risk engine at all: no device signal, no velocity rule, no
 * duplicate-identity check. A marketplace with Instant Book is a mechanical
 * target for stolen-card testing without one.
 *
 * What matters here is that signals CLUSTER rather than fire individually —
 * every signal has an innocent explanation on its own (a traveller on a VPN, a
 * family sharing a tablet), so a single one must never block a real customer.
 *
 * Run: node scripts/risk-e2e.js
 */
const path = require('path');
const fs = require('fs');

const API = process.env.API || 'http://127.0.0.1:8080/api/v1';
const ADMIN = { email: 'admin@cato.com', password: 'Cato@Admin2026' };

let pass = 0;
let fail = 0;
const ok = (n, c, d = '') => {
  if (c) {
    pass += 1;
    console.log(`  [PASS] ${n}`);
  } else {
    fail += 1;
    console.log(`  [FAIL] ${n}${d ? `  -> ${d}` : ''}`);
  }
};
const section = (t) => console.log(`\n-- ${t} ${'-'.repeat(Math.max(0, 52 - t.length))}`);

async function call(method, p, { token, body, key, device } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (key) headers['Idempotency-Key'] = key;
  if (device) {
    if (device.id) headers['x-device-id'] = device.id;
    if (device.emulator) headers['x-device-emulator'] = 'true';
    if (device.rooted) headers['x-device-rooted'] = 'true';
    if (device.vpn) headers['x-vpn-detected'] = 'true';
    if (device.platform) headers['x-platform'] = device.platform;
  }
  const res = await fetch(`${API}${p}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty */
  }
  return { status: res.status, ok: res.ok, body: json };
}

const mongoUri = () =>
  fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').match(/^MONGO_URI=(.+)$/m)[1].trim();

const RUN = 1100 + ((Math.floor(Date.now() / 1000) * 40) % 900_000);
const day = (n) => new Date(Date.now() + (RUN + n) * 864e5).toISOString();

async function makeGuest(db, prefix, { verified = true, email } = {}) {
  const addr = email ?? `${prefix}${Date.now()}${Math.floor(Math.random() * 1e4)}@test.com`;
  await call('POST', '/auth/register', {
    body: { email: addr, password: 'Test@1234', firstName: prefix, lastName: 'T' },
  });
  const login = () => call('POST', '/auth/login', { body: { email: addr, password: 'Test@1234' } });
  const id = (await login()).body?.data?.user?.id;
  if (verified && id) {
    await db.collection('users').updateOne(
      { _id: id },
      { $set: { emailVerified: true, phoneVerified: true } },
    );
    await db.collection('kycs').updateOne(
      { userId: id },
      {
        $set: { status: 'approved', level: 'full', updatedAt: new Date() },
        $setOnInsert: { _id: `kyc_${id}`, documents: [], createdAt: new Date() },
      },
      { upsert: true },
    );
  }
  return { email: addr, id, token: (await login()).body?.data?.tokens?.accessToken };
}

(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(mongoUri());
  const db = mongoose.connection;

  console.log('\nRisk, trust and account lifecycle\n');

  const adminToken = (await call('POST', '/auth/login', { body: ADMIN })).body.data.tokens.accessToken;
  const cars = (
    await call('GET', '/search/vehicles?lng=-74.006&lat=40.7128&radiusKm=100&limit=5&instantBook=true')
  ).body.data;
  const car = cars[0];

  section('A normal customer is not punished');
  const clean = await makeGuest(db, 'clean');
  const cleanBooking = await call('POST', '/bookings', {
    token: clean.token,
    key: `r${Date.now()}`,
    device: { id: `dev-clean-${Date.now()}`, platform: 'ios' },
    body: { vehicleId: car._id, start: day(2), end: day(4) },
  });
  ok('a verified guest on a new device books fine', cleanBooking.status === 201, `${cleanBooking.status}`);

  const cleanEvent = await db
    .collection('riskevents')
    .findOne({ userId: clean.id, context: 'booking' }, { sort: { createdAt: -1 } });
  ok('the decision was recorded', !!cleanEvent);
  ok('and it scored low', cleanEvent.band === 'low', `${cleanEvent.band} (${cleanEvent.score})`);

  section('One weak signal alone must not block');
  const vpnGuest = await makeGuest(db, 'vpn');
  const vpnBooking = await call('POST', '/bookings', {
    token: vpnGuest.token,
    key: `v${Date.now()}`,
    device: { id: `dev-vpn-${Date.now()}`, vpn: true, platform: 'android' },
    body: { vehicleId: car._id, start: day(10), end: day(12) },
  });
  ok('a guest on a VPN still books', vpnBooking.status === 201, `${vpnBooking.status}`);
  const vpnEvent = await db
    .collection('riskevents')
    .findOne({ userId: vpnGuest.id, context: 'booking' }, { sort: { createdAt: -1 } });
  ok('but the signal was captured',
    vpnEvent.signals.some((s) => s.signal === 'vpn_or_proxy'),
    JSON.stringify(vpnEvent.signals.map((s) => s.signal)));

  section('Signals cluster into a decision');
  const shared = `dev-ring-${Date.now()}`;
  const ring = [];
  for (let i = 0; i < 4; i += 1) {
    // Unverified, disposable domain, emulator, rooted, VPN, all one device.
    const g = await makeGuest(db, `ring${i}`, {
      verified: false,
      email: `ring${i}${Date.now()}@mailinator.com`,
    });
    ring.push(g);
    await call('GET', '/bookings/eligibility', {
      token: g.token,
      device: { id: shared, emulator: true, rooted: true, vpn: true },
    });
  }
  const ringBooking = await call('POST', '/bookings', {
    token: ring[3].token,
    key: `ring${Date.now()}`,
    device: { id: shared, emulator: true, rooted: true, vpn: true },
    body: { vehicleId: car._id, start: day(20), end: day(22) },
  });
  ok('the fourth account on a shared emulator is stopped',
    ringBooking.status === 403, `${ringBooking.status}`);

  const ringEvent = await db
    .collection('riskevents')
    .findOne({ userId: ring[3].id }, { sort: { createdAt: -1 } });
  ok('it scored high or block',
    ['high', 'block'].includes(ringEvent.band), `${ringEvent.band} (${ringEvent.score})`);
  const fired = ringEvent.signals.map((s) => s.signal);
  ok('device sharing was detected', fired.includes('device_shared_accounts'), JSON.stringify(fired));
  ok('the emulator was detected', fired.includes('device_emulator'));
  ok('the throwaway email domain was detected', fired.includes('disposable_email'));
  ok('every signal carries a human-readable detail',
    ringEvent.signals.every((s) => typeof s.detail === 'string' && s.detail.length > 0));

  section('The error never reveals which signal caught them');
  const msg = JSON.stringify(ringBooking.body?.error ?? {});
  ok('no signal names leak to the client',
    !/emulator|disposable|device_shared|risk|score/i.test(msg), msg);

  section('Duplicate licence is decisive on its own');
  const twinA = await makeGuest(db, 'twinA');
  const twinB = await makeGuest(db, 'twinB');
  const licenceHash = `licence_hash_${Date.now()}`;
  await db.collection('kycs').updateMany(
    { userId: { $in: [twinA.id, twinB.id] } },
    { $set: { licenceNumberHash: licenceHash } },
  );
  const twinBooking = await call('POST', '/bookings', {
    token: twinB.token,
    key: `t${Date.now()}`,
    device: { id: `dev-twin-${Date.now()}` },
    body: { vehicleId: car._id, start: day(30), end: day(32) },
  });
  const twinEvent = await db
    .collection('riskevents')
    .findOne({ userId: twinB.id }, { sort: { createdAt: -1 } });
  ok('the shared licence was found',
    twinEvent.signals.some((s) => s.signal === 'duplicate_licence'),
    JSON.stringify(twinEvent.signals.map((s) => s.signal)));
  ok('and the booking did not go straight through',
    twinBooking.status !== 201, `${twinBooking.status}`);

  section('Under review pauses booking without banning');
  const reviewed = await db.collection('users').findOne({ _id: twinB.id });
  ok('the account was moved to under_review',
    reviewed.status === 'under_review', String(reviewed.status));
  const elig = (await call('GET', '/bookings/eligibility', { token: twinB.token })).body?.data;
  ok('they cannot book', elig.canRequest === false);
  ok('and the copy does not accuse them',
    elig.messages.some((m) => /reviewing/i.test(m)), JSON.stringify(elig.messages));
  const stillIn = await call('GET', '/bookings', { token: twinB.token });
  ok('but they keep access to their existing trips', stillIn.ok, `${stillIn.status}`);

  section('Deny list');
  const denied = await makeGuest(db, 'denied');
  await call('POST', '/admin/risk/deny', {
    token: adminToken,
    body: { type: 'email', value: denied.email, reason: 'Confirmed fraud in this test run' },
  });
  const deniedBooking = await call('POST', '/bookings', {
    token: denied.token,
    key: `d${Date.now()}`,
    device: { id: `dev-den-${Date.now()}` },
    body: { vehicleId: car._id, start: day(40), end: day(42) },
  });
  ok('a denied email cannot book', deniedBooking.status === 403, `${deniedBooking.status}`);
  const denyEntry = await db.collection('denyentries').findOne({ type: 'email' }, { sort: { createdAt: -1 } });
  ok('the deny list stores a hash, never the address',
    denyEntry.valueHash.length === 64 && !JSON.stringify(denyEntry).includes(denied.email));

  const removed = await call('POST', '/admin/risk/allow', {
    token: adminToken,
    body: { type: 'email', value: denied.email },
  });
  ok('and it can be reversed', removed.body?.data?.removed === true);

  section('Trust score');
  const trust = (await call('GET', '/trust/me', { token: clean.token })).body?.data;
  ok('a member can read their own score', typeof trust?.score === 'number', JSON.stringify(trust));
  ok('it breaks down into components', Array.isArray(trust.components) && trust.components.length >= 5);
  ok('every component shows points out of a max',
    trust.components.every((c) => typeof c.points === 'number' && typeof c.max === 'number'));
  ok('components sum to the score',
    trust.components.reduce((s, c) => s + c.points, 0) === trust.score);
  ok('a verified member scores on verification',
    trust.components.find((c) => c.key === 'verification').points === 30);
  ok('it tells them what to do next', Array.isArray(trust.nextSteps));
  ok('and the perks are concrete', typeof trust.perks?.instantBookEligible === 'boolean');
  ok('the RISK score is never exposed to the member',
    !JSON.stringify(trust).match(/riskScore|"band"|signals/i));

  section('Operator surface');
  const queue = await call('GET', '/admin/risk/queue', { token: adminToken });
  ok('the review queue is staff-only and populated',
    queue.ok && Array.isArray(queue.body.data) && queue.body.data.length > 0);
  const guestPeek = await call('GET', '/admin/risk/queue', { token: clean.token });
  ok('a member cannot read the queue', guestPeek.status === 403, `${guestPeek.status}`);

  const timeline = await call('GET', `/admin/risk/users/${ring[3].id}`, { token: adminToken });
  ok('an operator can see one account’s full history',
    timeline.ok && timeline.body.data.events.length > 0);

  const override = await call('POST', `/admin/risk/events/${ringEvent._id}/override`, {
    token: adminToken,
    body: { action: 'allow', reason: 'Verified by phone with the customer, genuine family account' },
  });
  ok('a human can overrule the engine', override.ok);
  const overridden = await db.collection('riskevents').findOne({ _id: ringEvent._id });
  ok('and the override records who and why',
    !!overridden.overriddenBy && !!overridden.overrideReason);

  await mongoose.disconnect();
  console.log(`\n  PASS ${pass}   FAIL ${fail}\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
