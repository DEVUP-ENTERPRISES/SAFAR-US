import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { createApp } from '../../../app';
import { websiteClaimService } from '../application/website-claim.service';
import { disclosureService } from '../application/disclosure.service';
import { ConsentRecordModel } from '../../compliance/infrastructure/consent-record.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

let server: Server;
let base = '';

beforeAll(async () => {
  await connectTestDb();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
  await disconnectTestDb();
});
beforeEach(clearTestDb);

const json = async (path: string, init?: RequestInit) => {
  const res = await fetch(`${base}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  return { status: res.status, body: (await res.json().catch(() => null)) as { data?: unknown } | null };
};

describe('public compliance endpoints', () => {
  it('serves approved figures with suspended ones as null, and the current disclosures', async () => {
    await websiteClaimService.seed();
    await disclosureService.seed();
    await websiteClaimService.suspend('staff', 'rating', 'checking the Turo profile');
    const claims = await json('/website/claims');
    expect(claims.status).toBe(200);
    expect(claims.body?.data).toMatchObject({ trips: { display: '5,100+' }, rating: null });
    const d = await json('/website/disclosures');
    expect(d.body?.data).toMatchObject({ version: 1 });
    expect((await json('/website/disclosures/9')).status).toBe(404);
  });

  it('says plainly when no Asset Partner Agreement is published', async () => {
    expect((await json('/legal/asset-partner-agreement')).status).toBe(404);
  });

  it('records a cookie choice and keeps marketing off when the browser sends Global Privacy Control', async () => {
    const visitorId = '6f1c2b3a-1d2e-4f5a-8b9c-0d1e2f3a4b5c';
    const r = await json('/privacy/consent', { method: 'POST', body: JSON.stringify({ visitorId, analytics: true, marketing: true, gpc: true, version: 1, source: 'banner' }) });
    expect(r.status).toBe(201);
    expect(r.body?.data).toMatchObject({ marketing: false, analytics: true });
    expect(await ConsentRecordModel.findOne({ visitorId }).lean()).toMatchObject({ marketing: false, gpc: true });
    expect((await json('/privacy/consent', { method: 'POST', body: JSON.stringify({ visitorId: 'not-a-uuid', analytics: true, marketing: true, gpc: false, version: 1, source: 'banner' }) })).status).toBe(422);
  });

  it('keeps the admin register behind sign-in', async () => {
    expect((await json('/admin/website-claims')).status).toBe(404);
  });
});
