/**
 * End-to-end proof that supply drives the marketplace surfaces.
 *
 * A host lists a car in a city nobody hardcoded anywhere, an admin verifies it,
 * and it must then appear in /search/facets — which is what the homepage city
 * chips, the search widget, the category carousel and the surge console all
 * render from. Before facets existed, this car was unreachable from the UI.
 *
 * Run: node scripts/facets-e2e.js
 */
const API = process.env.API || 'http://localhost:8080/api/v1';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@cato.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Cato@Admin2026';

// A city deliberately absent from every list the UI used to hardcode.
const CITY = 'Portland';
const COORDS = { lng: -122.6784, lat: 45.5152 };

let pass = 0;
let fail = 0;
function ok(name, cond, detail = '') {
  if (cond) {
    pass += 1;
    console.log(`  [PASS] ${name}`);
  } else {
    fail += 1;
    console.log(`  [FAIL] ${name}${detail ? `  -> ${detail}` : ''}`);
  }
}

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

async function newUser(prefix) {
  const email = `${prefix}${Date.now()}${Math.floor(Math.random() * 1e4)}@test.com`;
  await call('POST', '/auth/register', {
    body: { email, password: 'Test@1234', firstName: prefix, lastName: 'Tester' },
  });
  const r = await call('POST', '/auth/login', { body: { email, password: 'Test@1234' } });
  return { email, token: r.body?.data?.tokens?.accessToken, id: r.body?.data?.user?.id };
}

const cities = (f) => f.cities.map((c) => c.city);

(async () => {
  console.log(`\nMarketplace facets - end-to-end (new city: ${CITY})\n`);

  const before = (await call('GET', '/search/facets')).body?.data;
  ok('facets endpoint is public (no token)', !!before, 'no payload');
  ok(`${CITY} is not in the marketplace yet`, !cities(before).includes(CITY), cities(before).join(', '));

  // 1. A host signs up and lists a car in a brand-new city.
  const host = await newUser('pdxhost');
  const hostRes = await call('POST', '/hosts/onboard', {
    token: host.token,
    body: { displayName: 'Portland Host', bio: 'e2e' },
  });
  ok('host profile created', hostRes.ok, `${hostRes.status} ${JSON.stringify(hostRes.body?.error ?? '')}`);

  // Onboarding grants the host role, but the existing access token was minted
  // before that — re-login so the JWT actually carries vehicle:create.
  const relog = await call('POST', '/auth/login', { body: { email: host.email, password: 'Test@1234' } });
  host.token = relog.body?.data?.tokens?.accessToken ?? host.token;

  const created = await call('POST', '/vehicles', {
    token: host.token,
    body: {
      make: 'Subaru', model: 'Outback', year: 2022, bodyType: 'wagon', category: 'suv',
      transmission: 'automatic', fuelType: 'petrol', seats: 5,
      features: ['awd'],
      photos: [{ url: 'https://example.com/a.jpg', isCover: true }],
      location: { ...COORDS, address: '1 SW Main St', city: CITY },
      listing: {
        title: 'Subaru Outback', description: 'e2e', instantBook: true,
        minTripHours: 24, maxTripHours: 720, cancellationPolicy: 'moderate',
      },
      pricing: { dailyPrice: 9100, currency: 'USD' },
    },
  });
  const vehicleId = created.body?.data?._id;
  ok('vehicle created in the new city', created.ok && !!vehicleId,
    `${created.status} ${JSON.stringify(created.body?.error ?? '')}`);
  if (!vehicleId) {
    console.log('\ncannot continue without a vehicle\n');
    process.exit(1);
  }

  await call('POST', `/vehicles/${vehicleId}/submit`, { token: host.token });

  // 2. Unverified supply must NOT leak into the marketplace.
  const midway = (await call('GET', '/search/facets')).body?.data;
  ok('unverified car does not create a city', !cities(midway).includes(CITY),
    `facets already list ${CITY}`);

  // 3. Admin verifies it.
  const admin = await call('POST', '/auth/login', {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const adminToken = admin.body?.data?.tokens?.accessToken;
  ok('admin signed in', !!adminToken, `${admin.status}`);

  const verified = await call('POST', `/vehicles/${vehicleId}/verify`, { token: adminToken });
  ok('admin verified the listing', verified.ok,
    `${verified.status} ${JSON.stringify(verified.body?.error ?? '')}`);

  // 4. It now drives every marketplace surface.
  const after = (await call('GET', '/search/facets')).body?.data;
  ok(`${CITY} now appears in the city list`, cities(after).includes(CITY), cities(after).join(', '));

  const pdx = after.cities.find((c) => c.city === CITY);
  ok('city carries a real listing count', pdx?.vehicles >= 1, JSON.stringify(pdx));
  ok('city centroid matches the listing', pdx && Math.abs(pdx.lat - COORDS.lat) < 0.5, JSON.stringify(pdx));
  ok('city carries a real from-price', pdx?.fromPrice === 9100, JSON.stringify(pdx));

  const scoped = (await call('GET', `/search/facets?city=${encodeURIComponent(CITY)}`)).body?.data;
  const suv = scoped.categories.find((c) => c.category === 'suv');
  ok('city-scoped categories reflect that city only', scoped.categories.length === 1 && suv?.vehicles === 1,
    JSON.stringify(scoped.categories));

  ok('trust stats moved with real supply', after.stats.vehicles === before.stats.vehicles + 1,
    `${before.stats.vehicles} -> ${after.stats.vehicles}`);

  // 5. The car is genuinely bookable at that origin (the chip actually works).
  const search = await call('GET',
    `/search/vehicles?lng=${COORDS.lng}&lat=${COORDS.lat}&radiusKm=50&limit=10`);
  ok('car is searchable at the city centroid',
    (search.body?.data ?? []).some((v) => v._id === vehicleId), `${search.status}`);

  console.log(`\n  PASS ${pass}   FAIL ${fail}\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
