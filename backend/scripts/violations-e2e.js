/**
 * Citations passed through to the guest who incurred them.
 *
 * A speeding ticket for a rented car is posted to the registered keeper — the
 * host — weeks after the trip, once the deposit released and the card
 * authorisation lapsed. There was no path for it at all: the host absorbed it.
 *
 * Because a charge landing weeks later is exactly the kind that gets abused,
 * this asserts the guard rails as hard as the happy path: the offence must fall
 * inside the trip, a photo of the notice is required, the same citation cannot
 * be filed twice, a host cannot charge anyone on their own say-so, and the
 * guest can dispute before money moves.
 *
 * Seeds its own data and removes it. Run: node scripts/violations-e2e.js
 */
const path = require('path');
const fs = require('fs');
const API = process.env.API || 'http://127.0.0.1:8080/api/v1';
const ADMIN = { email: 'admin@cato.com', password: 'Cato@Admin2026' };

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? `  -> ${d}` : ''}`); } };
const section = (t) => console.log(`\n-- ${t} ${'-'.repeat(Math.max(0, 46 - t.length))}`);

async function call(method, p, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, ok: res.ok, body: json };
}
const mongoUri = () => fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').match(/^MONGO_URI=(.+)$/m)[1].trim();
const SEED = `viol-${Date.now()}`;
const PHOTO = [{ url: 'https://cdn.example.com/citation.jpg', kind: 'image' }];

(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(mongoUri());
  const db = mongoose.connection;
  console.log('\nCitation pass-through\n');

  const adminToken = (await call('POST', '/auth/login', { body: ADMIN })).body?.data?.tokens?.accessToken;

  const mk = async (prefix) => {
    const email = `${prefix}${Date.now()}@test.com`;
    await call('POST', '/auth/register', { body: { email, password: 'Test@1234', firstName: prefix, lastName: 'V' } });
    const lg = await call('POST', '/auth/login', { body: { email, password: 'Test@1234' } });
    return { id: lg.body.data.user.id, token: lg.body.data.tokens.accessToken };
  };
  const guest = await mk('vguest');
  const hostUser = await mk('vhost');
  const other = await mk('vother');

  const hostId = `${SEED}-host`;
  const bookingId = `${SEED}-bkg`;
  // A trip that ended five days ago — a citation would plausibly arrive now.
  const tripStart = new Date(Date.now() - 8 * 864e5);
  const tripEnd = new Date(Date.now() - 5 * 864e5);

  try {
    await db.collection('hosts').insertOne({
      _id: hostId, userId: hostUser.id, displayName: 'Citation Host', ratingAvg: 0, ratingCount: 0,
      totalTrips: 0, verificationStatus: 'verified', createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
    });
    const m = (a) => ({ amount: a, currency: 'USD' });
    await db.collection('bookings').insertOne({
      _id: bookingId, code: `VI${Date.now().toString().slice(-6)}`, guestId: guest.id, hostId,
      vehicleId: `${SEED}-veh`, period: { start: tripStart, end: tripEnd },
      priceBreakdown: { currency: 'USD', days: 3, base: m(15000), total: m(15000), hostEarnings: m(12000), commission: m(3000), tax: m(0) },
      status: 'completed', statusHistory: [], createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
    });

    const during = new Date(tripStart.getTime() + 864e5).toISOString();

    section('Only the host of the trip can report');
    const byOther = await call('POST', '/violations', {
      token: other.token,
      body: { bookingId, type: 'traffic', citationRef: 'X1', issuedBy: 'Dallas PD', occurredAt: during, amount: 12500, evidence: PHOTO },
    });
    ok('a stranger cannot report a citation', byOther.status === 403, String(byOther.status));

    section('Guard rails on reporting');
    const noPhoto = await call('POST', '/violations', {
      token: hostUser.token,
      body: { bookingId, type: 'traffic', citationRef: 'NP1', issuedBy: 'Dallas PD', occurredAt: during, amount: 12500, evidence: [] },
    });
    ok('a citation with no photo is refused', noPhoto.status === 409 && noPhoto.body?.error?.code === 'EVIDENCE_REQUIRED', `${noPhoto.status} ${noPhoto.body?.error?.code}`);

    const outside = await call('POST', '/violations', {
      token: hostUser.token,
      body: { bookingId, type: 'traffic', citationRef: 'OB1', issuedBy: 'Dallas PD', occurredAt: new Date(Date.now() - 60 * 864e5).toISOString(), amount: 12500, evidence: PHOTO },
    });
    ok('an offence outside the trip dates is refused', outside.status === 400 || outside.status === 422, String(outside.status));

    section('Reporting a real citation');
    const rep = await call('POST', '/violations', {
      token: hostUser.token,
      body: { bookingId, type: 'traffic', citationRef: 'TX-88213', issuedBy: 'Dallas PD', occurredAt: during, amount: 12500, evidence: PHOTO },
    });
    const vid = rep.body?.data?._id;
    ok('the host can report it', rep.status === 201 && !!vid, `${rep.status} ${JSON.stringify(rep.body?.error ?? '')}`);
    ok('it opens as reported, not charged', rep.body?.data?.status === 'reported', String(rep.body?.data?.status));
    ok('an admin fee is attached from config', rep.body?.data?.adminFee > 0, String(rep.body?.data?.adminFee));

    const dupe = await call('POST', '/violations', {
      token: hostUser.token,
      body: { bookingId, type: 'traffic', citationRef: 'TX-88213', issuedBy: 'Dallas PD', occurredAt: during, amount: 12500, evidence: PHOTO },
    });
    ok('the same citation cannot be filed twice', dupe.status === 409 && dupe.body?.error?.code === 'DUPLICATE_CITATION', `${dupe.status} ${dupe.body?.error?.code}`);

    section('The guest is told, and can answer');
    const note = await db.collection('notifications').findOne({ userId: guest.id, templateKey: 'violation.reported' });
    ok('the guest is notified with the reference', !!note && /TX-88213/.test(note.body ?? ''), note?.body);

    const mine = await call('GET', '/violations/me', { token: guest.token });
    ok('it appears on the guest account', mine.ok && mine.body.data.some((v) => v._id === vid));

    const hostCharge = await call('POST', `/admin/violations/${vid}/charge`, { token: hostUser.token });
    ok('a host cannot charge it themselves', hostCharge.status === 401 || hostCharge.status === 403, String(hostCharge.status));

    const disp = await call('POST', `/violations/${vid}/dispute`, {
      token: guest.token, body: { reason: 'I was not driving at that time and have a receipt elsewhere.' },
    });
    ok('the guest can dispute before money moves', disp.ok && disp.body.data.status === 'disputed', `${disp.status}`);

    section('Staff adjudicate, and the money is real');
    const charged = await call('POST', `/admin/violations/${vid}/charge`, { token: adminToken });
    ok('staff can charge it', charged.ok && charged.body.data.status === 'charged', `${charged.status} ${JSON.stringify(charged.body?.error ?? '')}`);

    const entries = await db.collection('ledgerentries').find({ refType: 'violation', refId: vid }).toArray();
    const credits = entries.filter((e) => e.direction === 'credit').reduce((s, e) => s + e.amount, 0);
    const debits = entries.filter((e) => e.direction === 'debit').reduce((s, e) => s + e.amount, 0);
    ok('it posts a balanced ledger entry', entries.length > 0 && credits === debits, `${credits} vs ${debits}`);
    ok('the host is reimbursed the face value', entries.some((e) => e.account === `host_payable:${hostId}` && e.amount === 12500));
    ok('the platform keeps the admin fee', entries.some((e) => e.account === 'platform_revenue'));

    const twice = await call('POST', `/admin/violations/${vid}/charge`, { token: adminToken });
    ok('it cannot be charged twice', twice.status === 409, String(twice.status));
  } finally {
    await db.collection('violations').deleteMany({ bookingId });
    await db.collection('ledgerentries').deleteMany({ refType: 'violation' });
    await db.collection('bookings').deleteMany({ _id: { $regex: `^${SEED}` } });
    await db.collection('hosts').deleteMany({ _id: { $regex: `^${SEED}` } });
    for (const u of [guest.id, hostUser.id, other.id]) {
      await db.collection('users').deleteOne({ _id: u });
      await db.collection('notifications').deleteMany({ userId: u });
    }
  }

  console.log('\n' + '='.repeat(48));
  console.log(`  PASS ${pass}   FAIL ${fail}`);
  console.log('='.repeat(48) + '\n');
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})();
