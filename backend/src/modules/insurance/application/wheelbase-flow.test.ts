import { wheelbaseInsuranceService } from './wheelbase-insurance.service';
import { wheelbaseClaimsService } from './wheelbase-claims.service';
import { listProtectionPlans, getProtectionPlan } from '../../pricing/domain/protection-plans';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { ClaimModel, type ClaimDoc } from '../../claims/infrastructure/claim.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  jest.restoreAllMocks();
  const real = await platformConfigService.get();
  jest.spyOn(platformConfigService, 'get').mockResolvedValue({
    ...real,
    protection: [
      { code: 'basic', label: 'Included', description: '', pricePerDay: 0, wheelbaseTier: 'Essential', deductibleCents: 250_000 },
      { code: 'standard', label: 'Standard', description: 'Lower deductible', pricePerDay: 1500, wheelbaseTier: 'Standard', deductibleCents: 50_000 },
      { code: 'premier', label: 'Premier', description: 'Zero deductible', pricePerDay: 4500 },
    ],
  });
});

const insuredCar = () =>
  VehicleModel.collection.insertOne({
    _id: 'car' as never, year: 2024, make: 'Buick', model: 'Envista', deletedAt: null,
    wheelbase: { rentalId: 504956, name: 'Envista', linkedBy: 'admin', insuranceState: 'approved', planLabel: 'Wheelbase Auto Driving', minRenterAge: 21, found: true, syncedAt: new Date() },
  });

const booking = async (protection = 'standard') => {
  await insuredCar();
  const insurance = await wheelbaseInsuranceService.snapshot('car', protection);
  await BookingModel.collection.insertOne({
    _id: 'bk' as never, code: 'CD-1', guestId: 'guest', hostId: 'host', vehicleId: 'car', status: 'paid',
    period: { start: new Date(), end: new Date(Date.now() + 86_400_000) }, insurance,
  });
};

describe('protection plans', () => {
  it('never offers a paid plan that no Wheelbase tier stands behind', async () => {
    expect((await listProtectionPlans()).map((p) => p.code)).toEqual(['basic', 'standard']);
    expect((await getProtectionPlan('premier')).code).toBe('basic');
  });

  it('records the chosen Wheelbase tier and its deductible on the booking', async () => {
    await booking('standard');
    const b = await BookingModel.findById('bk').lean();
    expect(b!.insurance).toMatchObject({ provider: 'wheelbase', protectionCode: 'standard', wheelbaseTier: 'Standard', deductibleCents: 50_000 });
  });
});

describe('trips reported to Wheelbase', () => {
  it('marks a started trip as owed once, lists it, and records the report', async () => {
    await booking();
    await wheelbaseInsuranceService.markTripReportable('bk');
    await wheelbaseInsuranceService.markTripReportable('bk');
    const pending = await wheelbaseInsuranceService.tripReport('pending');
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ code: 'CD-1', wheelbaseListing: 504956, vehicle: '2024 Buick Envista', protection: 'Standard' });

    expect(await wheelbaseInsuranceService.markReported(['bk'], 'staff', 'WB-778')).toBe(1);
    expect(await wheelbaseInsuranceService.tripReport('pending')).toHaveLength(0);
    expect((await BookingModel.findById('bk').lean())!.insurance!.report).toMatchObject({ status: 'reported', reference: 'WB-778', reportedBy: 'staff' });
  });

  it('ignores a trip on a car with no Wheelbase cover', async () => {
    await BookingModel.collection.insertOne({ _id: 'bk2' as never, code: 'CD-2', guestId: 'g', vehicleId: 'x', period: { start: new Date(), end: new Date() } });
    await wheelbaseInsuranceService.markTripReportable('bk2');
    expect(await wheelbaseInsuranceService.tripReport()).toHaveLength(0);
  });
});

describe('claims filed with Wheelbase', () => {
  const claim = () =>
    ClaimModel.create({ _id: 'cl', type: 'damage', bookingId: 'bk', claimantId: 'host', respondentId: 'guest', description: 'Rear bumper scrape', status: 'opened' });

  it('opens a Wheelbase claim to file on an insured trip, walks its steps, and caps the guest at the deductible', async () => {
    await booking('standard');
    const c = await claim();
    await wheelbaseClaimsService.open(c);
    let doc: ClaimDoc = (await ClaimModel.findById('cl').lean<ClaimDoc>())!;
    expect(doc.insurance).toMatchObject({ provider: 'wheelbase', status: 'to_file', deductibleCents: 50_000 });
    expect(wheelbaseClaimsService.guestCap(doc)).toBeUndefined();

    await expect(wheelbaseClaimsService.update('cl', 'staff', { status: 'paid', payoutCents: 1 })).rejects.toMatchObject({ code: 'INSURANCE_CLAIM_STEP' });
    await expect(wheelbaseClaimsService.update('cl', 'staff', { status: 'filed' })).rejects.toThrow(/claim number/);

    doc = await wheelbaseClaimsService.update('cl', 'staff', { status: 'filed', reference: 'WB-C-12' });
    expect(wheelbaseClaimsService.guestCap(doc)).toBe(50_000);
    doc = await wheelbaseClaimsService.update('cl', 'staff', { status: 'accepted' });
    await expect(wheelbaseClaimsService.update('cl', 'staff', { status: 'paid' })).rejects.toThrow(/what Wheelbase paid/);
    doc = await wheelbaseClaimsService.update('cl', 'staff', { status: 'paid', payoutCents: 180_000 });
    expect(doc.insurance).toMatchObject({ status: 'paid', reference: 'WB-C-12', payoutCents: 180_000 });
    expect(doc.insurance!.history.map((h) => h.status)).toEqual(['to_file', 'filed', 'accepted', 'paid']);
  });

  it('gathers the claim pack Wheelbase needs', async () => {
    await booking('standard');
    await wheelbaseClaimsService.open(await claim());
    const pack = await wheelbaseClaimsService.pack('cl');
    expect(pack).toMatchObject({
      claim: { description: 'Rear bumper scrape', wheelbase: { status: 'to_file' } },
      booking: { code: 'CD-1', protection: 'Standard', deductibleCents: 50_000 },
      vehicle: { description: '2024 Buick Envista', wheelbaseListing: 504956 },
    });
  });

  it('leaves a claim on an uninsured trip alone', async () => {
    await BookingModel.collection.insertOne({ _id: 'bk' as never, code: 'CD-1', guestId: 'g', vehicleId: 'x', period: { start: new Date(), end: new Date() } });
    await wheelbaseClaimsService.open(await claim());
    expect((await ClaimModel.findById('cl').lean())!.insurance).toBeUndefined();
  });
});
