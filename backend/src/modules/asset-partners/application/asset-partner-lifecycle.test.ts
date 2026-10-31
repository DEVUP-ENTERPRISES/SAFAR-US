jest.mock('../../notifications/application/notification.service', () => ({ notificationService: { send: jest.fn(async () => undefined) } }));
jest.mock('../../vehicles/application/vin-decode.service', () => ({
  vinDecodeService: { decodeBatch: jest.fn(async (vins: string[]) => vins.map((vin) => ({ vin, ok: true, year: 2024, make: 'BMW', model: '5 Series' }))) },
}));

import { assetPartnerApplicationService } from './asset-partner-application.service';
import { assetPartnerService } from './asset-partner.service';
import { assetPartnerAgreementService, type SignInput } from './asset-partner-agreement.service';
import { assetPartnerProfileService, namesMatch } from './asset-partner-profile.service';
import { assetPartnerOfferService } from './asset-partner-offer.service';
import { assetPartnerExitService } from './asset-partner-exit.service';
import { assetPartnerPayoutService } from './asset-partner-payout.service';
import { currentPeriod } from './asset-partner-statement.service';
import { AssetPartnerModel, type AssetPartnerDoc } from '../infrastructure/asset-partner.model';
import { AssetPartnerExitModel } from '../infrastructure/asset-partner-exit.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { KycModel } from '../../kyc/infrastructure/kyc.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { MaintenanceModel } from '../../maintenance/infrastructure/maintenance.model';
import { TollAccountModel } from '../../tolls/infrastructure/toll.model';
import { HostStaffModel } from '../../hosts/infrastructure/host-staff.model';
import { notificationService } from '../../notifications/application/notification.service';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';
import type { PortalApplicationDto } from '../dto/asset-partner-application.schemas';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(async () => {
  await clearTestDb();
  jest.clearAllMocks();
});

const OPS = 'ops-manager';
const DAY = 24 * 3600_000;
const SIGN: SignInput = {
  agreementVersion: 1, ndaVersion: 2, signedName: 'Jordan Ramirez', licenceNumber: 'D12345678', licenceState: 'TX',
  payout: { method: 'zelle', zelleHandle: 'jordan@example.com', zelleName: 'Jordan Ramirez' },
};
const CONTACT = { name: 'Ana Ramirez', phone: '(214) 555-0199', relation: 'Sister' };

function dto(): PortalApplicationDto {
  return {
    fullName: 'Jordan Ramirez', partnerType: 'individual', phone: '2145550142', address: '1 Main St', city: 'Dallas', state: 'TX', zip: '75201',
    vehicle: { year: '2024', make: 'BMW', model: '5 Series', mileage: 18400, vin: '1HGCM82633A004352', plate: 'ABC-1234' },
    ownership: 'owned', accident: 'no', smokeFree: 'yes', petFree: 'yes',
    insurance: { carrier: 'State Farm', policyNumber: 'SF-123', coverageType: 'full' }, availability: 'fulltime',
    acknowledgedAccurate: true, acknowledgedInspection: true, acknowledgedTerms: true, signature: 'Jordan Ramirez', signDate: new Date(),
  } as PortalApplicationDto;
}

async function account(): Promise<string> {
  return String((await UserModel.create({ email: 'jordan@example.com', roles: ['guest'], emailVerified: true }))._id);
}

async function publishDocs() {
  await assetPartnerAgreementService.publish(OPS, { title: 'Asset Partner Agreement', body: 'CatoDrive manages the {{vehicle}} owned by {{partner_name}} for a fee of {{management_fee}} of gross revenue, as agreed.' });
  await assetPartnerAgreementService.publish(OPS, { kind: 'nda', title: 'Non-Disclosure Agreement', body: 'The recipient keeps CatoDrive’s confidential information private for three years. Signed by {{signed_name}}.' });
}

async function approved(): Promise<{ userId: string; partner: AssetPartnerDoc }> {
  const userId = await account();
  const app = await assetPartnerApplicationService.createForAccount(userId, dto(), {});
  await assetPartnerApplicationService.review(app._id, OPS, 'approved');
  return { userId, partner: (await assetPartnerService.getByUserId(userId))! };
}

