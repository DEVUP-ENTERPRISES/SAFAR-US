import Stripe from 'stripe';
import { PaymentMethodModel, type PaymentMethodDoc } from '../infrastructure/payment-method.model';
import { config } from '../../../config';
import { NotFoundError } from '../../../core/errors/app-error';
import { UserModel } from '../../users/infrastructure/user.model';
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

  /**
   * The Stripe Customer for a user, created on demand.
   *
   * A card saved without a customer cannot be charged again — Stripe will not
   * reuse a bare PaymentMethod off-session. The customer is what turns "we
   * stored a card" into "we can bill this booking", so it is created the first
   * time anyone tries to save a card and reused forever after.
   */
  async customerFor(userId: string): Promise<string | null> {
    if (!this.stripe) return null;
    const user = await UserModel.findById(userId).lean<{
      _id: string; email?: string; firstName?: string; lastName?: string; stripeCustomerId?: string;
    }>();
    if (!user) throw new NotFoundError('User');
    if (user.stripeCustomerId) return user.stripeCustomerId;

    const customer = await this.stripe.customers.create({
      email: user.email,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
      metadata: { userId },
    });
    await UserModel.updateOne({ _id: userId }, { $set: { stripeCustomerId: customer.id } });
    return customer.id;
  }

  /** Returns a client secret to collect a card (Stripe) or a mock handle (dev). */
  async setupIntent(userId: string): Promise<{ provider: 'mock' | 'stripe'; clientSecret: string }> {
    if (this.stripe) {
      const customer = await this.customerFor(userId);
      const intent = await this.stripe.setupIntents.create({
        // Without the customer the card is collected and then unusable later.
        customer: customer ?? undefined,
        metadata: { userId },
        usage: 'off_session',
        payment_method_types: ['card'],
      });
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

    // Attach to the customer and make it their default, so a booking can charge
    // it without the guest present. A SetupIntent confirmed with a customer
    // usually attaches already; this is idempotent and covers the case where it
    // was collected without one.
    if (this.stripe && card.stripePaymentMethodId) {
      const customer = await this.customerFor(userId);
      if (customer) {
        await this.stripe.paymentMethods
          .attach(card.stripePaymentMethodId, { customer })
          .catch(() => undefined);
        if (count === 0) {
          await this.stripe.customers
            .update(customer, { invoice_settings: { default_payment_method: card.stripePaymentMethodId } })
            .catch(() => undefined);
        }
      }
    }

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
