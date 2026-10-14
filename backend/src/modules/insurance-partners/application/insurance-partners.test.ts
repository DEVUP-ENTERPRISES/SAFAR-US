/**
 * Insurance partners against a real in-memory MongoDB and the mock gateway:
 * an insurer's premium lands in its own payable account (less our commission),
 * a refund takes it back in proportion, a payout can't exceed what is owed,
 * and checkout only offers plans an approved insurer is licensed to sell.
 */
jest.mock('../../payments/infrastructure/gateway.provider', () => ({ paymentGateway: new (jest.requireActual('../../payments/infrastructure/mock.gateway').MockGateway)() }));
jest.mock('../../platform-config/application/platform-config.service', () => ({
  platformConfigService: {
    get: async () => ({
      insurance: { partnerCommissionBps: 2000 },
      protection: [{ code: 'basic', label: 'Basic', description: '', pricePerDay: 0 }],
    }),
  },
}));

import { paymentService } from '../../payments/application/payment.service';
import { ledgerService } from '../../payments/application/ledger.service';
import { Account } from '../../payments/domain/ledger.accounts';
import { PaymentModel } from '../../payments/infrastructure/payment.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';
import { insurancePartnerService } from './insurance-partner.service';
import { insurancePlanService, insurerPlanCode } from './insurance-plan.service';
import { insurerLedgerService } from './insurer-ledger.service';
import { getProtectionPlan, listProtectionPlans } from '../../pricing/domain/protection-plans';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

const APPLICATION = {
  legalName: 'Example Mutual Insurance Co',
  displayName: 'Example Mutual',
  licenceNumber: 'TX-123456',
  licensedStates: ['tx', 'OK'],
  contactName: 'Pat Doe',
  email: 'pat@example.com',
};

const PLAN = { name: 'Standard', description: 'Lower deductible', pricePerDay: 2000, deductibleCents: 50_000, liabilityLimitCents: 0, coverage: ['Collision'], states: [], categories: [], active: true };

async function approvedInsurer(userId = 'ins-user') {
  const applied = await insurancePartnerService.apply(userId, APPLICATION);
  return insurancePartnerService.review(applied._id, 'staff-1', 'approved');
}

describe('application and review', () => {
  it('normalises states, refuses a second application, and only reviews pending ones', async () => {
    const applied = await insurancePartnerService.apply('u1', APPLICATION);
    expect(applied.status).toBe('pending');
    expect(applied.licensedStates).toEqual(['TX', 'OK']);
    await expect(insurancePartnerService.apply('u1', APPLICATION)).rejects.toThrow('already has');
    await insurancePartnerService.review(applied._id, 'staff', 'rejected', 'Licence expired');
    await expect(insurancePartnerService.review(applied._id, 'staff', 'approved')).rejects.toThrow('pending');
    // A rejected insurer may apply again.
    const again = await insurancePartnerService.apply('u1', APPLICATION);
    expect(again.status).toBe('pending');
    expect(again.reviewNotes).toBeUndefined();
  });

  it('accepts only a licence file the applicant uploaded', async () => {
    await expect(insurancePartnerService.apply('u3', { ...APPLICATION, licenceDoc: { url: 'https://evil.example/licence.pdf' } })).rejects.toThrow('Upload the licence');
    await expect(
      insurancePartnerService.apply('u3', { ...APPLICATION, licenceDoc: { url: 'https://cdn.catodrive.com/insurance/2026/10/someone-else/a.pdf' } }),
    ).rejects.toThrow('Upload the licence');
    const ok = await insurancePartnerService.apply('u3', { ...APPLICATION, licenceDoc: { url: 'https://cdn.catodrive.com/insurance/2026/10/u3/a.pdf' } });
    expect(ok.licenceDoc?.url).toContain('/u3/');
  });

  it('keeps only the last four digits of the bank account', async () => {
    await approvedInsurer('u2');
    const doc = await insurancePartnerService.setPayoutDetails('u2', { accountHolder: 'Example Mutual', bankName: 'Bank', routingNumber: '111000025', accountNumber: '000123456789' });
    expect(doc.payoutDetails).toEqual({ accountHolder: 'Example Mutual', bankName: 'Bank', routingNumber: '111000025', accountLast4: '6789' });
  });
});