async function car(partnerId: string, over: Record<string, unknown> = {}) {
  return VehicleModel.create({
    hostId: 'hf-host', assetPartnerId: partnerId, assetPartnerSince: new Date(Date.now() - 90 * DAY), year: 2024, make: 'BMW', model: '5 Series', category: 'luxury',
    status: 'listed', seats: 5, registrationNumber: 'ABC-1234', fuelType: 'petrol', transmission: 'automatic', bodyType: 'sedan', listing: { title: 'BMW 5 Series' },
    pricing: { dailyPrice: 12000, currency: 'USD' }, location: { city: 'Dallas', state: 'TX', type: 'Point', coordinates: [-96.8, 32.8] },
    ...over,
  });
}

async function runner(name = 'Sam Reed') {
  const user = await UserModel.create({ email: `${name.split(' ')[0].toLowerCase()}@catodrive.com`, roles: ['guest'], emailVerified: true });
  const staff = await HostStaffModel.create({ hostId: 'hf-host', userId: user._id, email: user.email, name, abilities: [], vehicleIds: [], status: 'active', invitedAt: new Date(), acceptedAt: new Date() });
  return { userId: String(user._id), staffId: String(staff._id) };
}

const photoKey = (ownerId: string, n: number) => `trip_photo/2026/10/${ownerId}/00000000-0000-4000-8000-00000000000${n}.jpg`;

/** Runs the runner's whole checklist for one car. */
async function completeChecklist(exitId: string, userId: string, vehicleId: string) {
  await assetPartnerExitService.updateCar(exitId, userId, vehicleId, {
    items: ['insurance_removed', 'toll_tag_removed', 'gps_removed', 'keys_returned', 'accessories_removed', 'papers_removed', 'interior_checked'].map((key) => ({ key: key as never, done: true })),
    odometer: 21_340,
    fuelLevel: 'half',
    keysReturned: 2,
    addPhotos: Array.from({ length: 8 }, (_, i) => ({ key: photoKey(userId, i), label: `Side ${i}` })),
  });
}

describe('profile and emergency contacts', () => {
  it('needs one to three contacts with real numbers, never the partner’s own, and a visa end date for visa holders', async () => {
    const { userId } = await approved();
    const save = (over: Record<string, unknown> = {}) => assetPartnerProfileService.save(userId, { emergencyContacts: [CONTACT], residency: 'citizen', ...over } as never);
    await expect(save({ emergencyContacts: [] })).rejects.toThrow('at least one');
    await expect(save({ emergencyContacts: [CONTACT, CONTACT, CONTACT, CONTACT] })).rejects.toThrow('up to three');
    await expect(save({ emergencyContacts: [{ ...CONTACT, phone: '555' }] })).rejects.toThrow('area code');
    await expect(save({ emergencyContacts: [{ ...CONTACT, phone: '214-555-0142' }] })).rejects.toThrow('other than your own');
    await expect(save({ emergencyContacts: [CONTACT, { ...CONTACT, name: 'Ben Ramirez' }] })).rejects.toThrow('different phone');
    await expect(save({ residency: 'visa' })).rejects.toThrow('visa ends');
    await expect(save({ residency: 'visa', visaExpiry: new Date(Date.now() - 5 * DAY) })).rejects.toThrow('passed');

    const profile = await save({ residency: 'visa', visaExpiry: new Date(Date.now() + 200 * DAY), representative: { name: 'Lee Park', phone: '4695550123', relation: 'Friend' } });
    expect(profile.emergencyContacts[0]).toMatchObject({ name: 'Ana Ramirez', phone: '2145550199', relation: 'Sister', confirmation: { status: expect.any(String) } });
    expect(profile.representative?.name).toBe('Lee Park');
    expect(profile.completedAt).toBeInstanceOf(Date);
  });

  it('matches the ID name against the application name, ignoring case, accents and middle names', () => {
    expect(namesMatch('JORDAN A RAMIREZ', 'Jordan Ramirez')).toBe(true);
    expect(namesMatch('José Ramírez', 'Jose Luis Ramirez')).toBe(true);
    expect(namesMatch('Pat Smith', 'Jordan Ramirez')).toBe(false);
  });

  it('lets staff confirm an ID in person only with a written reason, and that unlocks signing', async () => {
    const { userId, partner } = await approved();
    await assetPartnerProfileService.save(userId, { emergencyContacts: [CONTACT], residency: 'citizen' });
    expect(await assetPartnerService.portalStage((await assetPartnerService.getById(partner._id)))).toBe('identity');
    await expect(assetPartnerProfileService.overrideIdentity(partner._id, OPS, 'ok')).rejects.toThrow('how you checked');
    await assetPartnerProfileService.overrideIdentity(partner._id, OPS, 'Checked Texas licence in person at the Irving office');
    const id = await assetPartnerProfileService.identity(await assetPartnerService.getById(partner._id));
    expect(id).toMatchObject({ state: 'confirmed_by_staff', nameMatches: null });
    expect(await assetPartnerService.portalStage(await assetPartnerService.getById(partner._id))).toBe('agreement');
  });

  it('a passed ID check stands in for the licence photo in the papers checklist', async () => {
    const { userId, partner } = await approved();
    await KycModel.create({ userId, status: 'approved', provider: 'stripe', verifiedFirstName: 'Jordan', verifiedLastName: 'Ramirez' });
    const list = await assetPartnerService.documentChecklist(partner);
    expect(list.find((d) => d.category === 'kyc')).toMatchObject({ uploaded: true, status: 'verified' });
    expect((await assetPartnerProfileService.identity(partner)).nameMatches).toBe(true);
  });
});

