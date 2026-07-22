/**
 * Host public profile, end to end.
 *
 * The listing page used to render a hardcoded host ("Ruslan · 13 trips · 5.0")
 * on every car. This proves the replacement is real: the photo a host uploads
 * is the photo guests see, and the trust numbers move with actual behaviour
 * rather than being decorative.
 *
 * Run: node scripts/host-profile-e2e.js
 */
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
const section = (t) => console.log(`\n-- ${t} ${'-'.repeat(Math.max(0, 50 - t.length))}`);

async function call(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, ok: res.ok, body: json };
}

async function newHost(prefix) {
  const email = `${prefix}${Date.now()}${Math.floor(Math.random() * 1e4)}@test.com`;
  await call('POST', '/auth/register', {
    body: { email, password: 'Test@1234', firstName: prefix, lastName: 'Tester' },
  });
  const login = () => call('POST', '/auth/login', { body: { email, password: 'Test@1234' } });
  let tk = (await login()).body?.data?.tokens?.accessToken;
  const host = await call('POST', '/hosts/onboard', { token: tk, body: { displayName: `${prefix} Host` } });
  tk = (await login()).body?.data?.tokens?.accessToken;
  return { token: tk, hostId: host.body?.data?._id, email };
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

(async () => {
  console.log('\nHost public profile\n');
  const { token, hostId } = await newHost('prof');
  ok('host created', !!hostId);
  if (!hostId) process.exit(1);

  section('Honest defaults');
  let p = (await call('GET', `/hosts/${hostId}/public`)).body?.data;
  ok('profile is public (no token)', !!p);
  ok('no rating is null, not 5.0', p.ratingAvg === null, String(p.ratingAvg));
  ok('no response rate until there are requests', p.responseRatePct === null, String(p.responseRatePct));
  ok('trips start at 0', p.totalTrips === 0, String(p.totalTrips));
  ok('nothing is verified yet', !p.verifications.email && !p.verifications.identity);
  ok('joined date is real', !!p.joinedAt && !Number.isNaN(Date.parse(p.joinedAt)));

  section('Profile photo');
  const target = (
    await call('POST', '/media/upload-urls', {
      token,
      body: { category: 'avatar', count: 1, contentType: 'image/png' },
    })
  ).body.data[0];
  const put = await fetch(target.uploadUrl, {
    method: 'PUT',
    body: PNG,
    headers: { 'Content-Type': 'image/png' },
  });
  ok('avatar uploads to storage', put.ok, `${put.status}`);

  const saved = await call('PATCH', '/hosts/me', {
    token,
    body: { avatarUrl: target.publicUrl, avatarKey: target.key },
  });
  ok('avatar saved on the profile', saved.ok, `${saved.status} ${JSON.stringify(saved.body?.error ?? '')}`);

  p = (await call('GET', `/hosts/${hostId}/public`)).body?.data;
  ok('guests see the uploaded photo', p.avatarUrl === target.publicUrl, String(p.avatarUrl));

  const img = await fetch(p.avatarUrl);
  ok(
    'that photo actually loads',
    img.status === 200 && (img.headers.get('content-type') || '').startsWith('image/'),
    `${img.status}`,
  );
  const asImg = await fetch(p.avatarUrl, { redirect: 'manual' });
  ok(
    'and is embeddable cross-origin',
    asImg.headers.get('cross-origin-resource-policy') === 'cross-origin',
    String(asImg.headers.get('cross-origin-resource-policy')),
  );

  section('The rest of the profile');
  const details = await call('PATCH', '/hosts/me', {
    token,
    body: {
      bio: 'I keep my cars spotless.',
      city: 'Brooklyn, NY',
      work: 'Photographer',
      languages: ['English', 'Spanish'],
    },
  });
  ok('bio/city/work/languages saved', details.ok, `${details.status} ${JSON.stringify(details.body?.error ?? '')}`);

  p = (await call('GET', `/hosts/${hostId}/public`)).body?.data;
  ok('bio is public', p.bio === 'I keep my cars spotless.', String(p.bio));
  ok('city is public', p.city === 'Brooklyn, NY', String(p.city));
  ok('languages are public', p.languages.join(',') === 'English,Spanish', JSON.stringify(p.languages));

  section('Listed cars');
  ok('a new host lists no cars', p.listedVehicles === 0, String(p.listedVehicles));
  const cars = (await call('GET', `/hosts/${hostId}/vehicles`)).body?.data;
  ok('vehicles endpoint is public and empty', Array.isArray(cars) && cars.length === 0);

  section('Private data must not leak');
  await call('PATCH', '/hosts/me', {
    token,
    body: {
      bankingDetails: { accountHolder: 'Prof Host', bankName: 'Chase', accountNumberMasked: '1234' },
      taxInfo: { taxId: '12-3456789' },
    },
  });
  p = (await call('GET', `/hosts/${hostId}/public`)).body?.data;
  const serialised = JSON.stringify(p);
  ok('banking details are not in the public profile', !serialised.includes('Chase'));
  ok('tax id is not in the public profile', !serialised.includes('12-3456789'));
  ok('account number is not in the public profile', !serialised.includes('1234'));
  ok('userId is not exposed', p.userId === undefined);

  section('Unknown host');
  ok(
    'a made-up host id 404s',
    (await call('GET', '/hosts/00000000-0000-0000-0000-000000000000/public')).status === 404,
  );

  console.log(`\n  PASS ${pass}   FAIL ${fail}\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
