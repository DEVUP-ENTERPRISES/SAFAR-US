jest.mock('../../payments/infrastructure/gateway.provider', () => {
  const { MockGateway } = jest.requireActual('../../payments/infrastructure/mock.gateway');
  return { paymentGateway: new MockGateway(), stripeGateway: null };
});
jest.mock('../../notifications/application/notification.service', () => ({ notificationService: { send: jest.fn(async () => undefined) } }));
jest.mock('./asset-partner-signing-code', () => ({ assetPartnerSigningCode: { send: jest.fn(), verify: jest.fn(async () => 'jordan@example.com') } }));

import { assetPartnerApplicationService } from './asset-partner-application.service';
import { assetPartnerService } from './asset-partner.service';
import { assetPartnerFeeService, feeView } from './asset-partner-fee.service';
import { assetPartnerProfileService } from './asset-partner-profile.service';
import { assetPartnerAgreementService } from './asset-partner-agreement.service';
import { AssetPartnerModel, type AssetPartnerDoc } from '../infrastructure/asset-partner.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { KycModel } from '../../kyc/infrastructure/kyc.model';
import { LedgerModel } from '../../payments/infrastructure/ledger.model';
import { paymentGateway } from '../../payments/infrastructure/gateway.provider';
import { runStripeEvent } from '../../payments/application/stripe-event.handler';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';
import type { MockGateway } from '../../payments/infrastructure/mock.gateway';
import type { PortalApplicationDto } from '../dto/asset-partner-application.schemas';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

const OPS = 'ops-1';
const gateway = paymentGateway as unknown as MockGateway;

const dto = {
  fullName: 'Jordan Ramirez', partnerType: 'individual', phone: '2145550142', address: '1 Main St', city: 'Dallas', state: 'TX', zip: '75201',
  vehicle: { year: '2024', make: 'BMW', model: '5 Series', mileage: 18400, vin: '1HGCM82633A004352', plate: 'ABC-1234' },
  ownership: 'owned', titleStatus: 'clean',
  photos: [{ url: 'https://files.example/f.jpg', label: 'Front' }, { url: 'https://files.example/r.jpg', label: 'Rear' }, { url: 'https://files.example/o.jpg', label: 'Odometer' }],
  accident: 'no', availability: 'fulltime', acknowledgedAccurate: true, acknowledgedInspection: true, acknowledgedTerms: true,
  signature: 'Jordan Ramirez', signDate: new Date(),
} as PortalApplicationDto;

/** An approved partner who has given an emergency contact and passed the ID check. */
async function partnerAtFee(feeCents = 35_000): Promise<{ userId: string; partner: AssetPartnerDoc }> {
  const user = await UserModel.create({ email: 'jordan@example.com', roles: ['guest'], emailVerified: true });
  const userId = String(user._id);
  const app = await assetPartnerApplicationService.createForAccount(userId, dto, {});
  await assetPartnerApplicationService.review(app._id, OPS, 'approved', undefined, undefined, feeCents);
  await assetPartnerProfileService.save(userId, { emergencyContacts: [{ name: 'Ana Ramirez', phone: '(214) 555-0199', relation: 'Sister' }], residency: 'citizen' });
  await KycModel.create({ userId, status: 'approved', provider: 'stripe', verifiedFirstName: 'Jordan', verifiedLastName: 'Ramirez' });
  return { userId, partner: (await assetPartnerService.getByUserId(userId))! };
}

const payOpenPage = (sessionId: string, intentId = `pi_${sessionId}`) => {
  const c = gateway.checkouts.get(sessionId)!;
  gateway.checkouts.set(sessionId, { ...c, status: 'complete', paid: true, intentId });
};

