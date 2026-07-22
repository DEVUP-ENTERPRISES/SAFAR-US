/**
 * The identity gate.
 *
 * Before this existed, a ten-second-old account with no verified email, no
 * phone and no licence on file could instant-book a car and be charged. That
 * is an insurance problem before it is a fraud problem — no US or Canadian
 * insurer covers a trip where the platform cannot evidence the driver held a
 * valid licence.
 *
 * The design is deliberately two-tiered, and both tiers are asserted here:
 * an unverified guest MAY put a request in front of a host (so their check
 * runs alongside the host's decision), but nothing is captured and no key
 * changes hands until identity clears.
 *
 * Run: node scripts/eligibility-e2e.js
 */
const path = require('path');
const fs = require('fs');

const API = process.env.API || 'http://localhost:8080/api/v1';

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

function mongoUri() {
  const m = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').match(/^MONGO_URI=(.+)$/m);
  return m[1].trim();
}

/**
 * Each run books into its own far-future window. Without this, a previous
 * run's bookings sit on the same dates and every request here fails with
 * NOT_AVAILABLE — noise that looks exactly like a broken gate.
 */
const RUN_OFFSET = 500 + ((Math.floor(Date.now() / 1000) * 40) % 900_000);
const soon = (days) => new Date(Date.now() + (RUN_OFFSET + days) * 864e5).toISOString();

