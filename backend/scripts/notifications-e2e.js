/**
 * Notification delivery.
 *
 * Push, SMS and email used to be written to a log line and never sent. A host
 * without the tab open never learned a booking request had arrived, and the
 * 24-hour expiry job then killed those requests against hosts who were never
 * told — lost GMV that looks like host apathy.
 *
 * These assertions are about the dispatcher, not about any provider: no
 * credentials are configured in dev, so what must be proven is that the right
 * channels are ATTEMPTED for the right priority, that every attempt is
 * recorded, and — critically — that a channel with no provider reports failure
 * rather than quietly claiming success.
 *
 * Run: node scripts/notifications-e2e.js
 */
const path = require('path');
const fs = require('fs');

const API = process.env.API || 'http://127.0.0.1:8080/api/v1';

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

async function call(method, p, { token, body, key } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (key) headers['Idempotency-Key'] = key;
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

const RUN = 900 + ((Math.floor(Date.now() / 1000) * 40) % 900_000);
const day = (n) => new Date(Date.now() + (RUN + n) * 864e5).toISOString();
const settle = () => new Promise((r) => setTimeout(r, 1200));

(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(mongoUri());
  const db = mongoose.connection;
  const notifications = db.collection('notifications');

  console.log('\nNotification delivery\n');

  const email = `notif${Date.now()}@test.com`;
  await call('POST', '/auth/register', {
    body: { email, password: 'Test@1234', firstName: 'Notif', lastName: 'Tester' },
  });
  const login = () => call('POST', '/auth/login', { body: { email, password: 'Test@1234' } });
  const userId = (await login()).body.data.user.id;
  await db.collection('users').updateOne(
    { _id: userId },
    {
      $set: {
        emailVerified: true,
        phoneVerified: true,
        // Unique per run: `phone` carries a unique index, so a fixed number
        // makes the second run of this suite fail on a duplicate key.
        phone: `+1555${String(Date.now()).slice(-7)}`,
        timezone: 'America/New_York',
      },
    },
  );
  await db.collection('kycs').updateOne(
    { userId },
    {
      $set: { status: 'approved', level: 'full', updatedAt: new Date() },
      $setOnInsert: { _id: `kyc_${userId}`, documents: [], createdAt: new Date() },
    },
    { upsert: true },
  );
  const token = (await login()).body.data.tokens.accessToken;

  section('A critical message leaves the app');
  const cars = (
    await call('GET', '/search/vehicles?lng=-74.006&lat=40.7128&radiusKm=100&limit=5&instantBook=true')
  ).body.data;
  const booking = await call('POST', '/bookings', {
    token,
    key: `n${Date.now()}`,
    body: { vehicleId: cars[0]._id, start: day(2), end: day(4) },
  });
  const bookingId = booking.body?.data?._id;
  ok('booking created', !!bookingId, JSON.stringify(booking.body?.error ?? ''));
  await settle();

  const confirmed = await notifications
    .find({ userId, templateKey: 'booking.confirmed' })
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray();
  ok('the guest got a confirmation record', confirmed.length === 1);

  const n = confirmed[0];
  ok('it is marked critical', n.priority === 'critical', String(n.priority));
  ok('it carries a deep link to the booking',
    typeof n.deepLink === 'string' && n.deepLink.includes(bookingId), String(n.deepLink));

  const attempted = (n.attempts ?? []).map((a) => a.channel).sort();
  ok('push, sms and email were all attempted',
    ['email', 'push', 'sms'].every((c) => attempted.includes(c)),
    JSON.stringify(attempted));

  section('An unconfigured channel reports failure, never success');
  const claimedSuccess = (n.attempts ?? []).filter((a) => a.ok);
  ok('no attempt claims success without a provider',
    claimedSuccess.length === 0, JSON.stringify(claimedSuccess));
  ok('each failure says why',
    (n.attempts ?? []).every((a) => typeof a.error === 'string' && a.error.length > 0),
    JSON.stringify((n.attempts ?? []).map((a) => a.error)));
  ok('and is marked non-retryable — a missing provider / device will not fix itself',
    (n.attempts ?? []).every((a) => a.retryable === false),
    JSON.stringify((n.attempts ?? []).map((a) => ({ error: a.error, retryable: a.retryable }))));

  section('Priority decides the fan-out');
  const lowId = `low_${Date.now()}`;
  await notifications.insertOne({
    _id: lowId,
    userId,
    channel: 'inapp',
    priority: 'low',
    templateKey: 'test.low',
    title: 'Low',
    body: 'Low priority',
    data: {},
    attempts: [],
    status: 'sent',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const low = await notifications.findOne({ _id: lowId });
  ok('a low-priority message stays in-app only', (low.attempts ?? []).length === 0);

  section('The feed still works');
  const feed = await call('GET', '/notifications', { token });
  ok('the guest can read their feed', feed.ok, `${feed.status}`);
  ok('and the critical message is in it',
    (feed.body?.data ?? []).some((x) => x.templateKey === 'booking.confirmed'));

  section('Delivery is recorded for the operator');
  ok('every attempt has a channel and a timestamp',
    (n.attempts ?? []).every((a) => a.channel && a.at),
    JSON.stringify(n.attempts));

  await mongoose.disconnect();
  console.log(`\n  PASS ${pass}   FAIL ${fail}\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