describe('the 25-day offer to sign', () => {
  it('opens when both documents are published, reminds before the end, then lapses and blocks signing', async () => {
    const { userId, partner } = await approved();
    expect(partner.agreementOffer).toBeUndefined();
    await publishDocs();
    // Publishing tells waiting partners in the background; the hourly sweep is the same path, run here to wait for it.
    await assetPartnerOfferService.sweep();
    let p = (await assetPartnerService.getById(partner._id))!;
    const offer = assetPartnerOfferService.state(p)!;
    expect(offer.daysLeft).toBe(25);
    expect(Math.round((offer.expiresAt.getTime() - offer.sentAt.getTime()) / DAY)).toBe(25);

    // Five days out: one reminder, never two.
    const nearEnd = new Date(offer.expiresAt.getTime() - 4 * DAY);
    expect(await assetPartnerOfferService.sweep(nearEnd)).toMatchObject({ reminded: 1 });
    expect(await assetPartnerOfferService.sweep(nearEnd)).toMatchObject({ reminded: 0 });

    const after = new Date(offer.expiresAt.getTime() + 1000);
    expect(await assetPartnerOfferService.sweep(after)).toMatchObject({ expired: 1 });
    expect(notificationService.send).toHaveBeenLastCalledWith(expect.objectContaining({ templateKey: 'account.asset_partner_offer_expired' }));

    await AssetPartnerModel.updateOne({ _id: partner._id }, { $set: { 'agreementOffer.expiresAt': new Date(Date.now() - 1000) } });
    await assetPartnerProfileService.save(userId, { emergencyContacts: [CONTACT], residency: 'citizen' });
    await KycModel.create({ userId, status: 'approved', provider: 'stripe' });
    p = (await assetPartnerService.getById(partner._id))!;
    expect((await assetPartnerApplicationService.onboarding(userId)).stage).toBe('agreement_expired');
    await expect(assetPartnerAgreementService.sign(p, SIGN, {})).rejects.toThrow('ended on');

    // The partner asks for a new copy; ops sends it with a fresh window.
    expect((await assetPartnerOfferService.requestReissue(p))?.reissueRequestedAt).toBeInstanceOf(Date);
    const fresh = await assetPartnerOfferService.reissue(partner._id, OPS);
    expect(fresh).toMatchObject({ expired: false, daysLeft: 25 });
    expect((await assetPartnerService.getById(partner._id)).agreementOffer?.reissues).toBe(1);
    const signed = await assetPartnerAgreementService.sign(await assetPartnerService.getById(partner._id), SIGN, {});
    expect(signed.agreement?.signedAt).toBeTruthy();
    await expect(assetPartnerOfferService.reissue(partner._id, OPS)).rejects.toThrow('already signed');
  });

  it('refuses a new copy while the offer is still open', async () => {
    const { partner } = await approved();
    await publishDocs();
    await expect(assetPartnerOfferService.requestReissue(await assetPartnerService.getById(partner._id))).rejects.toThrow('still open');
  });

  it('opens straight away for partners approved after the documents exist', async () => {
    await publishDocs();
    const { partner } = await approved();
    expect(assetPartnerOfferService.state(partner)?.daysLeft).toBe(25);
  });
});

