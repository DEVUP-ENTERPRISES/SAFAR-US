/**
 * Trip modifications — extend and shorten a confirmed booking.
 *
 * Extending prices and charges only the extra days and moves the end out;
 * shortening prices only the released tail, refunds it, frees those days for
 * others, and pulls the end in. Both must keep the booking's money honest and
 * the ledger globally balanced.
 *
 * Books against the shared seed vehicle in a far-future window and clears the
 * days it used afterwards.
 *
 * Run: node scripts/modify-trip-e2e.js
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
const section = (t) => console.log(`\n-- ${t} ${'-'.repeat(Math.max(0, 52 - t.length))}`);

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

// Far-future window; a single base so the span is exact days.
const RUN = Number(process.env.RUN_OFFSET) || 1100 + ((Math.floor(Date.now() / 1000) * 90) % 1_200_000);
const BASE = Date.now() + RUN * 864e5;
const day = (n) => new Date(BASE + n * 864e5).toISOString();

(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(mongoUri());
  const db = mongoose.connection;

  console.log('\nTrip modifications (extend / shorten)\n');

  const email = `mod${Date.now()}@test.com`;
  await call('POST', '/auth/register', { body: { email, password: 'Test@1234', firstName: 'Mod', lastName: 'Tester' } });
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

  const walletBefore = (await call('GET', '/wallet', { token })).body?.data?.balance ?? 0;

  const bookingIds = [];
  try {
    // ── Extend ───────────────────────────────────────────────────────────
    section('Extend');
    const b1 = await call('POST', '/bookings', { token, key: `mod1${Date.now()}`, body: { vehicleId: car._id, start: day(5), end: day(8) } });
    const id1 = b1.body?.data?._id;
    bookingIds.push(id1);
    const total1 = b1.body?.data?.priceBreakdown?.total?.amount;
    ok('booking created and paid', b1.body?.data?.status === 'paid', String(b1.body?.data?.status));

    const extPrev = await call('GET', `/bookings/${id1}/extension-preview?newEnd=${encodeURIComponent(day(10))}`, { token });
    ok('extension preview available with a cost', extPrev.body?.data?.available === true && extPrev.body?.data?.extraCost?.amount > 0, JSON.stringify(extPrev.body?.data));
    const extraCost = extPrev.body?.data?.extraCost?.amount;

    const ext = await call('POST', `/bookings/${id1}/extend`, { token, body: { newEnd: day(10) } });
    ok('extend succeeds', ext.ok, `${ext.status} ${JSON.stringify(ext.body?.error ?? '')}`);
    ok('end date moved out', new Date(ext.body?.data?.period?.end).toISOString().slice(0, 10) === day(10).slice(0, 10), ext.body?.data?.period?.end);
    ok('total grew by exactly the previewed extra cost', ext.body?.data?.priceBreakdown?.total?.amount === total1 + extraCost, `${ext.body?.data?.priceBreakdown?.total?.amount} vs ${total1 + extraCost}`);

    // The extended tail is now booked: another guest can't take those days.
    const clashStart = day(9), clashEnd = day(10);
    const clash = await call('POST', '/bookings', { token, key: `clash${Date.now()}`, body: { vehicleId: car._id, start: clashStart, end: clashEnd } });
    ok('extended days are held against new bookings', clash.status === 409, String(clash.status));

    // ── Shorten ──────────────────────────────────────────────────────────
    section('Shorten');
    const b2 = await call('POST', '/bookings', { token, key: `mod2${Date.now()}`, body: { vehicleId: car._id, start: day(30), end: day(36) } });
    const id2 = b2.body?.data?._id;
    bookingIds.push(id2);
    const total2 = b2.body?.data?.priceBreakdown?.total?.amount;
    ok('second booking created and paid', b2.body?.data?.status === 'paid', String(b2.body?.data?.status));

    const shPrev = await call('GET', `/bookings/${id2}/shorten-preview?newEnd=${encodeURIComponent(day(33))}`, { token });
    ok('shorten preview available with a refund', shPrev.body?.data?.available === true && shPrev.body?.data?.refund?.amount > 0, JSON.stringify(shPrev.body?.data));
    const refund = shPrev.body?.data?.refund?.amount;

    const walletPreShorten = (await call('GET', '/wallet', { token })).body?.data?.balance ?? 0;
    const sh = await call('POST', `/bookings/${id2}/shorten`, { token, body: { newEnd: day(33) } });
    ok('shorten succeeds', sh.ok, `${sh.status} ${JSON.stringify(sh.body?.error ?? '')}`);
    ok('end date pulled in', new Date(sh.body?.data?.period?.end).toISOString().slice(0, 10) === day(33).slice(0, 10), sh.body?.data?.period?.end);
    ok('total dropped by exactly the previewed refund', sh.body?.data?.priceBreakdown?.total?.amount === total2 - refund, `${sh.body?.data?.priceBreakdown?.total?.amount} vs ${total2 - refund}`);

    const walletPostShorten = (await call('GET', '/wallet', { token })).body?.data?.balance ?? 0;
    ok('refund landed in the wallet', walletPostShorten - walletPreShorten === refund, `${walletPostShorten - walletPreShorten} vs ${refund}`);

    // The released tail is free again: it can now be re-booked.
    const rebook = await call('POST', '/bookings', { token, key: `rebook${Date.now()}`, body: { vehicleId: car._id, start: day(34), end: day(36) } });
    ok('released days reopen for booking', rebook.body?.data?.status === 'paid', `${rebook.status} ${JSON.stringify(rebook.body?.error ?? '')}`);
    if (rebook.body?.data?._id) bookingIds.push(rebook.body.data._id);

    // ── Guards ───────────────────────────────────────────────────────────
    section('Guards');
    const bad = await call('POST', `/bookings/${id1}/shorten`, { token, body: { newEnd: day(4) } }); // before start
    ok('cannot shorten below the start date', bad.status >= 400, String(bad.status));

    // ── Ledger integrity ─────────────────────────────────────────────────
    section('Ledger integrity');
    const rows = await db.collection('ledgerentries').aggregate([{ $group: { _id: '$direction', t: { $sum: '$amount' } } }]).toArray();
    const credit = (rows.find((x) => x._id === 'credit') || { t: 0 }).t;
    const debit = (rows.find((x) => x._id === 'debit') || { t: 0 }).t;
    ok('ledger globally balanced', credit === debit, `${credit} vs ${debit}`);
  } finally {
    for (const id of bookingIds) {
      if (id) await db.collection('availabilities').deleteMany({ bookingId: id });
    }
  }

  void walletBefore;
  console.log('\n' + '='.repeat(56));
  console.log(`  PASS ${pass}   FAIL ${fail}`);
  console.log('='.repeat(56) + '\n');
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})();
