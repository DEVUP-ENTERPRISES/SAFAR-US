jest.mock('../../../infrastructure/storage/storage.provider', () => ({ storageGateway: { createDownloadUrl: jest.fn(async (k: string) => `https://files.test/${k}`) } }));

import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { tripEvidenceService } from './trip-evidence.service';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { TripModel } from '../infrastructure/trip.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

describe('trip evidence file', () => {
  it('builds one PDF with the booking, readings, photo log and the photos themselves', async () => {
    const jpeg = await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 200, g: 30, b: 30 } } }).jpeg().toBuffer();
    global.fetch = jest.fn(async () => new Response(new Uint8Array(jpeg), { headers: { 'content-type': 'image/jpeg' } })) as unknown as typeof fetch;
    const guest = await UserModel.create({ email: 'tariq@example.com', firstName: 'Tariq', lastName: 'Syed', phone: '+16822033332', roles: ['guest'], status: 'active' });
    await VehicleModel.create({
      _id: 'veh-1', hostId: 'host-1', year: 2024, make: 'Buick', model: 'Envista', category: 'suv', status: 'listed', seats: 5, fuelType: 'petrol',
      transmission: 'automatic', bodyType: 'suv', registrationNumber: 'WRS4980', vin: '1G1ABCDEF12345678', listing: { title: 'Buick' },
      pricing: { dailyPrice: 9500, currency: 'USD' }, location: { city: 'Irving', state: 'TX', type: 'Point', coordinates: [-97, 32.8] },
    });
    const start = new Date(Date.now() - 2 * 86_400_000);
    await BookingModel.create({
      _id: 'bk-1', code: 'TURA-BC15EC', guestId: String(guest._id), hostId: 'host-1', vehicleId: 'veh-1', status: 'in_progress',
      period: { start, end: new Date(Date.now() + 86_400_000) }, priceBreakdown: { days: 3, currency: 'USD', total: { amount: 28500, currency: 'USD' } },
      cancellationPolicy: 'flexible', statusHistory: [{ from: null, to: 'paid', at: start, by: String(guest._id) }],
    });
    await TripModel.create({
      _id: 'trip-1', bookingId: 'bk-1', vehicleId: 'veh-1', guestId: String(guest._id), hostId: 'host-1', status: 'active',
      handover: { at: start, odometerStart: 12000, fuelStart: 90 },
      photos: [
        { url: 'https://cdn.test/a.jpg', key: 'a.jpg', phase: 'pre', byUserId: 'staff-1', at: start, angle: 'front', lat: 32.8, lng: -97, accuracyM: 6, sha256: 'a'.repeat(64), source: 'camera' },
        { url: 'https://cdn.test/b.jpg', key: 'b.jpg', phase: 'pre', byUserId: String(guest._id), at: start, angle: 'vin_plate', locationMissing: true, source: 'camera' },
      ],
    });

    const out = await tripEvidenceService.build('bk-1', 'admin-1');
    expect(out.filename).toBe('catodrive-trip-evidence-TURA-BC15EC.pdf');
    expect(out.pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(out.sha256).toMatch(/^[a-f0-9]{64}$/);
    const doc = await PDFDocument.load(out.pdf);
    expect(doc.getTitle()).toBe('Trip evidence TURA-BC15EC');
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
  });

  it('refuses a booking that does not exist', async () => {
    await expect(tripEvidenceService.build('nope', 'admin-1')).rejects.toThrow('not found');
  });
});
