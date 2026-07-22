/**
 * Listing CRUD + photo rules, end to end against a running API.
 *
 * Covers the two bug classes this suite was written for:
 *  - photos: uploads that "succeed" but render broken, and listings reaching
 *    the verification queue with no photos at all;
 *  - partial updates: a PATCH that filled omitted fields with creation defaults
 *    and silently reset Instant Book / delivery / cancellation policy.
 *
 * Run: node scripts/listing-crud.js
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

/** Onboarding grants the host role, so the token must be re-minted after it. */
async function newHost(prefix) {
  const email = `${prefix}${Date.now()}${Math.floor(Math.random() * 1e4)}@test.com`;
  await call('POST', '/auth/register', {
    body: { email, password: 'Test@1234', firstName: prefix, lastName: 'Tester' },
  });
  const login = () => call('POST', '/auth/login', { body: { email, password: 'Test@1234' } });
  let tk = (await login()).body?.data?.tokens?.accessToken;
  await call('POST', '/hosts/onboard', { token: tk, body: { displayName: prefix } });
  tk = (await login()).body?.data?.tokens?.accessToken;
  return tk;
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const draft = (over = {}) => ({
  make: 'Honda',
  model: 'Civic',
  year: 2023,
  bodyType: 'sedan',
  category: 'economy',
  transmission: 'automatic',
  fuelType: 'petrol',
  seats: 5,
  features: [],
  photos: [],
  location: { lng: -122.6784, lat: 45.5152, address: '1 SW Main St', city: 'Portland' },
  listing: {
    title: 'Civic',
    description: 'd',
    instantBook: true,
    minTripHours: 24,
    maxTripHours: 720,
    cancellationPolicy: 'strict',
    delivery: { airport: true, home: true, hotel: false, business: false, radiusKm: 20, fee: 3000 },
  },
  pricing: { dailyPrice: 5000, currency: 'USD' },
  ...over,
});

/** Presign, PUT the bytes, attach to the listing. */
async function uploadPhoto(token, vehicleId) {
  const t = (
    await call('POST', '/media/upload-urls', {
      token,
      body: { category: 'vehicle_photo', count: 1, contentType: 'image/png' },
    })
  ).body.data[0];
  const put = await fetch(t.uploadUrl, {
    method: 'PUT',
    body: PNG,
    headers: { 'Content-Type': 'image/png' },
  });
  if (!put.ok) throw new Error(`storage PUT failed: ${put.status}`);
  await call('POST', `/vehicles/${vehicleId}/photos`, {
    token,
    body: { photos: [{ url: t.publicUrl, key: t.key }] },
  });
  return { key: t.key, url: t.publicUrl };
}

(async () => {
  console.log('\nListing CRUD + photo rules\n');
  const token = await newHost('crud');
  const minPhotos = (await call('GET', '/vehicles/requirements')).body?.data?.minPhotos ?? 4;

  section('Create / read');
  const created = await call('POST', '/vehicles', { token, body: draft() });
  const id = created.body?.data?._id;
  ok('create listing', created.ok && !!id, JSON.stringify(created.body?.error ?? ''));
  if (!id) {
    console.log('\ncannot continue\n');
    process.exit(1);
  }
  const read = await call('GET', `/vehicles/${id}`);
  ok('read listing', read.ok && read.body.data.make === 'Honda');

  section('Photos are compulsory');
  let s = await call('POST', `/vehicles/${id}/submit`, { token });
  ok(
    'submit blocked with 0 photos',
    s.status === 409 && s.body?.error?.code === 'PHOTOS_REQUIRED',
    `${s.status}`,
  );

  const keys = [];
  for (let i = 0; i < minPhotos; i += 1) {
    keys.push((await uploadPhoto(token, id)).key);
  }
  let v = (await call('GET', `/vehicles/${id}`)).body.data;
  ok(`${minPhotos} photos attached`, v.photos.length === minPhotos, String(v.photos.length));
  ok('first photo auto-became cover', !!v.photos[0].isCover);

  const img = await fetch(v.photos[0].url);
  ok(
    'photo URL actually renders (not 403)',
    img.status === 200 && (img.headers.get('content-type') || '').startsWith('image/'),
    `${img.status}`,
  );

  // helmet's default `same-origin` CORP makes the browser refuse to paint an
  // image served from the API origin into the web app. curl never sees it, so
  // assert the header explicitly rather than trusting the 200 above.
  const redirect = await fetch(v.photos[0].url, { redirect: 'manual' });
  ok(
    'photo is embeddable cross-origin (CORP header)',
    redirect.headers.get('cross-origin-resource-policy') === 'cross-origin',
    String(redirect.headers.get('cross-origin-resource-policy')),
  );

  s = await call('POST', `/vehicles/${id}/submit`, { token });
  ok(`submit allowed with ${minPhotos} photos`, s.ok, `${s.status}`);

  section('Photo management');
  await call('PUT', `/vehicles/${id}/photos/cover`, { token, body: { key: keys[2] } });
  v = (await call('GET', `/vehicles/${id}`)).body.data;
  ok(
    'set cover moves the flag',
    v.photos.find((p) => p.key === keys[2]).isCover && !v.photos.find((p) => p.key === keys[0]).isCover,
  );

  const del = await call('DELETE', `/vehicles/${id}/photos`, { token, body: { key: keys[0] } });
  ok('delete photo', del.ok && del.body.data.photos.length === minPhotos - 1);
  const missing = await call('DELETE', `/vehicles/${id}/photos`, {
    token,
    body: { key: 'vehicle_photo/2020/01/nobody/x.png' },
  });
  ok('deleting a non-existent photo 404s', missing.status === 404, `${missing.status}`);

  section('Partial updates must not wipe other settings');
  const id2 = (await call('POST', '/vehicles', { token, body: draft() })).body.data._id;

  const a = await call('PATCH', `/vehicles/${id2}`, { token, body: { listing: { title: 'Updated Civic' } } });
  ok('patch with ONLY a title is accepted', a.ok, `${a.status} ${JSON.stringify(a.body?.error ?? '')}`);
  let f = (await call('GET', `/vehicles/${id2}`)).body.data;
  ok('instantBook survived a title edit', f.listing.instantBook === true, String(f.listing.instantBook));
  ok('cancellationPolicy survived', f.listing.cancellationPolicy === 'strict', f.listing.cancellationPolicy);
  ok(
    'delivery survived',
    f.listing.delivery.airport === true && f.listing.delivery.fee === 3000,
    JSON.stringify(f.listing.delivery),
  );

  const b = await call('PATCH', `/vehicles/${id2}`, {
    token,
    body: { listing: { instantBook: false, cancellationPolicy: 'flexible' } },
  });
  ok('patch with ONLY trip prefs is accepted', b.ok, `${b.status} ${JSON.stringify(b.body?.error ?? '')}`);
  f = (await call('GET', `/vehicles/${id2}`)).body.data;
  ok('title survived a trip-prefs edit', f.listing.title === 'Updated Civic', f.listing.title);

  await call('PATCH', `/vehicles/${id2}`, { token, body: { listing: { delivery: { hotel: true } } } });
  f = (await call('GET', `/vehicles/${id2}`)).body.data;
  ok(
    'toggling one delivery mode keeps the others',
    f.listing.delivery.hotel === true && f.listing.delivery.airport === true && f.listing.delivery.fee === 3000,
    JSON.stringify(f.listing.delivery),
  );

  const addr = await call('PATCH', `/vehicles/${id2}`, { token, body: { location: { address: '2 Oak St' } } });
  f = (await call('GET', `/vehicles/${id2}`)).body.data;
  ok(
    'address-only patch keeps the coordinates',
    addr.ok && f.location.coordinates[0] === -122.6784 && f.location.address === '2 Oak St',
    JSON.stringify(f.location),
  );
  const halfPoint = await call('PATCH', `/vehicles/${id2}`, { token, body: { location: { lng: -73.9 } } });
  ok('half a coordinate pair is rejected', halfPoint.status === 422, `${halfPoint.status}`);

  section('Authorization');
  const other = await newHost('other');
  const stolenEdit = await call('PATCH', `/vehicles/${id2}`, {
    token: other,
    body: { listing: { title: 'hacked' } },
  });
  ok('another host cannot update my listing', [403, 404].includes(stolenEdit.status), `${stolenEdit.status}`);
  ok(
    'another host cannot delete my photo',
    !(await call('DELETE', `/vehicles/${id}/photos`, { token: other, body: { key: keys[1] } })).ok,
  );
  ok('another host cannot delist my car', !(await call('DELETE', `/vehicles/${id}`, { token: other })).ok);
  ok('anonymous cannot delist', (await call('DELETE', `/vehicles/${id}`)).status === 401);
  ok(
    'private media is refused by the public view route',
    (await call('GET', '/media/view?key=kyc/2026/07/someone/abc.png')).status === 403,
  );

  section('Delete');
  ok('owner can delist', (await call('DELETE', `/vehicles/${id}`, { token })).ok);
  ok(
    'delisted car is no longer listed',
    (await call('GET', `/vehicles/${id}`)).body?.data?.status !== 'listed',
  );

  // Leave no drafts behind — repeated runs would otherwise pile up listings
  // in the host's dashboard.
  await call('DELETE', `/vehicles/${id2}`, { token });

  console.log(`\n  PASS ${pass}   FAIL ${fail}\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
