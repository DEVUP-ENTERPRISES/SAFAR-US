jest.mock('../../payments/infrastructure/gateway.provider', () => ({ paymentGateway: {} }));
jest.mock('../../payments/application/payment.service', () => ({ paymentService: { chargeGuest: jest.fn().mockResolvedValue(true) } }));
jest.mock('../../payments/application/deposit.service', () => ({ depositService: {} }));
jest.mock('../../notifications/application/notification.service', () => ({ notificationService: { send: jest.fn().mockResolvedValue(undefined) } }));
jest.mock('../../audit/application/audit.service', () => ({ auditService: { record: jest.fn().mockResolvedValue(undefined) } }));
jest.mock('../../trips/application/inspection.service', () => ({ inspectionService: { assertBaseline: jest.fn() } }));

import { incidentalsService, assertEvidenceUrl } from './incidentals.service';
import { BookingModel } from '../infrastructure/booking.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  await BookingModel.collection.insertOne({
    _id: 'b1' as never, status: 'completed', guestId: 'g1', hostId: 'h1', incidentals: [],
    period: { end: new Date() }, priceBreakdown: { currency: 'USD', total: { amount: 100_000, currency: 'USD' } },
  });
});

const note = 'Toll road charge on the return leg';

describe('incidentals total cap', () => {
  it('rejects charges past the booking-wide ceiling', async () => {
    await incidentalsService.charge('b1', [{ type: 'toll', amount: 9_000, note, evidenceUrl: 'https://x.test/a' }], 'h-user');
    await incidentalsService.charge('b1', [{ type: 'fine', amount: 20_000, note, evidenceUrl: 'https://x.test/a' }], 'h-user');
    await expect(incidentalsService.charge('b1', [{ type: 'other', amount: 4_000, note, evidenceUrl: 'https://x.test/a' }], 'h-user')).rejects.toMatchObject({ code: 'INCIDENTAL_CAP' });
  });

  it('counts same-type charges together so splitting a charge does not dodge the cap', async () => {
    await incidentalsService.charge('b1', [{ type: 'toll', amount: 4_999, note }], 'h-user');
    await incidentalsService.charge('b1', [{ type: 'toll', amount: 4_998, note }], 'h-user');
    await expect(incidentalsService.charge('b1', [{ type: 'toll', amount: 4_997, note }], 'h-user')).rejects.toMatchObject({ code: 'INCIDENTAL_CAP' });
  });
});

describe('evidence url', () => {
  it('accepts our own trip photo and claim uploads owned by the caller, and nothing else', () => {
    expect(() => assertEvidenceUrl('https://cdn.test/trip_photo/2026/09/u1/abc.jpg', 'u1')).not.toThrow();
    expect(() => assertEvidenceUrl(`https://app.test/media/view?key=${encodeURIComponent('claim/2026/09/u1/a.pdf')}`, 'u1')).not.toThrow();
    expect(() => assertEvidenceUrl('https://cdn.test/trip_photo/2026/09/other/abc.jpg', 'u1')).toThrow();
    expect(() => assertEvidenceUrl('https://evil.test/photo.jpg', 'u1')).toThrow();
  });
});

describe('incidentals guards', () => {
  it('refuses host charges before the trip is completed, but lets the system charge', async () => {
    await BookingModel.updateOne({ _id: 'b1' }, { status: 'active' });
    await expect(incidentalsService.charge('b1', [{ type: 'toll', amount: 500, note }], 'h-user')).rejects.toMatchObject({ code: 'TRIP_NOT_COMPLETED' });
    await expect(incidentalsService.charge('b1', [{ type: 'fuel', qty: 5 }], 'system')).resolves.toMatchObject({ total: 1500 });
  });

  it('caps fuel percentage points and late hours', async () => {
    await expect(incidentalsService.charge('b1', [{ type: 'fuel', qty: 5000 }], 'h-user')).rejects.toThrow(/at most 100/);
    await expect(incidentalsService.charge('b1', [{ type: 'late_return', qty: 500 }], 'h-user')).rejects.toThrow(/at most 72/);
  });
});
