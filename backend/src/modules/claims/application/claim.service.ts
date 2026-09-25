import { ClaimModel, type ClaimDoc, type ClaimStatus } from '../infrastructure/claim.model';
import { NotFoundError, ForbiddenError, ConflictError } from '../../../core/errors/app-error';
import { ledgerService } from '../../payments/application/ledger.service';
import { Account } from '../../payments/domain/ledger.accounts';
import { UserModel } from '../../users/infrastructure/user.model';
import { logger } from '../../../infrastructure/logging/logger';
import { paymentService } from '../../payments/application/payment.service';
import { depositService } from '../../payments/application/deposit.service';
import { notificationService } from '../../notifications/application/notification.service';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { TripModel } from '../../trips/infrastructure/trip.model';
import { damageReviewService } from '../../ai/application/damage-review.service';
import type { DamageAssessmentDoc } from '../../ai/infrastructure/damage-assessment.model';

export interface CreateClaimInput {
  type: 'damage' | 'insurance' | 'dispute';
  bookingId?: string;
  tripId?: string;
  hostId?: string;
  description: string;
  evidence?: { url: string; kind: 'image' | 'file'; note?: string }[];
  amountClaimed?: number;
}

export class ClaimService {
  async create(claimantId: string, rawInput: CreateClaimInput): Promise<ClaimDoc> {
    const now = new Date();
    const input = await this.scopeToParticipant(claimantId, rawInput);

    /*
     * A finished trip must actually finish.
     *
     * Damage claimed days after a car was handed back is the loudest complaint
     * in this market: the guest has no way to disprove it and no idea when they
     * are safe from being charged. So a damage claim has a deadline, and it has
     * to be argued against photographs rather than memory.
     *
     * Only damage claims are gated. An insurance matter or a payment dispute
     * can legitimately surface much later and has nothing to do with the car's
     * condition at handover.
     */
    if (input.type === 'damage' && input.bookingId) {
      const cfg = (await platformConfigService.get()).claims;
      const { BookingModel } = await import('../../bookings/infrastructure/booking.model');
      const booking = await BookingModel.findOne({ _id: input.bookingId })
        .select('period status')
        .lean<{ period: { end: Date }; status: string } | null>();

      if (booking) {
        const { bookingService } = await import('../../bookings/application/booking.service');
        const { inspectionService } = await import('../../trips/application/inspection.service');
        const full = await bookingService.getDoc(input.bookingId);
        // Only the host side needs a baseline; a guest reporting damage is not billing anyone.
        if (full.guestId !== claimantId) await inspectionService.assertBaseline(full, 'damage');
        const deadline = new Date(booking.period.end).getTime() + cfg.filingWindowHours * 3_600_000;
        if (now.getTime() > deadline) {
          throw new ConflictError(
            `Damage must be reported within ${cfg.filingWindowHours}h of the trip ending. This trip is closed.`,
            'CLAIM_WINDOW_CLOSED',
          );
        }
      }

      if (cfg.requireEvidence && !(input.evidence ?? []).some((e) => e.kind === 'image')) {
        throw new ConflictError(
          'A damage claim needs at least one photo. Photos taken at handover are what make a claim resolvable.',
          'EVIDENCE_REQUIRED',
        );
      }
    }

    const respondentId = await this.resolveRespondent(claimantId, input);

    const claim = await ClaimModel.create({
      ...input,
      claimantId,
      respondentId,
      evidence: (input.evidence ?? []).map((e) => ({ ...e, addedBy: claimantId })),
      status: 'opened',
      timeline: [{ status: 'opened', at: now, by: claimantId, note: 'Claim filed' }],
    });

    // Best-effort: the objective pre/post comparison both sides will see is
    // more useful ready before anyone has to ask for it. Never blocks or
    // fails claim creation — a claim must exist even if the AI call does not.
    if (input.type === 'damage' && input.tripId) {
      const tripId = input.tripId;
      damageReviewService
        .get(tripId)
        .then((existing) => (existing ? undefined : damageReviewService.review(tripId, claimantId)))
        .catch((err) => logger.warn({ err, tripId, claimId: claim._id }, 'AI damage review kickoff failed'));
    }

    this.notify(respondentId, 'claim.opened', 'A claim was filed against you', 'A claim was opened on one of your trips. Review the evidence and respond.', claim._id);
    return claim.toObject();
  }

