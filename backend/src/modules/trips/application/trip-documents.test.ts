import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { tripDocumentsService } from './trip-documents.service';
import { TripModel } from '../infrastructure/trip.model';
import { TimedViewModel } from '../../media/infrastructure/timed-view.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { DocumentModel } from '../../documents/infrastructure/document.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { AuditLogModel } from '../../audit/infrastructure/audit-log.model';
import { storageGateway } from '../../../infrastructure/storage/storage.provider';
import * as bus from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

const guest = { userId: 'guest', roles: ['guest'], ip: '1.2.3.4', userAgent: 'jest' };

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  jest.restoreAllMocks();
});

const seed = async (opts: { live?: boolean; papers?: ('registration' | 'insurance')[]; expired?: boolean } = {}) => {
  const { live = true, papers = ['registration', 'insurance'], expired = false } = opts;
  await UserModel.collection.insertOne({ _id: 'guest' as never, firstName: 'Ana', lastName: 'Lopez', email: 'ana@example.com' });
  await VehicleModel.collection.insertOne({ _id: 'car' as never, deletedAt: null, location: { type: 'Point', coordinates: [-96.8, 32.8], state: 'TX' } });
  await BookingModel.collection.insertOne({ _id: 'bk' as never, code: 'CD-9', guestId: 'guest', hostId: 'host', vehicleId: 'car', status: 'active' });
  await TripModel.collection.insertOne({
    _id: 'trip' as never, bookingId: 'bk', vehicleId: 'car', guestId: 'guest', hostId: 'host',
    status: live ? 'active' : 'completed', handover: { at: new Date(Date.now() - 3_600_000) },
    ...(live ? {} : { return: { at: new Date() } }),
  });
  for (const category of papers) {
    await DocumentModel.collection.insertOne({
      _id: `doc-${category}` as never, ownerId: 'hostUser', vehicleId: 'car', category, url: 'x',
      key: `${category}/2026/10/hostUser/abc.${category === 'registration' ? 'png' : 'pdf'}`,
      expiresAt: expired ? new Date(Date.now() - 86_400_000) : undefined,
      verification: { status: 'verified' }, deletedAt: null, createdAt: new Date(),
    });
  }
};

const png = () => sharp({ create: { width: 800, height: 500, channels: 3, background: '#ffffff' } }).png().toBuffer();
const pdf = async () => {
  const d = await PDFDocument.create();
  d.addPage([612, 792]);
  d.setTitle('Host private title');
  return Buffer.from(await d.save());
};

describe('car papers during a trip', () => {
  it('shows which papers are on file, without any link or key', async () => {
    await seed({ papers: ['registration'] });
    const s = await tripDocumentsService.status('guest', 'bk');
    expect(s).toMatchObject({ live: true, viewSeconds: 100 });
    expect(s.live && s.documents).toEqual([
      { category: 'registration', label: 'Vehicle registration', available: true, expired: false },
      { category: 'insurance', label: 'Proof of insurance', available: false, expired: false },
    ]);
    expect(JSON.stringify(s)).not.toMatch(/key|url|hostUser/);
  });

  it('refuses anyone but the guest, and any time outside the live trip', async () => {
    await seed({ live: false });
    await expect(tripDocumentsService.status('stranger', 'bk')).rejects.toThrow(/Only the guest/);
    expect(await tripDocumentsService.status('guest', 'bk')).toMatchObject({ live: false });
    await expect(tripDocumentsService.open(guest, 'bk')).rejects.toThrow(/only while your trip is in progress/);
  });

  it('opens for 100 seconds, stores only a hash of the token, audits it and alerts the host once per cooldown', async () => {
    await seed();
    const emit = jest.spyOn(bus, 'emit');
    const v = await tripDocumentsService.open(guest, 'bk');
    expect(v.viewSeconds).toBe(100);
    expect(v.expiresAt.getTime() - Date.now()).toBeGreaterThan(95_000);
    expect(v.documents.map((d) => d.category)).toEqual(['registration', 'insurance']);
    expect(await TimedViewModel.findById(v.token)).toBeNull();
    expect(await TimedViewModel.countDocuments()).toBe(1);

    await tripDocumentsService.open(guest, 'bk');
    expect(emit.mock.calls.filter(([n]) => n === EVENTS.TRIP_DOCUMENTS_OPENED)).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 50));
    expect(await AuditLogModel.countDocuments({ action: 'trip.documents.opened', resourceId: 'bk' })).toBe(2);
  });

  it('serves each file stamped: an image becomes a JPEG, a PDF keeps its pages but loses its metadata', async () => {
    await seed();
    jest.spyOn(storageGateway, 'readObject').mockImplementation(async (key: string) => ({ body: key.endsWith('.png') ? await png() : await pdf() }));
    const v = await tripDocumentsService.open(guest, 'bk');

    const img = await tripDocumentsService.file(guest, 'bk', 'doc-registration', v.token);
    expect(img.contentType).toBe('image/jpeg');
    const meta = await sharp(Buffer.from(img.data, 'base64')).metadata();
    expect(meta.format).toBe('jpeg');
    // The stamp changed the plain white page.
    const { channels } = await sharp(Buffer.from(img.data, 'base64')).stats();
    expect(channels[0].min).toBeLessThan(250);

    const doc = await tripDocumentsService.file(guest, 'bk', 'doc-insurance', v.token);
    expect(doc.contentType).toBe('application/pdf');
    const out = await PDFDocument.load(Buffer.from(doc.data, 'base64'));
    expect(out.getPageCount()).toBe(1);
    expect(out.getTitle()).toBe('Vehicle document');
  });

  it('refuses a file with a wrong token, another user, or once the time is up', async () => {
    await seed();
    jest.spyOn(storageGateway, 'readObject').mockImplementation(async () => ({ body: await png() }));
    const v = await tripDocumentsService.open(guest, 'bk');
    await expect(tripDocumentsService.file(guest, 'bk', 'doc-registration', 'x'.repeat(43))).rejects.toThrow(/closed/);
    await expect(tripDocumentsService.file({ ...guest, userId: 'other' }, 'bk', 'doc-registration', v.token)).rejects.toThrow(/closed/);
    await TimedViewModel.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1) } });
    await expect(tripDocumentsService.file(guest, 'bk', 'doc-registration', v.token)).rejects.toThrow(/closed/);
  });

  it('treats an expired paper as missing, and asks the host for it once per cooldown', async () => {
    await seed({ expired: true });
    await expect(tripDocumentsService.open(guest, 'bk')).rejects.toThrow(/not uploaded the documents yet/);
    const emit = jest.spyOn(bus, 'emit');
    const r = await tripDocumentsService.request(guest, 'bk');
    expect(r).toMatchObject({ alerted: true, missing: ['registration', 'insurance'] });
    expect((await tripDocumentsService.request(guest, 'bk')).alerted).toBe(false);
    expect(emit.mock.calls.filter(([n]) => n === EVENTS.TRIP_DOCUMENTS_REQUESTED)).toHaveLength(1);

    await tripDocumentsService.onUploaded('car', 'registration');
    expect(emit.mock.calls.filter(([n]) => n === EVENTS.TRIP_DOCUMENTS_READY)).toHaveLength(1);
    expect((await TripModel.findById('trip').lean())?.documentsRequestedAt).toBeUndefined();
  });
});