describe('Asset Partner fee', () => {
  it('charges exactly the amount ops entered, platform fee included, right after the ID check', async () => {
    const { userId, partner } = await partnerAtFee(42_000);
    expect(feeView(partner.joiningFee)).toMatchObject({ status: 'due', amountCents: 41_501, platformFeeCents: 499, totalCents: 42_000 });
    expect(await assetPartnerApplicationService.onboarding(userId)).toMatchObject({ stage: 'fee', fee: { amountCents: 41_501, platformFeeCents: 499, totalCents: 42_000, currency: 'USD' } });
  });

  it('needs ops to enter the registration fee when approving a new partner', async () => {
    const user = await UserModel.create({ email: 'sam@example.com', roles: ['guest'], emailVerified: true });
    const app = await assetPartnerApplicationService.createForAccount(String(user._id), dto, {});
    await expect(assetPartnerApplicationService.review(app._id, OPS, 'approved')).rejects.toThrow('Enter the registration fee');
  });

  it('skips the step, and the platform fee, when ops waives the fee at approval', async () => {
    const { userId, partner } = await partnerAtFee(0);
    expect(feeView(partner.joiningFee)).toMatchObject({ status: 'waived', totalCents: 0 });
    expect((await assetPartnerApplicationService.onboarding(userId)).stage).toBe('agreement');
  });

  it('will not let the partner sign until the fee is paid', async () => {
    const { partner } = await partnerAtFee(20_000);
    await expect(assetPartnerAgreementService.sign(partner, { agreementVersion: 1, ndaVersion: 1, signedName: 'Jordan Ramirez', payout: { method: 'check', payableTo: 'Jordan', mailingAddress: '1 Main St, Dallas' }, emailCode: '123456' }, {}))
      .rejects.toThrow('Pay the Asset Partner fee');
  });

  it('returns the same payment page on a double click, records the payment once, and moves on', async () => {
    const { userId, partner } = await partnerAtFee();
    const [a, b] = await Promise.all([assetPartnerFeeService.checkout(userId), assetPartnerFeeService.checkout(userId)]);
    const again = await assetPartnerFeeService.checkout(userId);
    const sessionId = (await AssetPartnerModel.findById(partner._id).lean<AssetPartnerDoc>())!.joiningFee!.sessionId!;
    expect(again.url).toBe(`https://checkout.mock/${sessionId}`);
    expect(a.url).toBe(again.url);
    expect(b.url).toBe(again.url);

    payOpenPage(sessionId);
    // The partner comes back before the webhook: the portal checks Stripe itself.
    expect((await assetPartnerApplicationService.onboarding(userId)).stage).toBe('agreement');
    // The webhook arrives afterwards and changes nothing.
    await runStripeEvent({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: sessionId, metadata: { kind: 'asset_partner_fee', partnerId: partner._id } } } });

    const after = (await AssetPartnerModel.findById(partner._id).lean<AssetPartnerDoc>())!;
    expect(feeView(after.joiningFee)).toMatchObject({ status: 'paid', paidCents: 35_000 });
    expect(await LedgerModel.countDocuments({ refType: 'asset_partner_fee' })).toBe(2);
    expect(await assetPartnerFeeService.checkout(userId)).toEqual({ paid: true });
  });

  it('closes the open page when ops changes the amount, and refuses changes once paid', async () => {
    const { userId, partner } = await partnerAtFee();
    await assetPartnerFeeService.checkout(userId);
    const first = (await AssetPartnerModel.findById(partner._id).lean<AssetPartnerDoc>())!.joiningFee!.sessionId!;
    await assetPartnerFeeService.setAmount(partner._id, 25_000, OPS);
    expect((await gateway.retrieveCheckout(first)).status).toBe('expired');

    const { url } = await assetPartnerFeeService.checkout(userId);
    expect(url).not.toContain(first);
    const second = (await AssetPartnerModel.findById(partner._id).lean<AssetPartnerDoc>())!.joiningFee!.sessionId!;
    payOpenPage(second);
    await assetPartnerFeeService.onCheckoutCompleted(second);
    await expect(assetPartnerFeeService.setAmount(partner._id, 0, OPS)).rejects.toThrow('already paid');
  });

  it('refunds a second payment instead of keeping it', async () => {
    const { userId, partner } = await partnerAtFee();
    await assetPartnerFeeService.checkout(userId);
    const sessionId = (await AssetPartnerModel.findById(partner._id).lean<AssetPartnerDoc>())!.joiningFee!.sessionId!;
    payOpenPage(sessionId, 'pi_first');
    await assetPartnerFeeService.onCheckoutCompleted(sessionId);
    const refund = jest.spyOn(gateway, 'refund');
    await assetPartnerFeeService.recordPaid(partner._id, { status: 'complete', paid: true, intentId: 'pi_second', amountTotal: 35_499, metadata: {} });
    expect(refund).toHaveBeenCalledWith('pi_second', { amount: 35_499, currency: 'USD' }, 'apfee_dup_pi_second');
  });

  it('gives a fresh page after the old one expires', async () => {
    const { userId, partner } = await partnerAtFee();
    await assetPartnerFeeService.checkout(userId);
    const old = (await AssetPartnerModel.findById(partner._id).lean<AssetPartnerDoc>())!.joiningFee!.sessionId!;
    await gateway.expireCheckout(old);
    const { url } = await assetPartnerFeeService.checkout(userId);
    expect(url).toBeDefined();
    expect(url).not.toContain(old);
  });

  it('lets ops refund a paid fee once, with a reason, and books it back', async () => {
    const { userId, partner } = await partnerAtFee();
    await assetPartnerFeeService.checkout(userId);
    const sessionId = (await AssetPartnerModel.findById(partner._id).lean<AssetPartnerDoc>())!.joiningFee!.sessionId!;
    payOpenPage(sessionId);
    await assetPartnerFeeService.onCheckoutCompleted(sessionId);

    const view = await assetPartnerFeeService.refund(partner._id, OPS, 'Partner withdrew before inspection');
    expect(view).toMatchObject({ status: 'refunded', refundReason: 'Partner withdrew before inspection' });
    await assetPartnerFeeService.refund(partner._id, OPS, 'again');
    expect(await LedgerModel.countDocuments({ refType: 'asset_partner_fee' })).toBe(4);
  });

  it('does not charge a partner who never had a fee set', async () => {
    const { partner } = await assetPartnerService.enrolByEmail({ email: 'owner@example.com', fullName: 'Pat Owner', partnerType: 'individual' });
    expect(feeView(partner.joiningFee).status).toBe('none');
    await expect(assetPartnerFeeService.refund(partner._id, OPS, 'nothing')).rejects.toThrow('no paid fee');
  });
  it('reports registration fee revenue apart from trips: collected, platform part, waiting, refunded, waived', async () => {
    const make = async (email: string) => (await assetPartnerService.enrolByEmail({ email, fullName: email.split('@')[0], partnerType: 'individual' })).partner._id;
    const [paid, due, refunded, waived] = await Promise.all([make('a@example.com'), make('b@example.com'), make('c@example.com'), make('d@example.com')]);
    await assetPartnerFeeService.setAmount(paid, 35_000, OPS);
    await assetPartnerFeeService.setAmount(due, 20_000, OPS);
    await assetPartnerFeeService.setAmount(refunded, 30_000, OPS);
    await assetPartnerFeeService.setAmount(waived, 0, OPS);
    await AssetPartnerModel.updateOne({ _id: paid }, { $set: { 'joiningFee.paidAt': new Date(), 'joiningFee.paidCents': 35_000 } });
    await AssetPartnerModel.updateOne({ _id: refunded }, { $set: { 'joiningFee.paidAt': new Date(), 'joiningFee.paidCents': 30_000, 'joiningFee.refundedAt': new Date() } });

    const r = await assetPartnerFeeService.report();
    expect(r).toMatchObject({ collectedCents: 35_000, platformFeeCents: 499, dueCents: 20_000, refundedCents: 30_000, paidCount: 1, dueCount: 1, refundedCount: 1, waivedCount: 1 });
    expect(r.rows).toHaveLength(4);
    expect(r.rows.find((x) => x.partnerId === paid)).toMatchObject({ status: 'paid', totalCents: 35_000, platformFeeCents: 499 });
  });
});