  /** A claim may only be filed by the guest or the host side of the booking, and a trip must belong to that booking. */
  private async scopeToParticipant(claimantId: string, input: CreateClaimInput): Promise<CreateClaimInput> {
    const denied = () => new ForbiddenError('You are not a participant of this booking');
    let bookingId = input.bookingId;
    if (input.tripId) {
      const trip = await TripModel.findById(input.tripId).select('bookingId').lean<{ bookingId: string } | null>();
      if (!trip || (bookingId && trip.bookingId !== bookingId)) throw denied();
      bookingId = trip.bookingId;
    }
    if (!bookingId) return { ...input, hostId: undefined };
    const { bookingService } = await import('../../bookings/application/booking.service');
    const booking = await bookingService.getDoc(bookingId).catch(() => null);
    if (!booking) throw denied();
    if (booking.guestId !== claimantId) {
      const { tripService } = await import('../../trips/application/trip.service');
      if (!(await tripService.isHostSideOf(claimantId, booking, 'incident:report'))) throw denied();
    }
    return { ...input, bookingId, hostId: booking.hostId };
  }

  /**
   * Who the claim is against. A claim always names one party against another,
   * but the input only ever carries the filer's side (a host's hostId, a
   * booking) — never a raw userId the filer could point at anyone with.
   */
  private async resolveRespondent(claimantId: string, input: CreateClaimInput): Promise<string | undefined> {
    if (!input.bookingId) return undefined;
    const { bookingService } = await import('../../bookings/application/booking.service');
    const booking = await bookingService.getDoc(input.bookingId);
    if (booking.guestId === claimantId) {
      const { hostService } = await import('../../hosts/application/host.service');
      const host = await hostService.getById(booking.hostId).catch(() => null);
      return host?.userId;
    }
    return booking.guestId;
  }

  /**
   * When does this trip stop being able to cost the guest anything?
   *
   * The point of a filing deadline is only felt if the guest can see it. This
   * answers "am I done?" in a date — and once it passes, says so plainly.
   */
  async settlementStatus(bookingId: string): Promise<{
    closesAt: Date | null;
    closed: boolean;
    hoursRemaining: number | null;
    openClaims: number;
  }> {
    const cfg = (await platformConfigService.get()).claims;
    const { BookingModel } = await import('../../bookings/infrastructure/booking.model');
    const booking = await BookingModel.findOne({ _id: bookingId })
      .select('period status')
      .lean<{ period: { end: Date }; status: string } | null>();
    if (!booking) throw new NotFoundError('Booking');

    const openClaims = await ClaimModel.countDocuments({
      bookingId,
      deletedAt: null,
      status: { $nin: ['settled', 'rejected', 'closed'] },
    });

    // The clock only starts once the trip has actually ended.
    if (booking.status !== 'completed') {
      return { closesAt: null, closed: false, hoursRemaining: null, openClaims };
    }

    const closesAt = new Date(new Date(booking.period.end).getTime() + cfg.filingWindowHours * 3_600_000);
    const msLeft = closesAt.getTime() - Date.now();
    return {
      closesAt,
      // An open claim keeps the trip live regardless of the clock — it is being
      // argued, and saying "closed" while money is still in dispute would be a lie.
      closed: msLeft <= 0 && openClaims === 0,
      hoursRemaining: msLeft > 0 ? Math.ceil(msLeft / 3_600_000) : 0,
      openClaims,
    };
  }

  async getForUser(userId: string, claimId: string): Promise<ClaimDoc & { aiAssessment?: DamageAssessmentDoc | null }> {
    const claim = await this.getDoc(claimId);
    if (claim.claimantId !== userId && claim.respondentId !== userId) {
      throw new ForbiddenError('Not part of this claim');
    }
    if (!claim.tripId) return claim;
    const aiAssessment = await damageReviewService.get(claim.tripId).catch(() => null);
    return { ...claim, aiAssessment };
  }

  async listForUser(userId: string): Promise<ClaimDoc[]> {
    return ClaimModel.find({
      deletedAt: null,
      $or: [{ claimantId: userId }, { respondentId: userId }],
    })
      .sort({ createdAt: -1 })
      .lean<ClaimDoc[]>();
  }

