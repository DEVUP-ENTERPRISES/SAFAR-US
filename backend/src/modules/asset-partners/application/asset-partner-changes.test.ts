jest.mock('../../notifications/application/notification.service', () => ({ notificationService: { send: jest.fn(async () => undefined) } }));

import { assetPartnerApplicationService } from './asset-partner-application.service';
import { AssetPartnerApplicationModel } from '../infrastructure/asset-partner-application.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { DocumentModel } from '../../documents/infrastructure/document.model';
import { notificationService } from '../../notifications/application/notification.service';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';
import type { PortalApplicationDto } from '../dto/asset-partner-application.schemas';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  (notificationService.send as jest.Mock).mockClear();
});

const OPS = 'ops-1';
const h = (c: string) => c.repeat(64);
const photo = (label: string, n: string) => ({ url: `https://files.example/${label}-${n}.jpg`, key: `vehicle_photo/${label}-${n}.jpg`, label, sha256: h(n) });

function dto(over: Partial<PortalApplicationDto> = {}): PortalApplicationDto {
  return {
    fullName: 'Jordan Ramirez', partnerType: 'individual', phone: '2145550142', address: '1 Main St', city: 'Dallas', state: 'TX', zip: '75201',
    vehicle: { year: '2024', make: 'BMW', model: '5 Series', mileage: 18400, vin: '1HGCM82633A004352', plate: 'ABC-1234' },
    ownership: 'owned', titleStatus: 'clean', photos: [photo('Front', 'a'), photo('Rear', 'b'), photo('Odometer', 'c')],
    accident: 'no', availability: 'fulltime', acknowledgedAccurate: true, acknowledgedInspection: true, acknowledgedTerms: true,
    signature: 'Jordan Ramirez', signDate: new Date(),
    ...over,
  } as PortalApplicationDto;
}

async function sentBack(changes: { key: never; note?: string }[] | { key: string; note?: string }[], note?: string) {
  const user = await UserModel.create({ email: 'jordan@example.com', roles: ['guest'], emailVerified: true });
  const userId = String(user._id);
  const app = await assetPartnerApplicationService.createForAccount(userId, dto(), {});
  await assetPartnerApplicationService.review(app._id, OPS, 'changes_requested', note, undefined, undefined, changes as never);
  return { userId, id: app._id };
}

describe('asking for specific changes', () => {
  it('stores exactly what to redo and tells the partner only those items', async () => {
    const { id } = await sentBack([{ key: 'photo:Rear', note: 'Too dark' }, { key: 'insurance' }]);
    const app = await AssetPartnerApplicationModel.findById(id).lean();
    expect(app?.changeRequest?.items.map((i) => i.key)).toEqual(['photo:Rear', 'insurance']);
    expect(app?.changeRequest?.items.map((i) => i.label)).toEqual(['Rear photo', 'Insurance details']);
    const sent = (notificationService.send as jest.Mock).mock.calls.map((c) => c[0]).find((n) => n.templateKey === 'account.asset_partner_application_changes_requested');
    expect(sent.body).toContain('Rear photo (Too dark)');
    expect(sent.body).toContain('Insurance details');
  });

  it('still needs a note or at least one item', async () => {
    const user = await UserModel.create({ email: 'jordan@example.com', roles: ['guest'], emailVerified: true });
    const app = await assetPartnerApplicationService.createForAccount(String(user._id), dto(), {});
    await expect(assetPartnerApplicationService.review(app._id, OPS, 'changes_requested')).rejects.toThrow('Add a note');
  });

  it('refuses the resubmission until every requested item has changed', async () => {
    const { userId, id } = await sentBack([{ key: 'photo:Rear' }, { key: 'details' }]);
    await expect(assetPartnerApplicationService.resubmit(userId, id, dto())).rejects.toThrow('Still to change: Rear photo, Car details');
    await expect(assetPartnerApplicationService.resubmit(userId, id, dto({ photos: [photo('Front', 'a'), photo('Rear', 'z'), photo('Odometer', 'c')] })))
      .rejects.toThrow(/Still to change: Car details/);
  });

  it('refuses the same picture uploaded again under a new file name', async () => {
    const { userId, id } = await sentBack([{ key: 'photo:Rear' }]);
    const again = { ...photo('Rear', 'b'), url: 'https://files.example/rear-new.jpg', key: 'vehicle_photo/rear-new.jpg' };
    await expect(assetPartnerApplicationService.resubmit(userId, id, dto({ photos: [photo('Front', 'a'), again, photo('Odometer', 'c')] }))).rejects.toThrow('Rear photo');
  });

  it('refuses one picture used for two slots', async () => {
    const { userId, id } = await sentBack([{ key: 'photo:Rear' }]);
    const front = photo('Front', 'a');
    await expect(assetPartnerApplicationService.resubmit(userId, id, dto({ photos: [front, { ...front, label: 'Rear', url: 'https://files.example/x.jpg', key: 'x' }, photo('Odometer', 'c')] })))
      .rejects.toThrow('same picture');
  });

  it('takes only the requested items, keeps the rest, and shows ops what changed', async () => {
    const { userId, id } = await sentBack([{ key: 'photo:Rear' }]);
    const sneaky = dto({ photos: [photo('Front', 'a'), photo('Rear', 'd'), photo('Odometer', 'c')], vehicle: { ...dto().vehicle, mileage: 1 } });
    const done = await assetPartnerApplicationService.resubmit(userId, id, sneaky);
    expect(done.status).toBe('submitted');
    expect(done.vehicle.mileage).toBe(18400);
    expect(done.photos.find((p) => p.label === 'Rear')?.sha256).toBe(h('d'));
    expect(done.changeRequest).toBeUndefined();
    expect(done.resubmission).toMatchObject({ changed: ['photo:Rear'], before: { 'photo:Rear': { sha256: h('b') } } });
  });

  it('counts a requested paper only when a new one is uploaded', async () => {
    const { userId, id } = await sentBack([{ key: 'paper:insurance' }]);
    await expect(assetPartnerApplicationService.resubmit(userId, id, dto())).rejects.toThrow('Insurance declarations page');
    await DocumentModel.create({ ownerId: userId, category: 'insurance', url: 'https://files.example/dec.pdf' });
    expect((await assetPartnerApplicationService.resubmit(userId, id, dto())).status).toBe('submitted');
  });

  it('keeps the old whole-form flow when ops only wrote a note', async () => {
    const { userId, id } = await sentBack([], 'Please fix the plate');
    const done = await assetPartnerApplicationService.resubmit(userId, id, dto({ vehicle: { ...dto().vehicle, plate: 'XYZ-9' } }));
    expect(done.vehicle.plate).toBe('XYZ-9');
    expect(done.resubmission).toBeUndefined();
  });
});
