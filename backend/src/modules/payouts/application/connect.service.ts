import Stripe from 'stripe';
import { HostModel } from '../../hosts/infrastructure/host.model';
import { UserModel } from '../../users/infrastructure/user.model';
import { config } from '../../../config';
import { NotFoundError, ExternalServiceError, ConflictError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * Stripe Connect — how a host actually gets paid.
 *
 * Payouts previously moved money on our own ledger and nowhere else: the entry
 * said "paid", the host's bank account never saw a cent. That is the single
 * most dangerous kind of bug in a marketplace, because everything downstream —
 * balances, statements, tax — agrees with a fiction.
 *
 * Connect Express is the right account type here. Stripe hosts the onboarding,
 * collects the bank details, runs KYC and owns the identity documents, so this
 * codebase never handles a bank account number or a passport scan. The host
 * gets a Stripe-branded flow and we get a `chargesEnabled` / `payoutsEnabled`
 * answer we can gate on.
 *
 * The gate matters. Stripe will happily create an account before onboarding is
 * finished, and a transfer to an unverified account fails — so readiness is
 * read from Stripe, never assumed from the fact that a row exists.
 */

export interface ConnectStatus {
  connected: boolean;
  accountId?: string;
  /** Stripe has verified them enough to receive transfers. */
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  /** What Stripe still wants, in its own words. */
  requirementsDue: string[];
  /** Onboarding is unfinished and needs another visit. */
  needsOnboarding: boolean;
}

const NOT_CONNECTED: ConnectStatus = {
  connected: false,
  payoutsEnabled: false,
  chargesEnabled: false,
  requirementsDue: [],
  needsOnboarding: true,
};

export class ConnectService {
  private stripe = config.stripe.enabled ? new Stripe(config.stripe.secretKey!) : null;

  get enabled(): boolean {
    return !!this.stripe;
  }

  /**
   * Create the connected account if the host has none, and return a link to
   * Stripe's onboarding.
   *
   * Account links are single-use and expire in minutes, so one is minted per
   * request rather than stored — a saved link is a broken link.
   */
  async createOnboardingLink(userId: string, returnUrl: string, refreshUrl: string): Promise<{ url: string }> {
    if (!this.stripe) throw new ExternalServiceError('Payouts are not configured on this environment');

    const host = await HostModel.findOne({ userId });
    if (!host) throw new NotFoundError('Host profile');

    let accountId = host.bankingDetails?.stripeConnectedAccountId;

    try {
      if (!accountId) accountId = await this.createAccount(userId, host._id);
      return await this.link(accountId, returnUrl, refreshUrl);
    } catch (err) {
      // A stored account from another Stripe account/mode no longer exists: forget it and start clean.
      if ((err as { code?: string }).code === 'resource_missing' && accountId) {
        logger.warn({ hostId: host._id }, 'stored Stripe Connect account not found, creating a new one');
        await HostModel.updateOne({ _id: host._id }, { $unset: { 'bankingDetails.stripeConnectedAccountId': 1 } });
        return this.link(await this.createAccount(userId, host._id), returnUrl, refreshUrl).catch((e) => this.fail(e));
      }
      return this.fail(err);
    }
  }

  private async createAccount(userId: string, hostId: string): Promise<string> {
    const user = await UserModel.findById(userId).lean<{ email?: string }>();
    const base = {
      email: user?.email,
      // Country drives which requirements Stripe asks for. US-only launch.
      country: 'US',
      business_type: 'individual' as const,
      capabilities: { transfers: { requested: true } },
      metadata: { userId, hostId },
    };
    // Express needs the platform to carry losses; a platform on Stripe-managed risk is refused it, so fall back to Stripe carrying them.
    const account = await this.stripe!.accounts.create({ ...base, type: 'express' }).catch((err: Error) => {
      if (!/losses|Accounts v2|express/i.test(err.message)) throw err;
      logger.warn({ hostId }, 'Express accounts refused for this platform, using Stripe-managed risk accounts');
      return this.stripe!.accounts.create({
        ...base,
        controller: { stripe_dashboard: { type: 'full' }, fees: { payer: 'account' }, losses: { payments: 'stripe' }, requirement_collection: 'stripe' },
      });
    });
    await HostModel.updateOne({ _id: hostId }, { $set: { 'bankingDetails.stripeConnectedAccountId': account.id } });
    logger.info({ hostId, accountId: account.id }, 'Stripe Connect account created');
    return account.id;
  }

  private async link(accountId: string, returnUrl: string, refreshUrl: string): Promise<{ url: string }> {
    const link = await this.stripe!.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      return_url: returnUrl,
      refresh_url: refreshUrl,
    });
    return { url: link.url };
  }

  /** Stripe's own reason, logged and shown, instead of an anonymous 500. */
  private fail(err: unknown): never {
    logger.error({ err: (err as Error).message }, 'Stripe Connect onboarding failed');
    throw new ExternalServiceError(`Could not start payout setup: ${(err as Error).message}`);
  }

  /**
   * Read readiness from Stripe rather than from our own record.
   *
   * A host can start onboarding, abandon it, and come back weeks later; the
   * only source of truth for whether they can be paid is Stripe.
   */
  async status(userId: string): Promise<ConnectStatus> {
    const host = await HostModel.findOne({ userId }).lean<{
      bankingDetails?: { stripeConnectedAccountId?: string };
    }>();
    const accountId = host?.bankingDetails?.stripeConnectedAccountId;
    if (!this.stripe || !accountId) return NOT_CONNECTED;

    try {
      const a = await this.stripe.accounts.retrieve(accountId);
      const due = [
        ...(a.requirements?.currently_due ?? []),
        ...(a.requirements?.past_due ?? []),
      ];
      return {
        connected: true,
        accountId,
        payoutsEnabled: !!a.payouts_enabled,
        chargesEnabled: !!a.charges_enabled,
        requirementsDue: Array.from(new Set(due)),
        needsOnboarding: !a.details_submitted || due.length > 0,
      };
    } catch (err) {
      logger.warn({ accountId, err: (err as Error).message }, 'Connect status lookup failed');
      return { ...NOT_CONNECTED, connected: true, accountId };
    }
  }

  /** Stripe's own dashboard, for a host who wants to change their bank. */
  async dashboardLink(userId: string): Promise<{ url: string }> {
    if (!this.stripe) throw new ExternalServiceError('Payouts are not configured');
    const host = await HostModel.findOne({ userId }).lean<{
      bankingDetails?: { stripeConnectedAccountId?: string };
    }>();
    const accountId = host?.bankingDetails?.stripeConnectedAccountId;
    if (!accountId) throw new ConflictError('This host has no payout account yet', 'NOT_CONNECTED');
    // Only Express accounts have a login link; others sign in to Stripe directly.
    const link = await this.stripe.accounts.createLoginLink(accountId).catch(() => null);
    return { url: link?.url ?? 'https://dashboard.stripe.com' };
  }

  /**
   * Move money to a host's bank.
   *
   * Refuses rather than pretends when the account cannot receive it — a failed
   * transfer recorded as paid is how a marketplace loses track of real money.
   */
  async transfer(
    hostId: string,
    amount: { amount: number; currency: string },
    idempotencyKey: string,
    description: string,
  ): Promise<{ transferId: string }> {
    if (!this.stripe) throw new ExternalServiceError('Payouts are not configured');

    const host = await HostModel.findById(hostId).lean<{
      bankingDetails?: { stripeConnectedAccountId?: string };
    }>();
    const accountId = host?.bankingDetails?.stripeConnectedAccountId;
    if (!accountId) throw new ConflictError('This host has no payout account', 'NOT_CONNECTED');

    const account = await this.stripe.accounts.retrieve(accountId);
    if (!account.payouts_enabled) {
      throw new ConflictError('This host cannot receive payouts yet', 'PAYOUTS_DISABLED');
    }

    try {
      const transfer = await this.stripe.transfers.create(
        {
          amount: amount.amount,
          currency: amount.currency.toLowerCase(),
          destination: accountId,
          description,
          metadata: { hostId },
        },
        { idempotencyKey },
      );
      return { transferId: transfer.id };
    } catch (err) {
      throw new ExternalServiceError(`Stripe transfer failed: ${(err as Error).message}`);
    }
  }
}

export const connectService = new ConnectService();
