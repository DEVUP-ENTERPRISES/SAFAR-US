import { ValidationError } from '../../../core/errors/app-error';
import { Account } from '../../payments/domain/ledger.accounts';
import { ledgerService } from '../../payments/application/ledger.service';
import { BookingModel } from '../../bookings/infrastructure/booking.model';
import { VehicleModel } from '../../vehicles/infrastructure/vehicle.model';
import { InsurerPayoutModel, type InsurerPayoutDoc } from '../infrastructure/insurer-payout.model';
import { uuid } from '../../../shared/utils/uuid';

export interface InsurerPolicy {
  bookingId: string;
  code: string;
  status: string;
  start: Date;
  end: Date;
  plan: string;
  /** What the insurer is owed for this trip, after CatoDrive's commission. */
  premium: number;
  currency: string;
  vehicle: { year?: number; make?: string; model?: string; state?: string } | null;
}

/**
 * An insurer's money, read from its own ledger account: premiums owed less
 * refunds, and what has been paid out. No personal data about guests leaves
 * here - only the trip, the car and the premium.
 */
export class InsurerLedgerService {
  async summary(insurerId: string) {
    const account = Account.insurerPayable(insurerId);
    const [balance, earned, byMonth, policies, payouts] = await Promise.all([
      ledgerService.debitBalance(account),
      ledgerService.sumDebits(account),
      ledgerService.monthlyDebits(account, 12),
      BookingModel.countDocuments({ 'priceBreakdown.protectionInsurer.id': insurerId }).exec(),
      InsurerPayoutModel.aggregate<{ total: number }>([{ $match: { insurerId } }, { $group: { _id: null, total: { $sum: '$amount' } } }]).exec(),
    ]);
    return { balance, earned, paidOut: payouts[0]?.total ?? 0, policies, byMonth, currency: 'USD' };
  }

  async policies(insurerId: string, limit = 50, skip = 0): Promise<{ items: InsurerPolicy[]; total: number }> {
    const filter = { 'priceBreakdown.protectionInsurer.id': insurerId };
    const [rows, total] = await Promise.all([
      BookingModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('code status period vehicleId priceBreakdown.protectionLabel priceBreakdown.protectionPlan priceBreakdown.protectionInsurer priceBreakdown.currency')
        .lean()
        .exec(),
      BookingModel.countDocuments(filter).exec(),
    ]);
    const vehicles = await VehicleModel.find({ _id: { $in: rows.map((r) => r.vehicleId) } })
      .select('year make model location.state')
      .lean()
      .exec();
    const byId = new Map(vehicles.map((v) => [String(v._id), v]));
    const items = rows.map((r) => {
      const v = byId.get(String(r.vehicleId));
      const pb = r.priceBreakdown;
      return {
        bookingId: String(r._id),
        code: r.code,
        status: r.status,
        start: r.period.start,
        end: r.period.end,
        plan: pb?.protectionLabel ?? pb?.protectionPlan ?? '',
        premium: pb?.protectionInsurer?.share?.amount ?? 0,
        currency: pb?.currency ?? 'USD',
        vehicle: v ? { year: v.year, make: v.make, model: v.model, state: v.location?.state } : null,
      };
    });
    return { items, total };
  }

  payouts(insurerId: string): Promise<InsurerPayoutDoc[]> {
    return InsurerPayoutModel.find({ insurerId }).sort({ paidAt: -1 }).limit(100).lean<InsurerPayoutDoc[]>().exec();
  }

  /** Staff record money sent to an insurer; it can never exceed what is owed. */
  async recordPayout(insurerId: string, staffId: string, input: { amount: number; reference: string; note?: string; paidAt?: Date }): Promise<InsurerPayoutDoc> {
    const owed = await ledgerService.debitBalance(Account.insurerPayable(insurerId));
    if (input.amount > owed) throw new ValidationError('That is more than this insurer is owed');
    const id = uuid();
    const txnId = await ledgerService.post({
      txnId: `insurer_payout_${id}`,
      refType: 'insurer_payout',
      refId: id,
      currency: 'USD',
      description: `Payout to insurance partner ${insurerId} (${input.reference})`,
      legs: [
        { account: Account.insurerPayable(insurerId), direction: 'credit', amount: input.amount },
        { account: Account.gatewayClearing(), direction: 'debit', amount: input.amount },
      ],
    });
    const doc = await InsurerPayoutModel.create({
      _id: id,
      insurerId,
      amount: input.amount,
      reference: input.reference,
      note: input.note,
      paidAt: input.paidAt ?? new Date(),
      recordedBy: staffId,
      ledgerTxnId: txnId,
    });
    return doc.toObject();
  }
}

export const insurerLedgerService = new InsurerLedgerService();
