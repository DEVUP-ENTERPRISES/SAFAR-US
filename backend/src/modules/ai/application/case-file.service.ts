import { aiGateway } from '../infrastructure/ai.gateway';
import { ClaimModel, type ClaimDoc } from '../../claims/infrastructure/claim.model';
import { BookingModel, type BookingDoc } from '../../bookings/infrastructure/booking.model';
import { TripModel, type TripDoc } from '../../trips/infrastructure/trip.model';
import { MessageModel, type MessageDoc } from '../../messaging/infrastructure/message.model';
import { ViolationModel, type ViolationDoc } from '../../violations/infrastructure/violation.model';
import { DamageAssessmentModel, type DamageAssessmentDoc } from '../infrastructure/damage-assessment.model';

/**
 * The case file: everything about a disputed claim, on one screen.
 *
 * Closing a claim currently means an agent reading forty messages, two photo
 * sets, a booking, a trip record and any citations, then reconstructing a
 * timeline by hand. That is the real reason disputes take days — not the
 * decision, the reading. We promise a 72-hour close; this is what makes that
 * promise survive volume.
 *
 * The model summarises and organises. It does not decide:
 *  - it never states who is liable
 *  - it never proposes an amount
 *  - anything the evidence does not settle is listed as an open question,
 *    which is the most useful output for an agent — it says what to go ask.
 *
 * The assembled facts are returned alongside the summary so the agent can see
 * the raw record the model was working from, rather than trusting a paraphrase.
 */

const SYSTEM = `You are a claims analyst preparing a case file for a human adjuster at a peer-to-peer car rental marketplace.

You receive the structured record of a claim: the booking, the trip, the messages between the parties, any automated damage review, and any citations.

Produce a neutral brief that lets the adjuster decide quickly.

Rules:
- Do NOT decide liability. Do not say who is at fault or who should pay.
- Do NOT propose an amount.
- Separate what the evidence establishes from what it does not.
- Quote the parties rather than characterising them. If a message matters, cite it.
- List the specific open questions the adjuster should resolve, and who to ask.
- If the parties contradict each other, say so plainly and show both accounts.
- Be brief. An adjuster reads this in under a minute.

Respond ONLY with JSON matching:
{"summary":string,"timeline":[{"at":string,"what":string}],"established":string[],"disputed":string[],"openQuestions":[{"question":string,"askWho":"guest"|"host"|"either"}],"evidenceGaps":string[]}`;

export interface CaseFile {
  summary: string;
  timeline: { at: string; what: string }[];
  established: string[];
  disputed: string[];
  openQuestions: { question: string; askWho: 'guest' | 'host' | 'either' }[];
  evidenceGaps: string[];
}

/** Everything attached to a claim, as read from the database. */
export interface GatheredFacts {
  claim: ClaimDoc;
  booking: (BookingDoc & { code?: string }) | null;
  trip: TripDoc | null;
  messages: MessageDoc[];
  violations: ViolationDoc[];
  damage: DamageAssessmentDoc | null;
}

export const caseFileService = {
  enabled(): boolean {
    return aiGateway.isEnabled();
  },

  /**
   * Gather every record attached to a claim. Returned on its own as well as fed
   * to the model, because an agent should be able to check the summary against
   * the source without leaving the screen.
   */
  async gather(claimId: string): Promise<GatheredFacts> {
    const claim = await ClaimModel.findById(claimId).lean();
    if (!claim) throw new Error('Claim not found');

    const [booking, trip, messages, violations, damage] = await Promise.all([
      claim.bookingId ? BookingModel.findById(claim.bookingId).lean() : null,
      claim.tripId
        ? TripModel.findById(claim.tripId).lean()
        : claim.bookingId
          ? TripModel.findOne({ bookingId: claim.bookingId }).lean()
          : null,
      claim.bookingId
        ? MessageModel.find({ bookingId: claim.bookingId }).sort({ createdAt: 1 }).limit(80).lean()
        : [],
      claim.bookingId ? ViolationModel.find({ bookingId: claim.bookingId }).lean() : [],
      claim.tripId ? DamageAssessmentModel.findOne({ tripId: claim.tripId }).lean() : null,
    ]);

    return { claim, booking, trip, messages, violations, damage } as GatheredFacts;
  },

  async build(claimId: string): Promise<{ file: CaseFile; facts: GatheredFacts }> {
    if (!aiGateway.isEnabled()) throw new Error('AI is not configured');

    const facts = await this.gather(claimId);
    const { claim, booking, trip, messages, violations, damage } = facts;

    // A compact, unambiguous record. Ids are truncated: they are noise to the
    // model and the agent has the raw facts alongside.
    const record = {
      claim: {
        type: claim.type,
        status: claim.status,
        openedAt: claim.createdAt,
        description: claim.description,
        amountClaimed: claim.amountClaimed,
        evidenceCount: claim.evidence?.length ?? 0,
        timeline: (claim.timeline ?? []).map((t) => ({ at: t.at, status: t.status, note: t.note })),
      },
      booking: booking && {
        code: (booking as { code?: string }).code,
        status: (booking as { status?: string }).status,
        period: (booking as { period?: unknown }).period,
      },
      trip: trip && {
        status: trip.status,
        handover: trip.handover,
        return: trip.return,
        photoCounts: {
          checkin: (trip.photos ?? []).filter((p) => p.phase === 'pre').length,
          checkout: (trip.photos ?? []).filter((p) => p.phase === 'post').length,
        },
        damageReports: (trip.damageReports ?? []).map((d) => ({ at: d.at, description: d.description })),
        incidents: trip.incidents ?? [],
      },
      automatedDamageReview: damage && {
        verdict: damage.verdict,
        needsHuman: damage.needsHuman,
        findings: damage.findings.map((f) => ({
          area: f.area, type: f.type, description: f.description, confidence: f.confidence,
        })),
      },
      citations: violations.map((v) => ({
        ref: v.citationRef, type: v.type, occurredAt: v.occurredAt, amount: v.amount, status: v.status,
      })),
      // Roles, not names — the model should reason about parties, not people.
      messages: messages.map((m) => ({
        at: m.createdAt,
        from: m.senderId === claim.claimantId ? 'claimant' : 'other party',
        body: m.body?.slice(0, 500),
        hasAttachment: (m.attachments?.length ?? 0) > 0,
      })),
    };

    const { content } = await aiGateway.completeJson<CaseFile>({
      feature: 'case-file',
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: JSON.stringify(record) },
      ],
      maxTokens: 1800,
      temperature: 0.1,
    });

    return { file: content, facts };
  },
};
