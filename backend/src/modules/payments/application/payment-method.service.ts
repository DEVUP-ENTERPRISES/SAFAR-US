import Stripe from 'stripe';
import { PaymentMethodModel, type PaymentMethodDoc } from '../infrastructure/payment-method.model';
import { config } from '../../../config';
import { NotFoundError } from '../../../core/errors/app-error';
import { randomId } from '../../../shared/utils/uuid';

/**
 * Saved payment methods. In dev (no Stripe key) cards are stored as metadata
 * for the demo flow. With STRIPE_SECRET_KEY, `setupIntent` returns a real
 * Stripe SetupIntent (frontend confirms via Elements) and removal detaches
 * the PaymentMethod from the customer.
 */
export class PaymentMethodService {
  private stripe = config.stripe.enabled ? new Stripe(config.stripe.secretKey!) : null;

  async list(userId: string): Promise<PaymentMethodDoc[]> {
    return PaymentMethodModel.find({ userId }).sort({ isDefault: -1, createdAt: -1 }).lean<PaymentMethodDoc[]>();
  }

  /** Returns a client secret to collect a card (Stripe) or a mock handle (dev). */
  async setupIntent(userId: string): Promise<{ provider: 'mock' | 'stripe'; clientSecret: string }> {
    if (this.stripe) {
      const intent = await this.stripe.setupIntents.create({ metadata: { userId }, usage: 'off_session' });
      return { provider: 'stripe', clientSecret: intent.client_secret! };
    }
    return { provider: 'mock', clientSecret: `seti_mock_${randomId()}` };
  }

  /**
   * Persist a card after collection. In prod, `stripePaymentMethodId` comes
   * from the confirmed SetupIntent; in dev the brand/last4 are supplied directly.
   */
  async save(
    userId: string,
    card: { brand: string; last4: string; expMonth: number; expYear: number; stripePaymentMethodId?: string },
  ): Promise<PaymentMethodDoc> {
    const count = await PaymentMethodModel.countDocuments({ userId });
    const pm = await PaymentMethodModel.create({
      userId,
      provider: card.stripePaymentMethodId ? 'stripe' : 'mock',
      brand: card.brand,
      last4: card.last4,
      expMonth: card.expMonth,
      expYear: card.expYear,
      stripePaymentMethodId: card.stripePaymentMethodId,
      isDefault: count === 0,
    });
    return pm.toObject();
  }

  async remove(userId: string, id: string): Promise<void> {
    const pm = await PaymentMethodModel.findOne({ _id: id, userId });
    if (!pm) throw new NotFoundError('Payment method');
    if (this.stripe && pm.stripePaymentMethodId) {
      await this.stripe.paymentMethods.detach(pm.stripePaymentMethodId).catch(() => undefined);
    }
    await PaymentMethodModel.deleteOne({ _id: id, userId });
    if (pm.isDefault) {
      const next = await PaymentMethodModel.findOne({ userId }).sort({ createdAt: -1 });
      if (next) { next.isDefault = true; await next.save(); }
    }
  }

  async setDefault(userId: string, id: string): Promise<void> {
    await PaymentMethodModel.updateMany({ userId }, { isDefault: false });
    const res = await PaymentMethodModel.updateOne({ _id: id, userId }, { isDefault: true });
    if (res.matchedCount === 0) throw new NotFoundError('Payment method');
  }
}

export const paymentMethodService = new PaymentMethodService();