describe('declining an application', () => {
  it('records reasons and a wait, explains them to the applicant, and blocks reapplying until then', async () => {
    const userId = await account();
    const app = await assetPartnerApplicationService.createForAccount(userId, dto(), {});
    await assetPartnerApplicationService.review(app._id, OPS, 'rejected', 'The car is a 2009 model.', { reasons: ['vehicle_age', 'mileage'], improvements: 'A 2018 or newer car under 80k miles.', reapplyAfterDays: 30 });
    const view = await assetPartnerApplicationService.onboarding(userId);
    expect(view.stage).toBe('rejected');
    expect(view.rejection?.reasons.map((r) => r.code)).toEqual(['vehicle_age', 'mileage']);
    expect(view.rejection?.reasons[0].improve).toMatch(/newer car/);
    expect(view.rejection).toMatchObject({ improvements: 'A 2018 or newer car under 80k miles.', canReapply: false });
    expect(notificationService.send).toHaveBeenLastCalledWith(expect.objectContaining({ body: expect.stringContaining('Why: Vehicle age, Mileage.') }));
    await expect(assetPartnerApplicationService.createForAccount(userId, dto(), {})).rejects.toThrow('You can apply again from');

    await AssetPartnerApplicationModelReset(app._id);
    await expect(assetPartnerApplicationService.createForAccount(userId, dto(), {})).resolves.toMatchObject({ status: 'submitted' });
  });

  it('lets ops allow reapplying straight away', async () => {
    const userId = await account();
    const app = await assetPartnerApplicationService.createForAccount(userId, dto(), {});
    await assetPartnerApplicationService.review(app._id, OPS, 'rejected', 'Fleet is full this month.', { reasons: ['demand'], reapplyAfterDays: 0 });
    expect((await assetPartnerApplicationService.onboarding(userId)).rejection).toMatchObject({ canReapply: true, reapplyAfter: undefined });
    await expect(assetPartnerApplicationService.createForAccount(userId, dto(), {})).resolves.toBeTruthy();
  });
});

async function AssetPartnerApplicationModelReset(id: string) {
  const { AssetPartnerApplicationModel } = await import('../infrastructure/asset-partner-application.model');
  await AssetPartnerApplicationModel.updateOne({ _id: id }, { $set: { 'rejection.reapplyAfter': new Date(Date.now() - 1000) } });
}

