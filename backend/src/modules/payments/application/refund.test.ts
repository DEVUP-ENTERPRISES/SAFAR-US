/**
 * Refunds against a real in-memory MongoDB and the mock gateway. The rules
 * under test are the ones that lose money when they are wrong: the card gets
 * back only what the card paid, the wallet gets back only what the wallet paid,
 * an extension is refunded from its own payment, and the ledger balances.
 */

// Never let a test reach the real processor, whatever keys the local env holds.
jest.mock('../infrastructure/gateway.provider', () => ({ paymentGateway: new (jest.requireActual('../infrastructure/mock.gateway').MockGateway)() }));

import { paymentService } from './payment.service';
import { ledgerService } from './ledger.service';
import { Account } from '../domain/ledger.accounts';
import { PaymentModel } from '../infrastructure/payment.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

const BOOKING = 'b-1';
const GUEST = 'guest-1';
const HOST = 'host-1';

async function seedPayment(over: Partial<{ amount: number; wallet: number; earnings: number; commission: number; tax: number; key: string; at: number }> = {}) {
  const amount = over.amount ?? 10_000;
  const wallet = over.wallet ?? 0;
  return PaymentModel.create({
    bookingId: BOOKING,
    userId: GUEST,
    hostId: HOST,
    type: 'booking',
    intentId: `pi_${over.key ?? 'a'}`,
    amount,
    currency: 'USD',
    hostEarnings: over.earnings ?? 8_000,
    commission: over.commission ?? 1_500,
    tax: over.tax ?? 500,
    capturedAmount: amount - wallet,
    walletApplied: wallet,
    status: 'succeeded',
    idempotencyKey: over.key ?? 'a',
  });
}

/** The ledger entry a real wallet spend leaves behind. */
async function seedWalletSpend(amount: number) {
  await ledgerService.post({
    txnId: `wallet_spend_${BOOKING}`,
    refType: 'booking',
    refId: BOOKING,
    currency: 'USD',
    description: 'seed',
    legs: [
      { account: Account.userWallet(GUEST), direction: 'debit', amount },
      { account: Account.cardFunding(), direction: 'credit', amount },
    ],
  });
}

describe('refundBooking', () => {
  it('refunds a card-paid booking to the card only — no wallet credit', async () => {
    await seedPayment();
    await paymentService.refundBooking(BOOKING, { amount: 10_000, currency: 'USD' }, 'cancelled');

    expect(await ledgerService.balance(Account.userWallet(GUEST))).toBe(0);
    const p = await PaymentModel.findOne({ bookingId: BOOKING }).lean();
    expect(p?.refundedAmount).toBe(10_000);
    expect(p?.status).toBe('refunded');
  });

  it('returns only the wallet-funded part to the wallet', async () => {
    await seedPayment({ wallet: 3_000 });
    await seedWalletSpend(3_000);
    await paymentService.refundBooking(BOOKING, { amount: 10_000, currency: 'USD' }, 'cancelled');

    // The spend took 3000 out, the refund puts 3000 back.
    expect(await ledgerService.balance(Account.userWallet(GUEST))).toBe(0);
  });

  it('never credits a wallet part that was not spent', async () => {
    await seedPayment({ wallet: 3_000 });
    await paymentService.refundBooking(BOOKING, { amount: 10_000, currency: 'USD' }, 'cancelled');

    expect(await ledgerService.balance(Account.userWallet(GUEST))).toBe(0);
  });

  it('restores a wallet spend once, and only if it was spent', async () => {
    await paymentService.restoreWallet(BOOKING, GUEST, 3_000, 'USD');
    expect(await ledgerService.balance(Account.userWallet(GUEST))).toBe(0);

    await seedWalletSpend(3_000);
    await paymentService.restoreWallet(BOOKING, GUEST, 3_000, 'USD');
    await paymentService.restoreWallet(BOOKING, GUEST, 3_000, 'USD');
    expect(await ledgerService.balance(Account.userWallet(GUEST))).toBe(0);
  });

  it('reverses host, commission and tax legs in proportion so the books close', async () => {
    await seedPayment();
    await paymentService.refundBooking(BOOKING, { amount: 5_000, currency: 'USD' }, 'half');

    // Half refunded: half of each booking leg is reversed.
    expect(await ledgerService.balance(Account.hostPayable(HOST))).toBe(4_000);
    expect(await ledgerService.balance(Account.platformRevenue())).toBe(750);
    expect(await ledgerService.balance(Account.platformTax())).toBe(250);
  });

  it('refuses to refund more than was paid', async () => {
    await seedPayment();
    await expect(paymentService.refundBooking(BOOKING, { amount: 10_001, currency: 'USD' }, 'too much')).rejects.toMatchObject({
      code: 'REFUND_TOO_LARGE',
    });
  });

  it('spreads a refund across the original payment and an extension', async () => {
    await seedPayment({ amount: 10_000, key: 'a' });
    await seedPayment({ amount: 4_000, earnings: 3_200, commission: 600, tax: 200, key: 'b' });

    await paymentService.refundBooking(BOOKING, { amount: 14_000, currency: 'USD' }, 'full cancel');

    const payments = await PaymentModel.find({ bookingId: BOOKING }).lean();
    expect(payments.map((p) => p.refundedAmount).sort((a, b) => a - b)).toEqual([4_000, 10_000]);
    expect(payments.every((p) => p.status === 'refunded')).toBe(true);
  });

  it('does not refund the same money twice when called again', async () => {
    await seedPayment();
    await paymentService.refundBooking(BOOKING, { amount: 10_000, currency: 'USD' }, 'cancelled');
    await expect(paymentService.refundBooking(BOOKING, { amount: 10_000, currency: 'USD' }, 'again')).rejects.toBeDefined();
  });
});

describe('recordIntentSucceeded', () => {
  it('books a pending payment exactly once', async () => {
    await PaymentModel.create({
      bookingId: BOOKING,
      userId: GUEST,
      hostId: HOST,
      type: 'booking',
      intentId: 'pi_pending',
      amount: 10_000,
      currency: 'USD',
      hostEarnings: 8_000,
      commission: 1_500,
      tax: 500,
      status: 'pending',
      idempotencyKey: 'pending',
    });

    expect(await paymentService.recordIntentSucceeded('pi_pending')).toBe(true);
    expect(await paymentService.recordIntentSucceeded('pi_pending')).toBe(false);

    const p = await PaymentModel.findOne({ intentId: 'pi_pending' }).lean();
    expect(p?.status).toBe('succeeded');
    expect(p?.capturedAmount).toBe(10_000);
    expect(await ledgerService.balance(Account.gatewayClearing())).toBe(10_000);
  });
});