describe('plans at checkout', () => {
  it('offers an approved insurer’s active plan only where it is licensed and the plan applies', async () => {
    await approvedInsurer();
    await expect(insurancePlanService.create('ins-user', { ...PLAN, states: ['CA'] })).rejects.toThrow('aren’t licensed in CA');
    const plan = await insurancePlanService.create('ins-user', { ...PLAN, categories: ['SUV'] });

    const inTexas = await listProtectionPlans({ location: { state: 'TX' }, category: 'suv' });
    expect(inTexas.map((p) => p.code)).toEqual(['basic', insurerPlanCode(plan._id)]);
    expect(inTexas[1].insurer?.name).toBe('Example Mutual');
    expect((await listProtectionPlans({ location: { state: 'CA' }, category: 'suv' })).map((p) => p.code)).toEqual(['basic']);
    expect((await listProtectionPlans({ location: { state: 'TX' }, category: 'economy' })).map((p) => p.code)).toEqual(['basic']);

    const resolved = await getProtectionPlan(insurerPlanCode(plan._id), { location: { state: 'TX' }, category: 'suv' });
    expect(resolved.commissionBps).toBe(2000);
    // Outside its licence the plan can't be bought; checkout falls back to our own cheapest tier.
    expect((await getProtectionPlan(insurerPlanCode(plan._id), { location: { state: 'CA' }, category: 'suv' })).code).toBe('basic');
  });

  it('pulls a suspended insurer’s plans from checkout', async () => {
    const insurer = await approvedInsurer();
    await insurancePlanService.create('ins-user', PLAN);
    await insurancePartnerService.setStatus(insurer._id, 'suspended', 'Licence lapsed');
    expect(await listProtectionPlans({ location: { state: 'TX' }, category: 'suv' })).toHaveLength(1);
  });
});

describe('money', () => {
  async function charge(insurerId: string) {
    // $100 total: $70 host, $25 commission (of which $16 is the insurer's premium share), $5 tax.
    return paymentService.chargeForBooking({
      bookingId: 'b-1',
      guestId: 'g-1',
      hostId: 'h-1',
      capture: true,
      total: { amount: 10_000, currency: 'USD' },
      hostEarnings: { amount: 7_000, currency: 'USD' },
      commission: { amount: 2_500, currency: 'USD' },
      tax: { amount: 500, currency: 'USD' },
      insurer: { id: insurerId, share: 1_600 },
      walletApplied: 10_000,
      idempotencyKey: 'k-1',
    });
  }

  it('books the premium share to the insurer and the rest of commission to us', async () => {
    const insurer = await approvedInsurer();
    await charge(insurer._id);
    expect(await ledgerService.debitBalance(Account.insurerPayable(insurer._id))).toBe(1_600);
    expect(await ledgerService.debitBalance(Account.platformRevenue())).toBe(900);
    const p = await PaymentModel.findOne({ bookingId: 'b-1' }).lean();
    expect(p?.insurerShare).toBe(1_600);
  });

  it('takes the premium back in proportion on a refund', async () => {
    const insurer = await approvedInsurer();
    await charge(insurer._id);
    await paymentService.refundBooking('b-1', { amount: 5_000, currency: 'USD' }, 'cancelled');
    expect(await ledgerService.debitBalance(Account.insurerPayable(insurer._id))).toBe(800);
    expect(await ledgerService.debitBalance(Account.platformRevenue())).toBe(450);
  });

  it('records a payout against what is owed and never more', async () => {
    const insurer = await approvedInsurer();
    await charge(insurer._id);
    await expect(insurerLedgerService.recordPayout(insurer._id, 'staff', { amount: 1_601, reference: 'WIRE-1' })).rejects.toThrow('more than');
    await insurerLedgerService.recordPayout(insurer._id, 'staff', { amount: 1_000, reference: 'WIRE-1' });
    const summary = await insurerLedgerService.summary(insurer._id);
    expect(summary).toMatchObject({ balance: 600, earned: 1_600, paidOut: 1_000 });
  });
});
