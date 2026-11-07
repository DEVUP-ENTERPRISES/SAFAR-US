jest.mock('../../payments/infrastructure/gateway.provider', () => {
  const { MockGateway } = jest.requireActual('../../payments/infrastructure/mock.gateway');
  return { paymentGateway: new MockGateway(), stripeGateway: null };
});
jest.mock('../../notifications/application/notification.service', () => ({ notificationService: { send: jest.fn(async () => undefined) } }));
jest.mock('./asset-partner-signing-code', () => ({ assetPartnerSigningCode: { send: jest.fn(async () => ({ sentTo: 'j•••@example.com' })), verify: jest.fn(async () => 'jordan@example.com') } }));
jest.mock('../../vehicles/application/fleet-import.service', () => ({
  fleetImportService: {
    importRows: jest.fn(async (_userId: string, rows: { vin: string; registrationNumber?: string }[]) => {
      const { VehicleModel } = jest.requireActual('../../vehicles/infrastructure/vehicle.model');
      const v = await VehicleModel.create({
        hostId: 'hf-host', vin: rows[0].vin, registrationNumber: rows[0].registrationNumber, year: 2024, make: 'BMW', model: '5 Series',
        category: 'luxury', status: 'draft', seats: 5, fuelType: 'petrol', transmission: 'automatic', bodyType: 'sedan',
        listing: { title: 'BMW 5 Series' }, pricing: { dailyPrice: 9500, currency: 'USD' },
        location: { city: 'Irving', state: 'TX', type: 'Point', coordinates: [-97, 32.8], address: '2400 Aviation Dr, DFW Airport, TX' },
      });
      return [{ vin: rows[0].vin, status: 'created', vehicleId: v._id }];
    }),
  },
}));
jest.mock('../../hosts/application/host.service', () => {
  const { hostService } = jest.requireActual('../../hosts/application/host.service');
  return { hostService: Object.assign(Object.create(hostService), { requireHostForUser: jest.fn(async () => ({ _id: 'hf-host' })) }) };
});

import { assetPartnerApplicationService } from './asset-partner-application.service';
import { assetPartnerService } from './asset-partner.service';
import { assetPartnerProfileService } from './asset-partner-profile.service';
import { assetPartnerFeeService, feeView } from './asset-partner-fee.service';
import { assetPartnerAgreementService } from './asset-partner-agreement.service';
import { assetPartnerCarService } from './asset-partner-car.service';
import { assetPartnerStatementService } from './asset-partner-statement.service';
import { assetPartnerPayoutService } from './asset-partner-payout.service';
import { assetPartnerExitService } from './asset-partner-exit.service';
import { AssetPartnerModel, type AssetPartnerDoc } from '../infrastructure/asset-partner.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { KycModel } from '../../kyc/infrastructure/kyc.model';
import { DocumentModel } from '../../documents/infrastructure/document.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { LedgerModel } from '../../payments/infrastructure/ledger.model';
import { paymentGateway } from '../../payments/infrastructure/gateway.provider';
import { runStripeEvent } from '../../payments/application/stripe-event.handler';
import { notificationService } from '../../notifications/application/notification.service';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';
import type { MockGateway } from '../../payments/infrastructure/mock.gateway';
import type { PortalApplicationDto } from '../dto/asset-partner-application.schemas';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

const OPS = 'ops-user';
const gateway = paymentGateway as unknown as MockGateway;
const DAY = 86_400_000;
const photo = (label: string, n = 1) => ({ url: `https://files.example/${label}-${n}.jpg`, key: `vehicle_photo/${label}-${n}.jpg`, label, sha256: `${label}-${n}`.padEnd(64, '0') });

const application = {
  fullName: 'Jordan Ramirez', partnerType: 'individual', phone: '2145550142', address: '1 Main St', city: 'Dallas', state: 'TX', zip: '75201',
  vehicle: { year: '2024', make: 'BMW', model: '5 Series', mileage: 18400, vin: '1HGCM82633A004352', plate: 'ABC-1234' },
  ownership: 'owned', titleStatus: 'clean', photos: [photo('Front'), photo('Rear'), photo('Odometer')],
  accident: 'no', availability: 'fulltime', acknowledgedAccurate: true, acknowledgedInspection: true, acknowledgedTerms: true,
  signature: 'Jordan Ramirez', signDate: new Date(),
} as PortalApplicationDto;