describe('returning a car the partner asked for', () => {
  it('respects the notice period, runs the runner checklist, and needs a second person to approve', async () => {
    const { userId, partner } = await approved();
    await AssetPartnerModel.updateOne({ _id: partner._id }, { $set: { status: 'active' } });
    const v = await car(partner._id, { tollTagId: 'TAG-778' });
    await TollAccountModel.create({ agency: 'ntta', nickname: 'Fleet', hostId: 'hf-host', vehicleIds: [String(v._id), 'other-car'] });
    const r = await runner();

    await expect(assetPartnerExitService.requestByPartner(userId, { vehicleIds: [String(v._id)], preferredDate: new Date(Date.now() + 5 * DAY), handoverPreference: 'pickup' })).rejects.toThrow('30 days’ notice');
    await expect(assetPartnerExitService.requestByPartner(userId, { vehicleIds: ['not-mine'], preferredDate: new Date(Date.now() + 31 * DAY), handoverPreference: 'pickup' })).rejects.toThrow('still with CatoDrive');
    const exit = await assetPartnerExitService.requestByPartner(userId, { vehicleIds: [String(v._id)], preferredDate: new Date(Date.now() + 31 * DAY), handoverPreference: 'deliver', deliveryAddress: '1 Main St, Dallas TX' });
    expect(exit).toMatchObject({ status: 'requested', reason: 'partner_request', reference: expect.stringMatching(/^CD-RT-\d{6}$/) });
    await expect(assetPartnerExitService.requestByPartner(userId, { vehicleIds: [String(v._id)], preferredDate: new Date(Date.now() + 40 * DAY), handoverPreference: 'pickup' })).rejects.toThrow('already open');

    await assetPartnerExitService.schedule(exit._id, OPS, { scheduledFor: new Date(Date.now() + 31 * DAY), runnerStaffId: r.staffId });
    expect(notificationService.send).toHaveBeenCalledWith(expect.objectContaining({ userId: r.userId, templateKey: 'ops.asset_partner_return_job' }));
    expect((await assetPartnerExitService.runnerJobs(r.userId))).toHaveLength(1);
    await expect(assetPartnerExitService.runnerDetail(exit._id, 'someone-else')).rejects.toThrow('isn’t assigned to you');

    // A guest trip still on the car stops the start.
    const trip = await BookingModel.collection.insertOne({ _id: 'b1' as never, code: 'C-b1', guestId: 'g', hostId: 'hf-host', vehicleId: String(v._id), status: 'confirmed', period: { start: new Date(Date.now() + DAY), end: new Date(Date.now() + 3 * DAY) } });
    await expect(assetPartnerExitService.start(exit._id, r.userId)).rejects.toThrow('guest trip');
    await BookingModel.collection.updateOne({ _id: trip.insertedId }, { $set: { status: 'cancelled_host' } });

    await assetPartnerExitService.start(exit._id, r.userId);
    expect((await VehicleModel.findById(v._id).lean())?.status).toBe('delisted');
    await expect(assetPartnerExitService.submit(exit._id, r.userId, { to: 'owner', receiverName: 'Jordan Ramirez', receiverSignature: 'Jordan Ramirez', location: '1 Main St', ownerInsuranceConfirmed: true })).rejects.toThrow('Finish these first');
    await expect(assetPartnerExitService.updateCar(exit._id, r.userId, String(v._id), { items: [{ key: 'no_trips', done: true }] })).rejects.toThrow('checked automatically');
    await expect(assetPartnerExitService.updateCar(exit._id, r.userId, String(v._id), { addPhotos: [{ key: photoKey('someone-else', 1) }] })).rejects.toThrow('Upload the file');

    await MaintenanceModel.create({ vehicleId: String(v._id), hostId: 'hf-host', type: 'repair', scheduledFor: new Date(), status: 'scheduled' });
    await completeChecklist(exit._id, r.userId, String(v._id));
    await expect(assetPartnerExitService.submit(exit._id, r.userId, { to: 'owner', receiverName: 'Jordan Ramirez', receiverSignature: 'Jordan Ramirez', location: '1 Main St', ownerInsuranceConfirmed: true })).rejects.toThrow('Repairs closed');
    await MaintenanceModel.updateMany({}, { $set: { status: 'completed' } });

    await expect(assetPartnerExitService.submit(exit._id, r.userId, { to: 'owner', receiverName: 'Jordan Ramirez', receiverSignature: 'J R', location: '1 Main St', ownerInsuranceConfirmed: true })).rejects.toThrow('typing their full name');
    await expect(assetPartnerExitService.submit(exit._id, r.userId, { to: 'owner', receiverName: 'Jordan Ramirez', receiverSignature: 'jordan ramirez', location: '1 Main St', ownerInsuranceConfirmed: false })).rejects.toThrow('own insurance');
    const submitted = await assetPartnerExitService.submit(exit._id, r.userId, { to: 'owner', receiverName: 'Jordan Ramirez', receiverSignature: 'jordan ramirez', location: '1 Main St, Dallas', ownerInsuranceConfirmed: true });
    expect(submitted.status).toBe('submitted');
    expect(submitted.cars[0].checklist.find((i) => i.key === 'no_trips')).toMatchObject({ done: true, auto: true });

    await expect(assetPartnerExitService.approve(exit._id, r.userId)).rejects.toThrow('different team member');
    await assetPartnerExitService.sendBack(exit._id, OPS, 'Retake the odometer photo');
    await expect(assetPartnerExitService.approve(exit._id, OPS)).rejects.toThrow('submitted');
    await assetPartnerExitService.submit(exit._id, r.userId, { to: 'owner', receiverName: 'Jordan Ramirez', receiverSignature: 'Jordan Ramirez', location: '1 Main St, Dallas', ownerInsuranceConfirmed: true });
    const done = await assetPartnerExitService.approve(exit._id, OPS, 'All good');
    expect(done.status).toBe('completed');

    const after = await VehicleModel.findById(v._id).lean();
    expect(after?.assetPartnerEndedAt).toBeInstanceOf(Date);
    expect(after?.tollTagId).toBeUndefined();
    expect((await TollAccountModel.findOne({}).lean())?.vehicleIds).toEqual(['other-car']);
    expect((await assetPartnerService.getById(partner._id)).status).toBe('exited');
    expect(notificationService.send).toHaveBeenLastCalledWith(expect.objectContaining({ userId, templateKey: 'account.asset_partner_return_completed' }));
  });

  it('lets the partner withdraw before the runner starts, and not after', async () => {
    const { userId, partner } = await approved();
    const v = await car(partner._id);
    const exit = await assetPartnerExitService.requestByPartner(userId, { vehicleIds: [String(v._id)], preferredDate: new Date(Date.now() + 31 * DAY), handoverPreference: 'pickup' });
    expect((await assetPartnerExitService.listForPartner(userId)).exits[0]).toMatchObject({ canCancel: true });
    expect((await assetPartnerExitService.cancelByPartner(userId, exit._id)).status).toBe('cancelled');
    await expect(assetPartnerExitService.cancelByPartner(userId, exit._id)).rejects.toThrow('can’t do that now');
  });

  it('keeps a partner who left this month in the payout run', async () => {
    const { partner } = await approved();
    await AssetPartnerModel.updateOne({ _id: partner._id }, { $set: { status: 'exited', exitedAt: new Date() } });
    // The month before the current one on the payout clock, so the test holds at a month boundary.
    const [y, m] = currentPeriod().split('-').map(Number);
    const period = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    const run = await assetPartnerPayoutService.month(period);
    expect(run.rows.find((r) => r.partnerId === partner._id)).toBeUndefined();
    await AssetPartnerModel.updateOne({ _id: partner._id }, { $set: { exitedAt: new Date(`${period}-20T00:00:00Z`) } });
    await car(partner._id);
    expect((await assetPartnerPayoutService.month(period)).rows.find((r) => r.partnerId === partner._id)).toBeTruthy();
  });
});

