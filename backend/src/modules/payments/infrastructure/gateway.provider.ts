import { config } from '../../../config';
import { logger } from '../../../infrastructure/logging/logger';
import type { PaymentGateway } from '../domain/payment-gateway';
import { MockGateway } from './mock.gateway';
import { StripeGateway } from './stripe.gateway';

/**
 * Composition point: use real Stripe when a secret key is configured,
 * otherwise the in-memory mock for local dev. Business logic depends only on
 * the PaymentGateway interface, so this is the ONLY place that changes.
 */
const stripe = config.stripe.enabled ? new StripeGateway(config.stripe.secretKey!) : null;

export const paymentGateway: PaymentGateway = stripe ?? new MockGateway();

/** Concrete Stripe instance for webhook signature verification (null in dev). */
export const stripeGateway = stripe;

logger.info(`Payment gateway: ${config.stripe.enabled ? 'Stripe (live)' : 'Mock (dev)'}`);
