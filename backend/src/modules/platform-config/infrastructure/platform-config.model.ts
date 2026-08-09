import { Schema, model } from 'mongoose';

/**
 * Singleton platform economics document. Every rate the business runs on lives
 * here — NOT as a constant in code — so finance can retune the marketplace
 * without a deploy. Reads are Redis-cached and invalidated on write.
 */
export interface PlatformConfigDoc {
  _id: string; // always 'platform'
  /**
   * Security deposit — an authorisation held against the guest's card for the
   * trip, captured only against evidenced damage and voided otherwise.
   */
  deposit: {
    enabled: boolean;
    /** Floor, in minor units, regardless of how cheap the car is. */
    minCents: number;
    /** Ceiling, so a supercar doesn't authorise someone's whole limit. */
    maxCents: number;
    /** Deposit = dailyPrice × this ÷ 10000, clamped to the band above. */
    multiplierBps: number;
    /** Hours after trip end before an unclaimed deposit is auto-released. */
    autoReleaseHours: number;
  };
  commission: {
    /** Fallback take rate when no CommissionRule matches. Basis points. */
    defaultBps: number;
    /** Guard rails — the admin UI and API refuse rules outside this band. */
    minBps: number;
    maxBps: number;
  };
  tax: {
    /** Applied to commission. US launch = 0. */
    bps: number;
  };
  pricing: {
    /** A trip starting at least this many days out earns the early-bird rate. */
    earlyBirdMinDaysAhead: number;
    /** A trip starting within this many hours counts as last-minute. */
    lastMinuteMaxHoursAhead: number;
  };
  /** Refund rules per host cancellation policy — full refund if the guest
   *  cancels at least `fullBeforeHours` before start, else `partialBps` of total. */
  cancellation: {
    flexible: { fullBeforeHours: number; partialBps: number };
    moderate: { fullBeforeHours: number; partialBps: number };
    strict: { fullBeforeHours: number; partialBps: number };
  };
  /** No-show handling once the trip start passes without a handover. */
  noShow: {
    /** Hours after start before a no-show can be declared. */
    graceHours: number;
    /** Fraction of the total the guest forfeits on a guest no-show (host keeps it). */
    guestForfeitBps: number;
  };
  /** All-Star Host (superhost) qualification bar — earned, not granted. */
  superhost: {
    minTrips: number;
    minRatingAvg: number;
    minRatingCount: number;
    maxCancellationRatePct: number;
  };
  /**
   * Guest trust engine. These thresholds decide who gets a deposit waived, who
   * may instant-book, and who reaches priority support — pure business policy,
   * so ops can retune it (e.g. loosen during a growth push, tighten after a
   * fraud wave) without a deploy.
   */
  trust: {
    /** Minimum score for each tier. Below `bronze` a member is 'new'. */
    tiers: { gold: number; silver: number; bronze: number };
    /** Points awarded for each verification step (30 available in total). */
    verificationPoints: { email: number; phone: number; licence: number };
    /** What each tier unlocks. */
    perks: {
      depositDiscountPctByTier: { new: number; bronze: number; silver: number; gold: number };
      instantBookMinTier: 'new' | 'bronze' | 'silver' | 'gold';
      prioritySupportMinTier: 'new' | 'bronze' | 'silver' | 'gold';
    };
  };
  /** Risk engine: the score at which each enforcement band kicks in. */
  risk: {
    bands: { block: number; high: number; medium: number };
  };
  /** Notification routing matrix: which channels each category may use. */
  notifications: {
    categoryChannels: Record<'trips' | 'messages' | 'payments' | 'promotions' | 'reviews' | 'account', { push: boolean; email: boolean; sms: boolean }>;
  };
  /** Wallet caps by trust tier (fraud / AML) and host-reputation payout holds. */
  wallet: {
    maxBalanceCentsByTier: { new: number; bronze: number; silver: number; gold: number };
  };
  payoutTrust: {
    /** A host with fewer than this many completed trips is treated as new. */
    newHostTripThreshold: number;
    /** Extra hold hours applied to a new host's payouts. */
    newHostExtraHoldHours: number;
  };
  /** Post-trip incidental fee schedule (host-compensating), in minor units. */
  incidentals: {
    /** Charged per whole % of fuel returned below pickup level. */
    fuelPerPercentCents: number;
    cleaningCents: number;
    smokingCents: number;
    petCents: number;
    /** Extra late-return fee per hour past the grace window. */
    lateReturnPerHourCents: number;
  };
  payout: {
    /** Hold window before scheduled payouts are released. */
    holdHours: number;
    /** Instant payout fee. */
    instantFeeBps: number;
    instantFeeMinCents: number;
  };
  rewards: {
    /** Redemption value of one point, in cents. */
    pointValueCents: number;
    /** Points earned per whole dollar of booking subtotal. */
    pointsPerDollar: number;
    /** Fewest points a member may redeem at once. */
    minRedemptionPoints: number;
    /**
     * The loyalty ladder: lifetime-points threshold and earn rate per tier.
     * Ordered lowest-first. Retuning this is how the programme is made more or
     * less generous — previously it meant a deploy.
     */
    tiers: { key: string; label: string; min: number; earnMultiplierBps: number }[];
  };
  /**
   * Booking lifecycle windows. How long a host has to answer, how long an
   * unverified guest's booking is held, and how long a quoted price and a
   * checkout hold survive — operational policy that trades conversion against
   * inventory certainty, so ops owns it.
   */
  booking: {
    hostApprovalHours: number;
    verificationGraceHours: number;
    checkoutHoldMinutes: number;
    priceLockMinutes: number;
  };
  /**
   * Search ranking weights. What the marketplace chooses to surface is a
   * competitive lever, not an implementation detail — being able to retune it
   * (favour quality vs. proximity vs. new supply) without a deploy is how a
   * marketplace is actually run.
   */
  search: {
    ranking: {
      categoryMatch: number;
      bodyTypeMatch: number;
      priceProximity: number;
      ratingWeight: number;
      superhostBoost: number;
      tripsWeight: number;
      tripsCap: number;
    };
  };
  referral: {
    referrerCreditCents: number;
    refereeCreditCents: number;
    /** Loyalty points awarded on top of the cash credit. */
    referrerPoints: number;
    refereePoints: number;
  };
  protection: {
    /** Per-day price of each protection tier, in cents. */
    code: string;
    label: string;
    description: string;
    pricePerDay: number;
  }[];
  support: {
    /** Hours to first resolution, per priority. Drives SLA breach reporting. */
    slaHours: { urgent: number; high: number; normal: number; low: number };
  };
  surge: {
    /** Master switch — off means every day prices at 1.0x. */
    enabled: boolean;
    /** Also lift prices automatically from measured occupancy. */
    autoEnabled: boolean;
    /** Hard ceiling. 15000 = 1.5x. Nothing can price above this. */
    maxMultiplierBps: number;
    /** The auto-surge curve: at N% occupancy, apply this multiplier. */
    occupancyThresholds: { occupancyPct: number; multiplierBps: number }[];
  };
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<PlatformConfigDoc>(
  {
    _id: { type: String, default: 'platform' },
    deposit: {
      enabled: { type: Boolean, default: true },
      minCents: { type: Number, default: 25000 },   // $250 floor
      maxCents: { type: Number, default: 100000 },  // $1,000 ceiling
      multiplierBps: { type: Number, default: 20000 }, // 2x the daily rate
      autoReleaseHours: { type: Number, default: 24 },
    },
    commission: {
      defaultBps: { type: Number, default: 2000 }, // 20%
      minBps: { type: Number, default: 0 },
      maxBps: { type: Number, default: 4000 }, // 40% ceiling — a typo can't take 90%
    },
    tax: {
      bps: { type: Number, default: 0 },
    },
    pricing: {
      earlyBirdMinDaysAhead: { type: Number, default: 30 },
      lastMinuteMaxHoursAhead: { type: Number, default: 48 },
    },
    cancellation: {
      flexible: { fullBeforeHours: { type: Number, default: 24 }, partialBps: { type: Number, default: 5000 } },
      moderate: { fullBeforeHours: { type: Number, default: 48 }, partialBps: { type: Number, default: 5000 } },
      strict: { fullBeforeHours: { type: Number, default: 168 }, partialBps: { type: Number, default: 0 } },
    },
    noShow: {
      graceHours: { type: Number, default: 2 },
      guestForfeitBps: { type: Number, default: 5000 },
    },
    superhost: {
      minTrips: { type: Number, default: 5 },
      minRatingAvg: { type: Number, default: 4.8 },
      minRatingCount: { type: Number, default: 3 },
      maxCancellationRatePct: { type: Number, default: 5 },
    },
    trust: {
      tiers: {
        gold: { type: Number, default: 80 },
        silver: { type: Number, default: 55 },
        bronze: { type: Number, default: 30 },
      },
      verificationPoints: {
        email: { type: Number, default: 5 },
        phone: { type: Number, default: 10 },
        licence: { type: Number, default: 15 },
      },
      perks: {
        depositDiscountPctByTier: {
          new: { type: Number, default: 0 },
          bronze: { type: Number, default: 0 },
          silver: { type: Number, default: 50 },
          gold: { type: Number, default: 100 },
        },
        instantBookMinTier: { type: String, default: 'bronze' },
        prioritySupportMinTier: { type: String, default: 'silver' },
      },
    },
    risk: {
      bands: {
        block: { type: Number, default: 90 },
        high: { type: Number, default: 60 },
        medium: { type: Number, default: 30 },
      },
    },
    notifications: {
      categoryChannels: {
        trips: { push: { type: Boolean, default: true }, email: { type: Boolean, default: true }, sms: { type: Boolean, default: true } },
        messages: { push: { type: Boolean, default: true }, email: { type: Boolean, default: false }, sms: { type: Boolean, default: false } },
        payments: { push: { type: Boolean, default: true }, email: { type: Boolean, default: true }, sms: { type: Boolean, default: false } },
        promotions: { push: { type: Boolean, default: true }, email: { type: Boolean, default: true }, sms: { type: Boolean, default: false } },
        reviews: { push: { type: Boolean, default: true }, email: { type: Boolean, default: true }, sms: { type: Boolean, default: false } },
        account: { push: { type: Boolean, default: true }, email: { type: Boolean, default: true }, sms: { type: Boolean, default: true } },
      },
    },
    wallet: {
      maxBalanceCentsByTier: {
        new: { type: Number, default: 50000 },
        bronze: { type: Number, default: 200000 },
        silver: { type: Number, default: 500000 },
        gold: { type: Number, default: 1000000 },
      },
    },
    payoutTrust: {
      newHostTripThreshold: { type: Number, default: 3 },
      newHostExtraHoldHours: { type: Number, default: 48 },
    },
    incidentals: {
      fuelPerPercentCents: { type: Number, default: 300 },
      cleaningCents: { type: Number, default: 7500 },
      smokingCents: { type: Number, default: 25000 },
      petCents: { type: Number, default: 10000 },
      lateReturnPerHourCents: { type: Number, default: 2500 },
    },
    payout: {
      holdHours: { type: Number, default: 24 },
      instantFeeBps: { type: Number, default: 150 }, // 1.5%
      instantFeeMinCents: { type: Number, default: 50 },
    },
    rewards: {
      pointValueCents: { type: Number, default: 5 },
      pointsPerDollar: { type: Number, default: 1 },
      minRedemptionPoints: { type: Number, default: 100 },
      tiers: {
        type: [{ key: String, label: String, min: Number, earnMultiplierBps: Number }],
        default: undefined, // absent → the service's default ladder applies
      },
    },
    booking: {
      hostApprovalHours: { type: Number, default: 24 },
      verificationGraceHours: { type: Number, default: 72 },
      checkoutHoldMinutes: { type: Number, default: 15 },
      priceLockMinutes: { type: Number, default: 10 },
    },
    search: {
      ranking: {
        categoryMatch: { type: Number, default: 3 },
        bodyTypeMatch: { type: Number, default: 2 },
        priceProximity: { type: Number, default: 2 },
        ratingWeight: { type: Number, default: 0.5 },
        superhostBoost: { type: Number, default: 1 },
        tripsWeight: { type: Number, default: 0.02 },
        tripsCap: { type: Number, default: 20 },
      },
    },
    referral: {
      referrerCreditCents: { type: Number, default: 2000 },
      refereeCreditCents: { type: Number, default: 1000 },
      referrerPoints: { type: Number, default: 200 },
      refereePoints: { type: Number, default: 100 },
    },
    protection: {
      type: [
        {
          _id: false,
          code: String,
          label: String,
          description: String,
          pricePerDay: Number,
        },
      ],
      default: [
        { code: 'basic', label: 'Basic', description: 'Included. Higher deductible, essential coverage.', pricePerDay: 0 },
        { code: 'standard', label: 'Standard', description: 'Lower deductible, exterior damage protection.', pricePerDay: 1500 },
        { code: 'premier', label: 'Premier', description: 'Zero deductible, full protection & roadside.', pricePerDay: 3000 },
      ],
    },
    support: {
      slaHours: {
        urgent: { type: Number, default: 4 },
        high: { type: Number, default: 12 },
        normal: { type: Number, default: 48 },
        low: { type: Number, default: 72 },
      },
    },
    surge: {
      enabled: { type: Boolean, default: true },
      autoEnabled: { type: Boolean, default: true },
      maxMultiplierBps: { type: Number, default: 15000 }, // 1.5x ceiling
      occupancyThresholds: {
        type: [{ _id: false, occupancyPct: Number, multiplierBps: Number }],
        default: [
          { occupancyPct: 70, multiplierBps: 11000 }, // 70% booked → 1.1x
          { occupancyPct: 85, multiplierBps: 12500 }, // 85% booked → 1.25x
          { occupancyPct: 95, multiplierBps: 14000 }, // 95% booked → 1.4x
        ],
      },
    },
    updatedBy: String,
  },
  { timestamps: true, _id: false, minimize: false },
);

export const PlatformConfigModel = model<PlatformConfigDoc>('PlatformConfig', schema);
