/**
 * Data subject rights: export, erasure and legal hold.
 *
 * Required in both launch markets — CCPA/CPRA in California, PIPEDA federally
 * in Canada, Law 25 in Québec — and none of it existed.
 *
 * The interesting assertions are the LIMITS. A rental marketplace cannot honour
 * "delete everything" literally: financial records carry statutory retention,
 * an open claim needs its evidence, and someone under investigation must not be
 * able to erase the investigation by asking politely.
 *
 * Run: node scripts/compliance-e2e.js
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

async function call(method, p, { token, body, key, raw } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (key) headers['Idempotency-Key'] = key;
  const res = await fetch(`${API}${p}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return { status: res.status, ok: res.ok, text: await res.text(), headers: res.headers };
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

const NOW = Date.now();
const RUN = 1700 + ((Math.floor(NOW / 1000) * 40) % 900_000);
const day = (n) => new Date(NOW + (RUN + n) * 864e5).toISOString();

async function verifiedGuest(db, prefix) {
  const email = `${prefix}${Date.now()}${Math.floor(Math.random() * 1e4)}@test.com`;
  await call('POST', '/auth/register', {
    body: { email, password: 'Test@1234', firstName: prefix, lastName: 'Subject' },
  });
  const login = () => call('POST', '/auth/login', { body: { email, password: 'Test@1234' } });
  const id = (await login()).body.data.user.id;
  await db.collection('users').updateOne(
    { _id: id },
    { $set: { emailVerified: true, phoneVerified: true, phone: `+1555${String(Date.now()).slice(-7)}` } },
  );
  await db.collection('kycs').updateOne(
    { userId: id },
    {
      $set: {
        status: 'approved',
        level: 'full',
        licenceNumberHash: `hash_${id}`,
        documents: [{ type: 'license', url: 'https://example.com/private.jpg' }],
        updatedAt: new Date(),
      },
      $setOnInsert: { _id: `kyc_${id}`, createdAt: new Date() },
    },
    { upsert: true },
  );
  return { id, email, token: (await login()).body.data.tokens.accessToken };
}

(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(mongoUri());
  const db = mongoose.connection;

  console.log('\nData subject rights\n');

  const adminToken = (await call('POST', '/auth/login', { body: ADMIN })).body.data.tokens.accessToken;
  const guest = await verifiedGuest(db, 'gdpr');
  const cars = (
    await call('GET', '/search/vehicles?lng=-74.006&lat=40.7128&radiusKm=100&limit=5&instantBook=true')
  ).body.data;

  section('Export');
  const exp = await call('GET', '/me/data-export', { token: guest.token, raw: true });
  ok('a member can download their own data', exp.ok, `${exp.status}`);
  ok('it downloads as a file',
    (exp.headers.get('content-disposition') || '').includes('attachment'),
    String(exp.headers.get('content-disposition')));

  const data = JSON.parse(exp.text);
  ok('it contains their identity', data.subject?.email === guest.email);
  ok('it lists their bookings', Array.isArray(data.bookings));
  ok('it lists their payments', Array.isArray(data.payments));
  ok('it discloses automated decisions made about them',
    Array.isArray(data.automatedDecisions), JSON.stringify(Object.keys(data)));
  ok('identity documents are referenced, not embedded',
    (data.identityChecks[0]?.documents ?? []).every((d) => d.storedPrivately === true),
    JSON.stringify(data.identityChecks[0]?.documents));
  ok('no password hash is exported', !JSON.stringify(data).includes('passwordHash'));

  section('Erasure is blocked while a trip is live');
  const booking = await call('POST', '/bookings', {
    token: guest.token,
    key: `gd${Date.now()}`,
    body: { vehicleId: cars[0]._id, start: day(2), end: day(4) },
  });
  ok('booking created', booking.status === 201, `${booking.status}`);

  const blocked = await call('GET', '/me/erasure-eligibility', { token: guest.token });
  ok('erasure is refused while a trip is in progress',
    blocked.body.data.eligible === false, JSON.stringify(blocked.body.data));
  ok('and the reason is stated plainly',
    blocked.body.data.blockers.some((b) => /trip/i.test(b)),
    JSON.stringify(blocked.body.data.blockers));

  const tryErase = await call('POST', '/me/erase', {
    token: guest.token,
    body: { confirm: 'DELETE MY ACCOUNT' },
  });
  ok('the erase call itself is refused, not just the check',
    tryErase.status === 409 && tryErase.body?.error?.code === 'ERASURE_BLOCKED',
    `${tryErase.status}`);

  section('A legal hold outranks the request');
  const clean = await verifiedGuest(db, 'hold');
  await call('POST', `/admin/compliance/users/${clean.id}/legal-hold`, {
    token: adminToken,
    body: { reason: 'Open fraud investigation for this test run' },
  });
  const held = await call('GET', '/me/erasure-eligibility', { token: clean.token });
  ok('a held account cannot erase itself', held.body.data.eligible === false);
  ok('the hold is named as the blocker',
    held.body.data.blockers.some((b) => /legal hold/i.test(b)),
    JSON.stringify(held.body.data.blockers));

  await call('DELETE', `/admin/compliance/users/${clean.id}/legal-hold`, { token: adminToken });
  const released = await call('GET', '/me/erasure-eligibility', { token: clean.token });
  ok('releasing the hold restores the right', released.body.data.eligible === true,
    JSON.stringify(released.body.data.blockers));

  section('Erasure destroys identifiers and keeps the record');
  const before = await db.collection('users').findOne({ _id: clean.id });
  ok('the account had a password hash before', !!before.passwordHash);

  const erased = await call('POST', '/me/erase', {
    token: clean.token,
    body: { confirm: 'DELETE MY ACCOUNT' },
  });
  ok('erasure succeeds when nothing blocks it', erased.ok, `${erased.status} ${JSON.stringify(erased.body?.error ?? '')}`);

  const after = await db.collection('users').findOne({ _id: clean.id });
  ok('the email is gone', !after.email.includes('@test.com'), after.email);
  ok('the password hash is gone', !after.passwordHash);
  ok('the phone is gone', !after.phone);
  ok('the name is gone', after.firstName === 'Erased');
  ok('the account is marked closed', after.status === 'closed');
  ok('and the erasure is dated', !!after.erasedAt);

  const kycAfter = await db.collection('kycs').findOne({ userId: clean.id });
  ok('identity documents are destroyed',
    (kycAfter.documents ?? []).length === 0, JSON.stringify(kycAfter.documents));
  ok('the licence number is destroyed', !kycAfter.licenceNumberHash);
  ok('but the identity DECISION is retained for the safety record',
    kycAfter.status === 'approved', kycAfter.status);

  const notifsAfter = await db.collection('notifications').countDocuments({ userId: clean.id });
  ok('their notification history is deleted', notifsAfter === 0, String(notifsAfter));

  section('The confirmation phrase is required');
  const guest2 = await verifiedGuest(db, 'confirm');
  const noConfirm = await call('POST', '/me/erase', {
    token: guest2.token,
    body: { confirm: 'yes' },
  });
  ok('a wrong confirmation phrase is refused', noConfirm.status === 422, `${noConfirm.status}`);

  section('Operator access is staff-only');
  const peek = await call('GET', `/admin/compliance/users/${guest.id}/export`, { token: guest2.token });
  ok('a member cannot export someone else’s data', peek.status === 403, `${peek.status}`);
  const staffExport = await call('GET', `/admin/compliance/users/${guest.id}/export`, { token: adminToken });
  ok('staff can, for a postal or phone request', staffExport.ok, `${staffExport.status}`);

  section('The audit trail records the request itself');
  const trail = await call('GET', `/admin/compliance/audit/user/${guest.id}`, { token: adminToken });
  ok('the subject access request was logged',
    trail.ok && trail.body.data.some((e) => e.action.includes('data-export')),
    JSON.stringify((trail.body?.data ?? []).map((e) => e.action)));

  section('Audit entries never store secrets');
  await call('POST', `/admin/risk/users/${guest.id}/status`, {
    token: adminToken,
    body: { status: 'restricted', reason: 'Compliance suite check' },
  });
  // Audit writes are fire-and-forget on response finish, so they land just
  // after the call returns. Give them a beat rather than racing them.
  await new Promise((r) => setTimeout(r, 800));
  const logs = await db
    .collection('auditlogs')
    .find({ resourceId: guest.id })
    .sort({ at: -1 })
    .limit(10)
    .toArray();
  ok('the status change was audited', logs.length > 0);
  const withReason = logs.find((l) => l.reason);
  ok('the reason is captured', !!withReason, JSON.stringify(logs.map((l) => l.action)));
  ok('no audit entry contains a password or token',
    !JSON.stringify(logs).match(/passwordHash|"password"|accessToken/),
    'a secret reached the append-only store');

  await mongoose.disconnect();
  console.log(`\n  PASS ${pass}   FAIL ${fail}\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
