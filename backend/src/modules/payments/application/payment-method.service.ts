import { logger } from '../../../infrastructure/logging/logger';
import Stripe from 'stripe';
import { PaymentMethodModel, type PaymentMethodDoc } from '../infrastructure/payment-method.model';
import { config } from '../../../config';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
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

  /** The saved card and Stripe customer to charge off-session, or null when there is none (or no live gateway). */
  async savedCardFor(userId: string): Promise<{ customerId: string; paymentMethodId: string } | null> {
    if (!this.stripe) return null;
    const [card, customerId] = await Promise.all([
      PaymentMethodModel.findOne({ userId, isDefault: true }).lean<{ stripePaymentMethodId?: string }>(),
      this.customerFor(userId).catch(() => null),
    ]);
    return card?.stripePaymentMethodId && customerId ? { customerId, paymentMethodId: card.stripePaymentMethodId } : null;
  }

  /** Whether this guest has a card we can charge off-session (always true with the mock gateway in dev). */
  async hasChargeableCard(userId: string): Promise<boolean> {
    if (!this.stripe) return true;
    return !!(await PaymentMethodModel.exists({ userId, stripePaymentMethodId: { $exists: true, $ne: null } }));
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

    // Live Stripe: the record is built from what Stripe says about the card, never from the client's brand/last4/expiry.
    if (this.stripe) {
      if (!card.stripePaymentMethodId) throw new ValidationError('Add the card through the secure card form');
      const customer = await this.customerFor(userId);
      if (!customer) throw new ValidationError('Could not prepare your account to save a card');
      const pm = await this.stripe.paymentMethods.retrieve(card.stripePaymentMethodId).catch(() => null);
      if (!pm?.card) throw new ValidationError('That card could not be found');
      const owner = typeof pm.customer === 'string' ? pm.customer : pm.customer?.id;
      if (owner && owner !== customer) throw new ForbiddenError('That card belongs to another account');
      // Saved only when it is really attached to this customer, else it could never be charged.
      if (!owner) {
        await this.stripe.paymentMethods.attach(pm.id, { customer }).catch((err) => {
          logger.warn({ err, userId }, 'saved card could not be attached to the Stripe customer');
          throw new ValidationError('We could not save this card. Please try again or use another card.');
        });
      }
      card = { brand: pm.card.brand, last4: pm.card.last4, expMonth: pm.card.exp_month, expYear: pm.card.exp_year, stripePaymentMethodId: pm.id };
      if (count === 0) {
        await this.stripe.customers
          .update(customer, { invoice_settings: { default_payment_method: card.stripePaymentMethodId } })
          .catch((err) => logger.warn({ err, userId }, 'saved card could not be made the customer default'));
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
