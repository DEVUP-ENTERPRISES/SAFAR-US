/**
 * Claim settlement — the money split when damage is filed and resolved.
 *
 * A claimant files, an agent settles: the approved amount is paid to the
 * claimant's wallet (platform/insurer bears it) and any penalty is charged to
 * the liable party's wallet (recovered to platform revenue). Both are real
 * double-entry postings, so the ledger must stay globally balanced.
 *
 * Run: node scripts/claims-e2e.js
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

async function newUser(db, prefix) {
  const email = `${prefix}${Date.now()}${Math.floor(Math.random() * 1e4)}@test.com`;
  await call('POST', '/auth/register', { body: { email, password: 'Test@1234', firstName: prefix, lastName: 'T' } });
  const login = () => call('POST', '/auth/login', { body: { email, password: 'Test@1234' } });
  const auth = (await login()).body.data;
  await db.collection('users').updateOne({ _id: auth.user.id }, { $set: { emailVerified: true, phoneVerified: true } });
  return { id: auth.user.id, token: auth.tokens.accessToken };
}
const balance = async (token) => (await call('GET', '/wallet', { token })).body?.data?.balance ?? 0;

(async () => {
  const mongoose = require('mongoose');
  await mongoose.connect(mongoUri());
  const db = mongoose.connection;
  console.log('\nClaim settlement\n');

  const claimant = await newUser(db, 'claimant');
  const liable = await newUser(db, 'liable');
  const adminToken = (await call('POST', '/auth/login', { body: ADMIN })).body?.data?.tokens?.accessToken;
  ok('admin can log in', !!adminToken, 'check seeded admin');

  const AMOUNT = 3000; // $30 approved to claimant
  const PENALTY = 2000; // $20 charged to liable party

  section('File');
  const created = await call('POST', '/claims', {
    token: claimant.token,
    body: { type: 'damage', description: 'Scratch on rear bumper found at return.', amountClaimed: 5000 },
  });
  const claimId = created.body?.data?._id;
  ok('claimant files a claim', created.ok && !!claimId, `${created.status} ${JSON.stringify(created.body?.error ?? '')}`);

  section('Settle (admin)');
  const assign = await call('POST', `/admin/claims/${claimId}/assign`, { token: adminToken });
  ok('agent assigns the claim', assign.ok, `${assign.status} ${JSON.stringify(assign.body?.error ?? '')}`);

  const beforeClaimant = await balance(claimant.token);
  const beforeLiable = await balance(liable.token);

  const settle = await call('POST', `/admin/claims/${claimId}/settle`, {
    token: adminToken,
    body: { amountApproved: AMOUNT, note: 'Approved partial; guest liable.', liableUserId: liable.id, penaltyCents: PENALTY, warning: true },
  });
  ok('agent settles the claim', settle.ok && settle.body?.data?.status === 'settled', `${settle.status} ${JSON.stringify(settle.body?.error ?? '')}`);

  section('Money moved correctly');
  ok('claimant wallet credited by the approved amount', (await balance(claimant.token)) - beforeClaimant === AMOUNT, `${(await balance(claimant.token)) - beforeClaimant} vs ${AMOUNT}`);
  ok('liable wallet debited by the penalty', (await balance(liable.token)) - beforeLiable === -PENALTY, `${(await balance(liable.token)) - beforeLiable} vs ${-PENALTY}`);

  const warned = await db.collection('users').findOne({ _id: liable.id }, { projection: { warnings: 1 } });
  ok('a formal warning is recorded on the liable account', (warned?.warnings ?? []).length >= 1, JSON.stringify(warned?.warnings));

  section('Guards');
  const again = await call('POST', `/admin/claims/${claimId}/settle`, { token: adminToken, body: { amountApproved: 1, note: 'again' } });
  ok('a settled claim cannot be settled twice', again.status === 409, String(again.status));

  const strangerView = await call('GET', `/claims/${claimId}`, { token: liable.token });
  ok('a non-claimant cannot read the claim', strangerView.status >= 400, String(strangerView.status));

  section('Ledger integrity');
  const rows = await db.collection('ledgerentries').aggregate([{ $group: { _id: '$direction', t: { $sum: '$amount' } } }]).toArray();
  const credit = (rows.find((x) => x._id === 'credit') || { t: 0 }).t;
  const debit = (rows.find((x) => x._id === 'debit') || { t: 0 }).t;
  ok('ledger globally balanced', credit === debit, `${credit} vs ${debit}`);

  console.log('\n' + '='.repeat(48));
  console.log(`  PASS ${pass}   FAIL ${fail}`);
  console.log('='.repeat(48) + '\n');
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})();