(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(mongoUri());
  const users = mongoose.connection.collection('users');
  const kycs = mongoose.connection.collection('kycs');
  const bookings = mongoose.connection.collection('bookings');

  console.log('\nBooking identity gate\n');

  const email = `elig${Date.now()}@test.com`;
  await call('POST', '/auth/register', {
    body: { email, password: 'Test@1234', firstName: 'Elig', lastName: 'Tester' },
  });
  const login = () => call('POST', '/auth/login', { body: { email, password: 'Test@1234' } });
  const auth = (await login()).body.data;
  const token = auth.tokens.accessToken;
  const userId = auth.user.id;

  const cars = (
    await call('GET', '/search/vehicles?lng=-74.006&lat=40.7128&radiusKm=100&limit=5&instantBook=true')
  ).body.data;
  if (!cars?.length) {
    console.log('no instant-book vehicle to test against');
    process.exit(1);
  }
  const car = cars[0];

  section('A brand-new account knows what it is missing');
  const e1 = (await call('GET', '/bookings/eligibility', { token })).body?.data;
  ok('eligibility endpoint answers', !!e1);
  ok('not eligible to be handed a car', e1.eligible === false, String(e1.eligible));
  ok('but may still submit a request', e1.canRequest === true, String(e1.canRequest));
  ok('email is listed as a blocker', e1.blockers.includes('email_unverified'), JSON.stringify(e1.blockers));
  ok('phone is listed as a blocker', e1.blockers.includes('phone_unverified'));
  ok('identity is listed as a blocker', e1.blockers.includes('identity_not_submitted'));
  ok('blockers come with human copy', Array.isArray(e1.messages) && e1.messages.length === e1.blockers.length);

  section('An unverified guest is held, not charged');
  const b1 = await call('POST', '/bookings', {
    token,
    key: `k${Date.now()}`,
    body: { vehicleId: car._id, start: soon(40), end: soon(42) },
  });
  ok('the request is accepted', b1.status === 201, `${b1.status}`);
  const bookingId = b1.body?.data?._id;
  ok('held at pending_verification, NOT paid',
    b1.body?.data?.status === 'pending_verification', String(b1.body?.data?.status));
  ok('the reason is recorded on the booking',
    (b1.body?.data?.verificationBlockers ?? []).includes('identity_not_submitted'),
    JSON.stringify(b1.body?.data?.verificationBlockers));

  const pay = await mongoose.connection.collection('payments').findOne({ bookingId });
  ok('funds are authorised but NOT captured',
    pay && pay.status === 'authorized' && pay.capturedAmount === 0,
    JSON.stringify({ status: pay?.status, captured: pay?.capturedAmount }));

  section('A held booking cannot start a trip');
  const start = await call('POST', '/trips/start', { token, body: { bookingId } });
  ok('trip start is refused while unverified', !start.ok, `${start.status}`);

  section('Clearing identity releases the held booking');
  await users.updateOne({ _id: userId }, { $set: { emailVerified: true, phoneVerified: true } });
  const e2 = (await call('GET', '/bookings/eligibility', { token })).body?.data;
  ok('only identity remains outstanding',
    e2.blockers.length === 1 && e2.blockers[0] === 'identity_not_submitted',
    JSON.stringify(e2.blockers));

  await kycs.insertOne({
    _id: `kyc_${Date.now()}`,
    userId,
    level: 'full',
    status: 'pending',
    documents: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const e3 = (await call('GET', '/bookings/eligibility', { token })).body?.data;
  ok('pending review reads as "we owe them an answer"',
    e3.awaitingReview === true && e3.blockers[0] === 'identity_pending',
    JSON.stringify(e3));

  // Approve through the service path so the event fires.
  const kycDoc = await kycs.findOne({ userId });
  const admin = await call('POST', '/auth/login', {
    body: { email: 'admin@cato.com', password: 'Cato@Admin2026' },
  });
  const adminToken = admin.body?.data?.tokens?.accessToken;
  const reviewed = await call('POST', `/admin/kyc/${kycDoc._id}/review`, {
    token: adminToken,
    body: { decision: 'approved' },
  });
  ok('admin approved the KYC record', reviewed.ok, `${reviewed.status} ${JSON.stringify(reviewed.body?.error ?? '')}`);

  // The promotion runs on an event handler — give it a moment.
  await new Promise((r) => setTimeout(r, 1500));

  const after = await bookings.findOne({ _id: bookingId });
  ok('the held booking was promoted to paid',
    after.status === 'paid', String(after.status));
  ok('the transition is recorded with a reason',
    after.statusHistory.some((h) => h.to === 'paid' && /verified/i.test(h.reason ?? '')),
    JSON.stringify(after.statusHistory.map((h) => h.to)));

  const payAfter = await mongoose.connection.collection('payments').findOne({ bookingId });
  ok('funds were captured only after verification',
    payAfter.capturedAmount === payAfter.amount,
    JSON.stringify({ captured: payAfter.capturedAmount, amount: payAfter.amount }));

  section('A verified guest books normally');
  const b2 = await call('POST', '/bookings', {
    token,
    key: `k2${Date.now()}`,
    body: { vehicleId: car._id, start: soon(60), end: soon(62) },
  });
  ok('instant book goes straight to paid',
    b2.body?.data?.status === 'paid', String(b2.body?.data?.status));

  section('A suspended account cannot request at all');
  await users.updateOne({ _id: userId }, { $set: { status: 'suspended' } });
  const b3 = await call('POST', '/bookings', {
    token,
    key: `k3${Date.now()}`,
    body: { vehicleId: car._id, start: soon(80), end: soon(82) },
  });
  ok('booking is refused outright', b3.status === 403, `${b3.status}`);
  const e4 = (await call('GET', '/bookings/eligibility', { token })).body?.data;
  ok('canRequest is false for a suspended account', e4.canRequest === false);
  await users.updateOne({ _id: userId }, { $set: { status: 'active' } });

  section('Cancellation records who did it');
  const b4 = await call('POST', '/bookings', {
    token,
    key: `k4${Date.now()}`,
    body: { vehicleId: car._id, start: soon(100), end: soon(102) },
  });
  const cancelId = b4.body.data._id;
  await call('POST', `/bookings/${cancelId}/cancel`, { token, body: { reason: 'changed plans' } });
  const cancelled = await bookings.findOne({ _id: cancelId });
  ok('guest cancellation is cancelled_guest, not plain cancelled',
    cancelled.status === 'cancelled_guest', String(cancelled.status));
  ok('the cancelling role is stored',
    cancelled.cancellation?.role === 'guest', JSON.stringify(cancelled.cancellation?.role));

  await mongoose.disconnect();
  console.log(`\n  PASS ${pass}   FAIL ${fail}\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