describe('a partner who can’t be reached', () => {
  it('keeps the car running, holds payouts, and never returns the car', async () => {
    const { userId, partner } = await approved();
    const v = await car(partner._id);
    const exit = await assetPartnerExitService.open(OPS, partner._id, { reason: 'unresponsive' });
    expect(exit).toMatchObject({ status: 'notice' });
    expect((await VehicleModel.findById(v._id).lean())?.status).toBe('listed');
    expect(notificationService.send).toHaveBeenCalledWith(expect.objectContaining({ userId, templateKey: 'account.asset_partner_unreachable_notice' }));
    expect((await assetPartnerService.getById(partner._id)).payoutHold).toMatchObject({ reason: 'unresponsive', exitId: exit._id });
    await expect(assetPartnerPayoutService.record(OPS, { partnerId: partner._id, period: '2026-01', amount: 100, method: 'zelle', reference: 'Z1' })).rejects.toThrow('on hold');

    for (const to of ['partner', 'emergency_contact', 'partner'] as const) await assetPartnerExitService.logAttempt(exit._id, OPS, { channel: 'call', to, outcome: 'no_answer' });
    await AssetPartnerExitModel.updateOne({ _id: exit._id }, { $set: { createdAt: new Date(Date.now() - 400 * DAY) } });
    await expect(assetPartnerExitService.schedule(exit._id, OPS, { scheduledFor: new Date() })).rejects.toThrow('isn’t returned');
    expect((await assetPartnerExitService.detail(exit._id, OPS)).attempts).toHaveLength(3);
  });

  it('closes the case and releases payouts when the partner presses “I’m here”', async () => {
    const { userId, partner } = await approved();
    await car(partner._id);
    const exit = await assetPartnerExitService.open(OPS, partner._id, { reason: 'unresponsive' });
    expect((await assetPartnerExitService.listForPartner(userId)).exits[0]).toMatchObject({ canRespond: true });
    const closed = await assetPartnerExitService.respondByPartner(userId, exit._id);
    expect(closed).toMatchObject({ status: 'cancelled', cancelled: { reason: 'Partner got back in touch' } });
    const after = await assetPartnerService.getById(partner._id);
    expect(after.payoutHold).toBeUndefined();
    expect(after.lastSeenAt).toBeInstanceOf(Date);
  });

  it('puts quiet partners, visas ending soon and missing emergency contacts on the watch list', async () => {
    const { partner } = await approved();
    await AssetPartnerModel.updateOne({ _id: partner._id }, { $set: { status: 'active', lastSeenAt: new Date(Date.now() - 90 * DAY), profile: { emergencyContacts: [CONTACT], residency: 'visa', visaExpiry: new Date(Date.now() + 20 * DAY), completedAt: new Date() } } });
    const quietOnly = await assetPartnerService.enrolByEmail({ email: 'pat@example.com', fullName: 'Pat Owner', partnerType: 'individual' });
    await AssetPartnerModel.updateOne({ _id: quietOnly.partner._id }, { $set: { status: 'active', lastSeenAt: new Date() } });
    const list = await assetPartnerExitService.watchList();
    expect(list.quiet.map((p) => p._id)).toEqual([partner._id]);
    expect(list.visa.map((p) => p._id)).toEqual([partner._id]);
    expect(list.noEmergencyContact.map((p) => p._id)).toEqual([quietOnly.partner._id]);
  });
});