const stage = async (userId: string) => (await assetPartnerApplicationService.onboarding(userId)).stage;
const sentTemplates = () => (notificationService.send as jest.Mock).mock.calls.map(([n]) => n.templateKey as string);

describe('one Asset Partner, from sign-up to returning their car', () => {
  it('walks every step in order and keeps the money right', async () => {
    // Sign-up: nothing happens until the email is confirmed.
    const user = await UserModel.create({ email: 'jordan@example.com', roles: ['guest'], emailVerified: false });
    const userId = String(user._id);
    expect(await stage(userId)).toBe('verify_email');
    await UserModel.updateOne({ _id: userId }, { $set: { emailVerified: true } });
    expect(await stage(userId)).toBe('apply');

    // Apply: the same picture in two photo slots is refused.
    await expect(assetPartnerApplicationService.createForAccount(userId, { ...application, photos: [photo('Front'), { ...photo('Front'), label: 'Rear' }, photo('Odometer')] }, {}))
      .rejects.toThrow('same picture');
    const app = await assetPartnerApplicationService.createForAccount(userId, application, {});
    expect(await stage(userId)).toBe('review');

    // Ops asks for one specific change; the partner must actually redo it.
    await assetPartnerApplicationService.review(app._id, OPS, 'changes_requested', 'Rear photo is too dark', undefined, undefined, [{ key: 'photo:Rear', note: 'Too dark' }]);
    expect(await stage(userId)).toBe('changes');
    await expect(assetPartnerApplicationService.resubmit(userId, app._id, application)).rejects.toThrow('Still to change');
    const fixed = await assetPartnerApplicationService.resubmit(userId, app._id, { ...application, photos: [photo('Front'), photo('Rear', 2), photo('Odometer')], vehicle: { ...application.vehicle, mileage: 1 } });
    expect(fixed.status).toBe('submitted');
    expect(fixed.vehicle.mileage).toBe(18400);

    // Approve: ops must type this partner's fee.
    await expect(assetPartnerApplicationService.review(app._id, OPS, 'approved')).rejects.toThrow('Enter the registration fee');
    await assetPartnerApplicationService.review(app._id, OPS, 'approved', undefined, undefined, 35_000);
    expect(sentTemplates()).toContain('account.asset_partner_application_approved');

    // Profile, then the Stripe ID check, then the fee.
    expect(await stage(userId)).toBe('profile');
    await assetPartnerProfileService.save(userId, { emergencyContacts: [{ name: 'Ana Ramirez', phone: '(214) 555-0199', relation: 'Sister' }], residency: 'citizen' });
    expect(await stage(userId)).toBe('identity');
    await KycModel.create({ userId, status: 'approved', provider: 'stripe', verifiedFirstName: 'Jordan', verifiedLastName: 'Ramirez' });
    expect(await assetPartnerApplicationService.onboarding(userId)).toMatchObject({ stage: 'fee', fee: { amountCents: 35_000, platformFeeCents: 499, totalCents: 35_499 } });

    // Signing is locked until the fee is paid.
    const before = (await assetPartnerService.getByUserId(userId))!;
    const signInput = (agreementVersion: number, ndaVersion: number) => ({
      agreementVersion, ndaVersion, signedName: 'Jordan Ramirez', licenceNumber: 'D12345678', licenceState: 'tx',
      payout: { method: 'zelle' as const, zelleHandle: 'jordan@example.com', zelleName: 'Jordan Ramirez' }, emailCode: '123456',
    });
    await expect(assetPartnerAgreementService.sign(before, signInput(1, 2), {})).rejects.toThrow('Pay the Asset Partner fee');

    // Pay on Stripe; the webhook lands after the portal already moved on, and nothing is booked twice.
    const page = await assetPartnerFeeService.checkout(userId);
    const sessionId = (await AssetPartnerModel.findById(before._id).lean<AssetPartnerDoc>())!.joiningFee!.sessionId!;
    expect(page.url).toBe(`https://checkout.mock/${sessionId}`);
    const c = gateway.checkouts.get(sessionId)!;
    gateway.checkouts.set(sessionId, { ...c, status: 'complete', paid: true, intentId: 'pi_journey' });
    expect(await stage(userId)).toBe('agreement');
    await runStripeEvent({ id: 'evt_journey', type: 'checkout.session.completed', data: { object: { id: sessionId, metadata: { kind: 'asset_partner_fee', partnerId: before._id } } } });
    expect(feeView((await AssetPartnerModel.findById(before._id).lean<AssetPartnerDoc>())!.joiningFee)).toMatchObject({ status: 'paid', paidCents: 35_499 });
    expect(await LedgerModel.countDocuments({ refType: 'asset_partner_fee' })).toBe(2);

    // Sign the agreement and NDA once ops has published them.
    const agreement = await assetPartnerAgreementService.publish(OPS, { title: 'Asset Partner Agreement', body: 'Vehicle: {{vehicle}}, VIN {{vin}}, owned by {{partner_name}}.' });
    const nda = await assetPartnerAgreementService.publish(OPS, { kind: 'nda', title: 'Non-Disclosure Agreement', body: 'Signed by {{signed_name}}.' });
    const paid = (await assetPartnerService.getByUserId(userId))!;
    const signed = await assetPartnerAgreementService.sign(paid, signInput(agreement.version, nda.version), { ip: '203.0.113.9' });
    expect(signed.agreement).toMatchObject({ version: agreement.version, signedName: 'Jordan Ramirez' });

    // The dashboard opens right after signing; papers are uploaded from there.
    expect(await stage(userId)).toBe('ready');
    await expect(assetPartnerService.requirePortalReady(userId)).resolves.toBeTruthy();
    const checklist = (await assetPartnerApplicationService.onboarding(userId)).documents!;
    expect(checklist.some((d) => !d.uploaded)).toBe(true);
    await expect(assetPartnerService.transition(paid._id, 'active')).rejects.toThrow("can't go live until these papers are in");
    for (const d of checklist) await DocumentModel.create({ ownerId: userId, category: d.category, url: `https://cdn.example.com/${d.category}.pdf` });
    expect((await assetPartnerApplicationService.onboarding(userId)).documents!.every((d) => d.uploaded)).toBe(true);

    // Ops lists the car on the fleet and marks the partner active.
    const listing = await assetPartnerCarService.createListing(app._id, OPS, { address: '2400 Aviation Dr, DFW Airport, TX' });
    expect(await VehicleModel.findById(listing.vehicleId).lean()).toMatchObject({ assetPartnerId: paid._id, hostId: 'hf-host' });
    await assetPartnerService.transition(paid._id, 'active');
    // A finished trip last month shows on the statement and is paid once; the car has been with us since before it.
    const now = new Date();
    const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 10));
    await VehicleModel.updateOne({ _id: listing.vehicleId }, { $set: { status: 'listed', assetPartnerSince: new Date(last.getTime() - 30 * DAY) } });
    const period = `${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, '0')}`;
    await BookingModel.create({
      code: 'T-JOURNEY', guestId: 'guest-1', hostId: 'hf-host', vehicleId: listing.vehicleId, status: 'completed',
      period: { start: last, end: new Date(last.getTime() + 2 * DAY) },
      priceBreakdown: { days: 2, subtotal: { amount: 200_000, currency: 'USD' }, total: { amount: 200_000, currency: 'USD' }, currency: 'USD' },
    });
    const active = (await assetPartnerService.getByUserId(userId))!;
    const net = (await assetPartnerStatementService.statement(active, period)).totals.net;
    expect(net).toBeGreaterThan(0);
    expect(net).toBeLessThan(200_000);
    await assetPartnerPayoutService.record(OPS, { partnerId: active._id, period, amount: net, method: 'zelle', reference: 'ZL-JOURNEY' });
    await expect(assetPartnerPayoutService.record(OPS, { partnerId: active._id, period, amount: net, method: 'zelle', reference: 'ZL-AGAIN' })).rejects.toThrow('already recorded');
    expect((await assetPartnerStatementService.statement(active, period)).paid).toMatchObject({ amount: net, reference: 'ZL-JOURNEY' });
    expect(sentTemplates()).toContain('account.asset_partner_payout_sent');

    // The partner asks for the car back, with the notice period enforced.
    await expect(assetPartnerExitService.requestByPartner(userId, { vehicleIds: [listing.vehicleId], preferredDate: new Date(Date.now() + 5 * DAY), handoverPreference: 'pickup' })).rejects.toThrow('notice');
    const exit = await assetPartnerExitService.requestByPartner(userId, { vehicleIds: [listing.vehicleId], preferredDate: new Date(Date.now() + 31 * DAY), handoverPreference: 'pickup' });
    expect(exit).toMatchObject({ status: 'requested', reason: 'partner_request' });
  });
});