  async addEvidence(
    userId: string,
    claimId: string,
    evidence: { url: string; kind: 'image' | 'file'; note?: string }[],
  ): Promise<ClaimDoc> {
    const claim = await this.getForUser(userId, claimId);
    await ClaimModel.updateOne(
      { _id: claim._id },
      { $push: { evidence: { $each: evidence.map((e) => ({ ...e, addedBy: userId })) } } },
    );
    return this.getDoc(claimId);
  }

  /**
   * The respondent formally rejects the claim. Does not block admin
   * resolution — settlement still has to happen — but it puts the
   * disagreement on the record with its own timestamp, and it is what a
   * guest previously had no way to do at all.
   */
  async dispute(userId: string, claimId: string, note: string): Promise<ClaimDoc> {
    const claim = await this.getDoc(claimId);
    if (claim.respondentId !== userId) throw new ForbiddenError('Only the respondent can dispute this claim');
    if (['settled', 'rejected', 'closed'].includes(claim.status)) {
      throw new ConflictError('This claim is already resolved', 'CLAIM_CLOSED');
    }
    await this.transition(claimId, 'disputed', userId, note);
    this.notify(claim.claimantId, 'claim.disputed', 'Your claim was disputed', 'The other party has contested your claim. Our team will review both sides.', claimId);
    return this.getDoc(claimId);
  }

