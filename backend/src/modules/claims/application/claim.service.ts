import { ClaimModel, type ClaimDoc, type ClaimStatus } from '../infrastructure/claim.model';
import { NotFoundError, ForbiddenError, ConflictError } from '../../../core/errors/app-error';
import { ledgerService } from '../../payments/application/ledger.service';
import { Account } from '../../payments/domain/ledger.accounts';
import { UserModel } from '../../users/infrastructure/user.model';
import { logger } from '../../../infrastructure/logging/logger';

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
  async create(claimantId: string, input: CreateClaimInput): Promise<ClaimDoc> {
    const now = new Date();
    const claim = await ClaimModel.create({
      ...input,
      claimantId,
      evidence: input.evidence ?? [],
      status: 'opened',
      timeline: [{ status: 'opened', at: now, by: claimantId, note: 'Claim filed' }],
    });
    return claim.toObject();
  }

  async getForUser(userId: string, claimId: string): Promise<ClaimDoc> {
    const claim = await this.getDoc(claimId);
    if (claim.claimantId !== userId) throw new ForbiddenError('Not your claim');
    return claim;
  }

  async listForUser(userId: string): Promise<ClaimDoc[]> {
    return ClaimModel.find({ claimantId: userId, deletedAt: null }).sort({ createdAt: -1 }).lean<ClaimDoc[]>();
  }

  async addEvidence(
    userId: string,
    claimId: string,
    evidence: { url: string; kind: 'image' | 'file'; note?: string }[],
  ): Promise<ClaimDoc> {
    const claim = await this.getForUser(userId, claimId);
    await ClaimModel.updateOne({ _id: claim._id }, { $push: { evidence: { $each: evidence } } });
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

    // 1. Pay the claimant (platform/insurer bears the cost).
    if (input.amountApproved > 0) {
      await ledgerService.post({
        refType: 'claim_settlement',
        refId: claimId,
        currency: 'USD',
        description: `Claim settlement: ${input.note}`,
        legs: [
          { account: Account.claimsExpense(), direction: 'debit', amount: input.amountApproved },
          { account: Account.userWallet(claim.claimantId), direction: 'credit', amount: input.amountApproved },
        ],
      });
    }

    // 2. Penalise the party at fault — recovers part of the loss.
    if (input.liableUserId && input.penaltyCents && input.penaltyCents > 0) {
      await ledgerService.post({
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

    logger.info(
      { claimId, amountApproved: input.amountApproved, penalty: input.penaltyCents ?? 0 },
      '⚖️  claim settled',
    );
    return this.getDoc(claimId);
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