describe('a partner who passed away', () => {
  it('keeps the car earning, holds payouts for the estate, and returns it only with checked papers and an estate payee', async () => {
    const { userId, partner } = await approved();
    await AssetPartnerModel.updateOne({ _id: partner._id }, { $set: { status: 'active' } });
    const v = await car(partner._id);
    const r = await runner();
    await expect(assetPartnerExitService.open(OPS, partner._id, { reason: 'deceased' })).rejects.toThrow('who told us');
    (notificationService.send as jest.Mock).mockClear();
    const exit = await assetPartnerExitService.open(OPS, partner._id, { reason: 'deceased', reportedBy: { name: 'Ana Ramirez', phone: '2145550199', relation: 'Sister' } });
    expect((await VehicleModel.findById(v._id).lean())?.status).toBe('listed');
    const held = await assetPartnerService.getById(partner._id);
    expect(held).toMatchObject({ status: 'active', payoutHold: { reason: 'deceased' } });
    expect(notificationService.send).not.toHaveBeenCalledWith(expect.objectContaining({ userId }));
    expect((await assetPartnerExitService.listForPartner(userId)).exits).toHaveLength(0);

    await expect(assetPartnerExitService.schedule(exit._id, OPS, { scheduledFor: new Date(), runnerStaffId: r.staffId })).rejects.toThrow('estate’s representative');
    await assetPartnerExitService.setEstateContact(exit._id, OPS, { name: 'Ana Ramirez', phone: '2145550199', relation: 'Executor' });
    await assetPartnerExitService.schedule(exit._id, OPS, { scheduledFor: new Date(), runnerStaffId: r.staffId });
    await assetPartnerExitService.start(exit._id, r.userId);
    await completeChecklist(exit._id, r.userId, String(v._id));
    await expect(assetPartnerExitService.submit(exit._id, r.userId, { to: 'owner', receiverName: 'Ana Ramirez', receiverSignature: 'Ana Ramirez', location: 'Irving lot', ownerInsuranceConfirmed: true })).rejects.toThrow('estate’s representative or into storage');
    await assetPartnerExitService.submit(exit._id, r.userId, { to: 'estate', receiverName: 'Ana Ramirez', receiverSignature: 'Ana Ramirez', location: 'Irving lot', ownerInsuranceConfirmed: true });

    await expect(assetPartnerExitService.approve(exit._id, OPS)).rejects.toThrow('death certificate');
    await expect(assetPartnerExitService.addEstateDocument(exit._id, OPS, { kind: 'death_certificate', key: `partner_exit/2026/10/someone-else/00000000-0000-4000-8000-000000000001.pdf` })).rejects.toThrow('Upload the file');
    await assetPartnerExitService.addEstateDocument(exit._id, OPS, { kind: 'death_certificate', key: `partner_exit/2026/10/${OPS}/00000000-0000-4000-8000-000000000001.pdf` });
    await assetPartnerExitService.addEstateDocument(exit._id, OPS, { kind: 'authority', key: `partner_exit/2026/10/${OPS}/00000000-0000-4000-8000-000000000002.pdf` });
    await expect(assetPartnerExitService.verifyEstateDocument(exit._id, OPS, 0)).rejects.toThrow('other than the uploader');
    await assetPartnerExitService.verifyEstateDocument(exit._id, 'ops-2', 0);
    await assetPartnerExitService.verifyEstateDocument(exit._id, 'ops-2', 1);
    await assetPartnerExitService.approve(exit._id, OPS);
    expect((await assetPartnerService.getById(partner._id)).status).toBe('exited');

    await expect(assetPartnerExitService.releaseHold(partner._id, OPS)).rejects.toThrow('payable to');
    await assetPartnerExitService.releaseHold(partner._id, OPS, { payableTo: 'Estate of Jordan Ramirez', mailingAddress: '9 Elm St, Dallas TX 75201' });
    const released = await assetPartnerService.getById(partner._id);
    expect(released.payoutHold).toBeUndefined();
    expect(released.payoutDetails).toMatchObject({ method: 'check', payableTo: 'Estate of Jordan Ramirez' });
  });
});

