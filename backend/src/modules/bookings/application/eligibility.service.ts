import { UserModel } from '../../users/infrastructure/user.model';
import { KycModel } from '../../kyc/infrastructure/kyc.model';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import { verificationPolicyService } from '../../kyc/application/verification-policy.service';

export type EligibilityBlocker =
  | 'account_suspended'
  | 'email_unverified'
  | 'phone_unverified'
  | 'identity_not_submitted'
  | 'identity_pending'
  | 'identity_rejected'
  | 'licence_expired'
  | 'under_review'
  | 'restricted'
  | 'mvr_required'
  | 'background_required';

export interface Eligibility {
  /** May the guest have a car handed to them? */
  eligible: boolean;
  /** May the guest submit a request at all? False only for banned accounts. */
  canRequest: boolean;
  blockers: EligibilityBlocker[];
  /** Set when the only thing outstanding is a decision we are already making. */
  awaitingReview: boolean;
}

/** Human copy for each blocker — one place, so API and UI never drift. */
export const BLOCKER_COPY: Record<EligibilityBlocker, string> = {
  account_suspended: 'This account is suspended.',
  email_unverified: 'Confirm your email address.',
  phone_unverified: 'Confirm your mobile number.',
  identity_not_submitted: 'Add your driver’s licence and a selfie.',
  identity_pending: 'We’re reviewing your licence — usually under 2 hours.',
  identity_rejected: 'Your licence could not be verified. Please resubmit.',
  licence_expired: 'Your licence expires before this trip ends.',
  under_review: 'We’re reviewing your account. This usually takes a few hours.',
  restricted: 'Your account is limited. Contact support to lift this.',
  mvr_required: 'A current driving-record check is required. This will be requested before your trip.',
  background_required: 'A background check is required before you can book.',
};

/**
 * Whether a guest may be handed a vehicle.
 *
 * Before this existed, `create()` validated only the vehicle and the dates — a
 * ten-second-old account with no verified email, no phone and no licence on
 * file could instant-book and be charged. That is an insurance problem before
 * it is a fraud problem: neither a US nor a Canadian insurer will cover a trip
 * where the platform cannot evidence the driver held a valid licence.
 *
 * Deliberately two-tiered. `canRequest` is permissive so a guest can put a
 * request in front of a host while their identity check runs — the two waits
 * overlap instead of stacking. `eligible` is strict and gates the things that
 * actually matter: capturing funds and handing over keys.
 */
export class EligibilityService {
  async evaluate(userId: string, tripEnd?: Date): Promise<Eligibility> {
    const [user, kyc] = await Promise.all([
      UserModel.findOne({ _id: userId, deletedAt: null }).lean(),
      KycModel.findOne({ userId }).sort({ createdAt: -1 }).lean(),
    ]);

    const blockers: EligibilityBlocker[] = [];

    // Distinguish "we are looking at you" from "you are banned": the copy,
    // the appeal path and the support queue are all different.
    if (!user) blockers.push('account_suspended');
    else if (user.status === 'under_review') blockers.push('under_review');
    else if (user.status === 'restricted') blockers.push('restricted');
    else if (user.status !== 'active') blockers.push('account_suspended');
    if (user && !user.emailVerified) blockers.push('email_unverified');
    if (user && !user.phoneVerified) blockers.push('phone_unverified');

    if (!kyc || kyc.status === 'not_started') blockers.push('identity_not_submitted');
    else if (kyc.status === 'pending') blockers.push('identity_pending');
    else if (kyc.status === 'rejected') blockers.push('identity_rejected');

    // A licence that lapses mid-trip is not a valid licence for that trip.
    if (kyc?.status === 'approved' && tripEnd && kyc.licenceExpiry) {
      if (new Date(kyc.licenceExpiry).getTime() < tripEnd.getTime()) {
        blockers.push('licence_expired');
      }
    }

    // Config-driven checks (MVR / background). Off by default, so this costs
    // nothing until an admin turns a check on; when on, a still-valid result is
    // reused, so it never blocks a guest who has already passed within validity.
    const vcfg = (await platformConfigService.get()).verification;
    for (const type of ['mvr', 'background'] as const) {
      if (!vcfg[type].required) continue;
      const valid = await verificationPolicyService.currentValid(userId, type);
      if (!valid) blockers.push(type === 'mvr' ? 'mvr_required' : 'background_required');
    }

    // Only a hard-stopped account is refused outright. Someone under review
    // keeps their existing trips and can still talk to support.
    const suspended =
      blockers.includes('account_suspended') ||
      blockers.includes('under_review') ||
      blockers.includes('restricted');

    return {
      eligible: blockers.length === 0,
      canRequest: !suspended,
      blockers,
      // "Pending" is us owing them an answer, not them owing us a document —
      // the UI should say "we're reviewing", not "you must act".
      awaitingReview: blockers.length === 1 && blockers[0] === 'identity_pending',
    };
  }

  /** Convenience for surfaces that only need the answer. */
  async isEligible(userId: string, tripEnd?: Date): Promise<boolean> {
    return (await this.evaluate(userId, tripEnd)).eligible;
  }

  describe(blockers: EligibilityBlocker[]): string[] {
    return blockers.map((b) => BLOCKER_COPY[b]);
  }
}

export const eligibilityService = new EligibilityService();
