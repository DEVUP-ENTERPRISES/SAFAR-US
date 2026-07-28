/**
 * Booking conversation — text, photo attachments, system notes, unread count,
 * and read marking.
 *
 * The thread is scoped to a booking and doubles as the trip's running record:
 * a real message carries text and/or an image, lifecycle milestones post
 * themselves as system notes, and the unread count only counts what the other
 * party sent. Books the shared seed vehicle in a far-future window and clears
 * the days afterwards.
 *
 * Run: node scripts/messaging-e2e.js
 */
const path = require('path');
const fs = require('fs');

const API = process.env.API || 'http://127.0.0.1:8080/api/v1';

let pass = 0;
let fail = 0;
const ok = (n, c, d = '') => {
  if (c) { pass += 1; console.log(`  ✓ ${n}`); }
  else { fail += 1; console.log(`  ✗ ${n}${d ? `  -> ${d}` : ''}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, p, { token, body, key } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (key) headers['Idempotency-Key'] = key;
  const res = await fetch(`${API}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, ok: res.ok, body: json };
}

const mongoUri = () =>
  fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').match(/^MONGO_URI=(.+)$/m)[1].trim();

const RUN = Number(process.env.RUN_OFFSET) || 1300 + ((Math.floor(Date.now() / 1000) * 110) % 1_000_000);
const BASE = Date.now() + RUN * 864e5;
const day = (n) => new Date(BASE + n * 864e5).toISOString();

(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(mongoUri());
  const db = mongoose.connection;

  console.log('\nBooking conversation\n');

  const email = `msg${Date.now()}@test.com`;
  await call('POST', '/auth/register', { body: { email, password: 'Test@1234', firstName: 'Msg', lastName: 'Tester' } });
  const login = () => call('POST', '/auth/login', { body: { email, password: 'Test@1234' } });
  let auth = (await login()).body.data;
  const userId = auth.user.id;
  await db.collection('users').updateOne({ _id: userId }, { $set: { emailVerified: true, phoneVerified: true } });
  await db.collection('kycs').updateOne(
    { userId },
    { $set: { status: 'approved', level: 'full', updatedAt: new Date() }, $setOnInsert: { _id: `kyc_${userId}`, documents: [], createdAt: new Date() } },
    { upsert: true },
  );
  auth = (await login()).body.data;
  const token = auth.tokens.accessToken;

  const car = (await call('GET', '/search/vehicles?lng=-74.006&lat=40.7128&radiusKm=100&limit=1&instantBook=true')).body.data[0];

  let bookingId;
  try {
    const booking = await call('POST', '/bookings', { token, key: `msg${Date.now()}`, body: { vehicleId: car._id, start: day(20), end: day(24) } });
    bookingId = booking.body?.data?._id;
    ok('booking created', !!bookingId, JSON.stringify(booking.body?.error ?? ''));

    // ── Text + attachment ────────────────────────────────────────────────
    const t1 = await call('POST', `/messages/${bookingId}`, { token, body: { body: 'Hi! Looking forward to the trip.' } });
    ok('text message sent', t1.ok && t1.body?.data?.body?.includes('Looking forward'), `${t1.status}`);

    const t2 = await call('POST', `/messages/${bookingId}`, {
      token,
      body: { body: '', attachments: [{ url: 'https://cdn.example.com/msg/photo1.jpg', kind: 'image' }] },
    });
    ok('photo attachment message sent', t2.ok && t2.body?.data?.attachments?.length === 1, `${t2.status} ${JSON.stringify(t2.body?.error ?? '')}`);

    const empty = await call('POST', `/messages/${bookingId}`, { token, body: { body: '', attachments: [] } });
    ok('empty message rejected', empty.status >= 400, String(empty.status));

    // ── System note via a real lifecycle event ───────────────────────────
    const ext = await call('POST', `/bookings/${bookingId}/extend`, { token, body: { newEnd: day(27) } });
    ok('booking extended (triggers a system note)', ext.ok, `${ext.status} ${JSON.stringify(ext.body?.error ?? '')}`);

    // The note is posted by an async subscriber — give it a moment.
    let sys = null;
    for (let i = 0; i < 10 && !sys; i++) {
      await sleep(300);
      const list = (await call('GET', `/messages/${bookingId}`, { token })).body?.data ?? [];
      sys = list.find((m) => m.senderId === 'system' && /extended/i.test(m.body));
    }
    ok('a system note recorded the extension', !!sys, sys ? sys.body : 'no system note found');

    // ── Listing & unread ─────────────────────────────────────────────────
    const list = (await call('GET', `/messages/${bookingId}`, { token })).body?.data ?? [];
    ok('conversation lists all messages in order', list.length >= 3 && list.every((m, i) => i === 0 || +new Date(m.createdAt) >= +new Date(list[i - 1].createdAt)), `count ${list.length}`);

    const unread = (await call('GET', '/messages/unread-count', { token })).body?.data?.count;
    ok('my own + system messages are not unread for me', unread === 0, String(unread));

    const read = await call('POST', `/messages/${bookingId}/read`, { token });
    ok('marking the conversation read succeeds', read.ok, String(read.status));
  } finally {
    if (bookingId) await db.collection('availabilities').deleteMany({ bookingId });
  }

  console.log('\n' + '='.repeat(56));
  console.log(`  PASS ${pass}   FAIL ${fail}`);
  console.log('='.repeat(56) + '\n');
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})();