  // ── Admin ──────────────────────────────────────────────────────────
  async adminList(opts: { status?: string; type?: string; limit?: number; skip?: number }): Promise<{
    items: ClaimDoc[];
    total: number;
  }> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const filter: Record<string, unknown> = { deletedAt: null };
    if (opts.status) filter.status = opts.status;
    if (opts.type) filter.type = opts.type;
    const [items, total] = await Promise.all([
      ClaimModel.find(filter).sort({ createdAt: -1 }).skip(opts.skip ?? 0).limit(limit).lean<ClaimDoc[]>(),
      ClaimModel.countDocuments(filter),
    ]);
    return { items, total };
  }

  async assign(claimId: string, agentId: string): Promise<ClaimDoc> {
    await this.transition(claimId, 'investigating', agentId, 'Assigned & investigating', { assignedTo: agentId });
    return this.getDoc(claimId);
  }

  async resolve(
    claimId: string,
    agentId: string,
    decision: 'approved' | 'rejected' | 'settled',
    note?: string,
    amountApproved?: number,
  ): Promise<ClaimDoc> {
    await this.transition(claimId, decision, agentId, note ?? decision, amountApproved ? { amountApproved } : {});
    return this.getDoc(claimId);
  }

  /**
   * Settle a claim for real: pay the claimant, optionally penalise the party at
   * fault, and optionally record a warning on their account.
   *
   * Approving a claim used to only set a number — no money moved. This actually
   * credits the claimant's wallet and books it through the double-entry ledger,
   * so payouts and platform loss are reconcilable.
   */
  async settle(
    claimId: string,
    agentId: string,
    input: {
      amountApproved: number;
      note: string;
      /** Who was at fault — they carry the penalty (if any). */
      liableUserId?: string;
      penaltyCents?: number;
      /** Record a formal warning on the liable user's account. */
      warning?: boolean;
    },
  ): Promise<ClaimDoc> {
    const claim = await this.getDoc(claimId);
    if (['settled', 'rejected', 'closed'].includes(claim.status)) {
      throw new ConflictError('Claim is already resolved', 'CLAIM_CLOSED');
    }

    // 1. Collect from the guest, then pay the claimant. Only money actually
    //    taken is booked as recovered; whatever could not be collected is the
    //    platform's cost, so the claimant is made whole either way.
    if (input.amountApproved > 0) {
      const collected = claim.collectedCents ?? (await this.collectFromGuest(claim, input.amountApproved));
      if (claim.collectedCents === undefined) await ClaimModel.updateOne({ _id: claimId }, { collectedCents: collected });
      const fromPlatform = input.amountApproved - collected;
      const legs = (debit: string, amount: number) => [
        { account: debit, direction: 'debit' as const, amount },
        { account: Account.userWallet(claim.claimantId), direction: 'credit' as const, amount },
      ];
      if (collected > 0) {
        await ledgerService.post({
          txnId: `claim_recovery_${claimId}`,
          refType: 'claim_recovery',
          refId: claimId,
          currency: 'USD',
          description: `Claim recovered from guest: ${input.note}`,
          legs: legs(Account.cardFunding(), collected),
        });
      }
      if (fromPlatform > 0) {
        await ledgerService.post({
          txnId: `claim_settlement_${claimId}`,
          refType: 'claim_settlement',
          refId: claimId,
          currency: 'USD',
          description: `Claim settlement: ${input.note}`,
          legs: legs(Account.claimsExpense(), fromPlatform),
        });
      }
    }

    // 2. Penalise the party at fault — recovers part of the loss.
    if (input.liableUserId && input.penaltyCents && input.penaltyCents > 0) {
      await ledgerService.post({
        txnId: `claim_penalty_${claimId}`,
        refType: 'claim_penalty',
        refId: claimId,
        currency: 'USD',
        description: `Claim penalty: ${input.note}`,
        legs: [
          { account: Account.userWallet(input.liableUserId), direction: 'debit', amount: input.penaltyCents },
          { account: Account.platformRevenue(), direction: 'credit', amount: input.penaltyCents },
        ],
      });
    }

    // 3. Formal warning on the liable account (three strikes → suspension review).
    if (input.liableUserId && input.warning) {
      await UserModel.updateOne(
        { _id: input.liableUserId },
        { $push: { warnings: { reason: input.note, at: new Date(), by: agentId, claimId } } },
      );
    }

    await this.transition(claimId, 'settled', agentId, input.note, {
      amountApproved: input.amountApproved,
      liableUserId: input.liableUserId,
      penaltyCents: input.penaltyCents ?? 0,
      warningIssued: !!input.warning,
    });

    const outcome = input.amountApproved > 0 ? 'A decision was made on your claim and the amount has been credited to your wallet.' : 'A decision was made on your claim.';
    this.notify(claim.claimantId, 'claim.settled', 'Your claim was decided', outcome, claimId);
    this.notify(claim.respondentId, 'claim.settled', 'A claim against you was decided', 'A decision was made on the claim against you. See the outcome in your claims.', claimId);

    logger.info(
      { claimId, amountApproved: input.amountApproved, penalty: input.penaltyCents ?? 0 },
      '⚖️  claim settled',
    );
    return this.getDoc(claimId);
  }

  /** Damage is owed by the guest: take it from the deposit first, then their card. */
  private async collectFromGuest(claim: ClaimDoc, amount: number): Promise<number> {
    if (!claim.bookingId) return 0;
    const { bookingService } = await import('../../bookings/application/booking.service');
    const booking = await bookingService.getDoc(claim.bookingId);
    if (claim.respondentId !== booking.guestId) return 0;

    const currency = booking.priceBreakdown.currency;
    let collected = 0;
    try {
      const taken = await depositService.capture(booking._id, { amount, currency }, `Claim ${claim._id}`, booking.hostId, { postLedger: false });
      collected += taken.amount;
    } catch {
      // No deposit held, or already settled: fall through to the card.
    }
    const remaining = amount - collected;
    if (remaining > 0 && (await paymentService.chargeGuest({ bookingId: booking._id, guestId: booking.guestId, amount: remaining, currency, idempotencyKey: `charge_claim_${claim._id}` }))) {
      collected += remaining;
    }
    return collected;
  }

  private notify(userId: string | undefined, templateKey: string, title: string, body: string, claimId: string): void {
    if (!userId) return;
    void notificationService
      .send({ userId, priority: 'high', deepLink: `/claims/${claimId}`, templateKey, title, body, data: { claimId } })
      .catch((err) => logger.warn({ err, claimId, templateKey }, 'claim notification failed'));
  }

  async count(filter: Record<string, unknown> = {}): Promise<number> {
    return ClaimModel.countDocuments({ deletedAt: null, ...filter });
  }

  private async transition(
    claimId: string,
    status: ClaimStatus,
    by: string,
    note: string,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    const res = await ClaimModel.updateOne(
      { _id: claimId },
      { $set: { status, ...extra }, $push: { timeline: { status, at: new Date(), by, note } } },
    );
    if (res.matchedCount === 0) throw new NotFoundError('Claim');
  }

  private async getDoc(claimId: string): Promise<ClaimDoc> {
    const claim = await ClaimModel.findOne({ _id: claimId, deletedAt: null }).lean<ClaimDoc>();
    if (!claim) throw new NotFoundError('Claim');
    return claim;
  }
}

export const claimService = new ClaimService();