describe('emergency contacts confirm by text', () => {
  const { channelProviders } = jest.requireActual('../../notifications/infrastructure/channel.providers') as typeof import('../../notifications/infrastructure/channel.providers');
  let texts: { phone?: string; body: string }[] = [];
  beforeEach(() => {
    texts = [];
    jest.spyOn(channelProviders.sms, 'send').mockImplementation(async (req) => {
      texts.push({ phone: req.target.phone, body: req.body });
      return { ok: true, providerId: 'SM1' };
    });
  });
  const tokenOf = (body: string) => /contact-confirm\?t=([A-Za-z0-9_-]+)/.exec(body)![1];

  it('texts each new contact a link; the contact confirms or declines; unchanged contacts are not texted again', async () => {
    const { userId, partner } = await approved();
    await assetPartnerProfileService.save(userId, { emergencyContacts: [CONTACT, { name: 'Ben Lee', phone: '4695550111', relation: 'Friend' }], residency: 'citizen' });
    expect(texts.map((t) => t.phone)).toEqual(['+12145550199', '+14695550111']);
    expect(texts[0].body).toMatch(/^Jordan R\. named you as their emergency contact/);
    const stored = (await assetPartnerService.getById(partner._id)).profile!;
    expect(stored.emergencyContacts.map((c) => c.confirmation?.status)).toEqual(['pending', 'pending']);
    expect(JSON.stringify(stored)).not.toContain(tokenOf(texts[0].body));

    const { assetPartnerContactConfirmService } = await import('./asset-partner-contact-confirm.service');
    const view = await assetPartnerContactConfirmService.view(tokenOf(texts[0].body));
    expect(view).toEqual({ valid: true, expired: false, status: 'pending', partnerName: 'Jordan R.', contactName: 'Ana', role: 'emergency' });
    expect(await assetPartnerContactConfirmService.view('not-a-real-token-123456')).toEqual({ valid: false });
    await assetPartnerContactConfirmService.respond(tokenOf(texts[0].body), 'confirmed', { ip: '203.0.113.5' });
    await assetPartnerContactConfirmService.respond(tokenOf(texts[1].body), 'declined', {});
    expect(notificationService.send).toHaveBeenLastCalledWith(expect.objectContaining({ userId, templateKey: 'account.asset_partner_contact_declined' }));
    // Answering twice changes nothing.
    expect(await assetPartnerContactConfirmService.respond(tokenOf(texts[0].body), 'declined', {})).toEqual({ status: 'confirmed' });

    texts = [];
    await assetPartnerProfileService.save(userId, { emergencyContacts: [CONTACT, { name: 'Cara Diaz', phone: '9725550123', relation: 'Cousin' }], residency: 'citizen' });
    expect(texts.map((t) => t.phone)).toEqual(['+19725550123']);
    const after = (await assetPartnerService.getById(partner._id)).profile!;
    expect(after.emergencyContacts.map((c) => c.confirmation?.status)).toEqual(['confirmed', 'pending']);

    await expect(assetPartnerContactConfirmService.resend(userId, { kind: 'emergency', index: 1 })).rejects.toThrow('wait a few minutes');
    await expect(assetPartnerContactConfirmService.resend(userId, { kind: 'emergency', index: 0 })).rejects.toThrow('already confirmed');
  });

  it('records a text that could not be sent instead of failing the save, and refuses an expired link', async () => {
    (channelProviders.sms.send as jest.Mock).mockResolvedValueOnce({ ok: false, error: 'destination_not_allowed', retryable: false });
    const { userId, partner } = await approved();
    await assetPartnerProfileService.save(userId, { emergencyContacts: [CONTACT], residency: 'citizen' });
    expect((await assetPartnerService.getById(partner._id)).profile!.emergencyContacts[0].confirmation).toMatchObject({ status: 'undeliverable', lastError: 'destination_not_allowed' });

    await AssetPartnerModel.updateOne({ _id: partner._id }, { $set: { 'profile.emergencyContacts.0.confirmation.sentAt': new Date(Date.now() - DAY) } });
    const { assetPartnerContactConfirmService } = await import('./asset-partner-contact-confirm.service');
    await assetPartnerContactConfirmService.resend(userId, { kind: 'emergency', index: 0 });
    const token = tokenOf(texts[texts.length - 1].body);
    await AssetPartnerModel.updateOne({ _id: partner._id }, { $set: { 'profile.emergencyContacts.0.confirmation.expiresAt': new Date(Date.now() - 1000) } });
    expect((await assetPartnerContactConfirmService.view(token)).expired).toBe(true);
    await expect(assetPartnerContactConfirmService.respond(token, 'confirmed', {})).rejects.toThrow('expired');
  });
});
