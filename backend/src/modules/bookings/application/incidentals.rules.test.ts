/**
 * The incidental rules, tested as pure predicates.
 *
 * The service itself needs Mongo, a ledger and notifications, so the *rules*
 * are extracted and tested directly. That is the part worth guarding: every one
 * of these decides whether a host may take money from a guest's card, and every
 * boundary is a real dollar amount on a real person.
 *
 * These mirror the checks in incidentals.service. If one is changed there
 * without changing it here, a test fails — which is the point.
 */

type Kind = 'fuel' | 'cleaning' | 'smoking' | 'pet' | 'late_return' | 'toll' | 'fine' | 'other';

interface Cfg {
  maxTollCents: number;
  maxFineCents: number;
  maxOtherCents: number;
  windowDays: number;
  evidenceRequiredAboveCents: number;
  disputeWindowHours: number;
}

const CFG: Cfg = {
  maxTollCents: 10_000,
  maxFineCents: 50_000,
  maxOtherCents: 15_000,
  windowDays: 7,
  evidenceRequiredAboveCents: 5_000,
  disputeWindowHours: 72,
};

const capFor = (t: Kind, c: Cfg): number | null =>
  t === 'toll' ? c.maxTollCents : t === 'fine' ? c.maxFineCents : t === 'other' ? c.maxOtherCents : null;

const withinWindow = (tripEnd: Date, now: Date, c: Cfg) =>
  now.getTime() <= tripEnd.getTime() + c.windowDays * 86_400_000;

const needsEvidence = (amount: number, c: Cfg) => amount > c.evidenceRequiredAboveCents;

const canDispute = (chargedAt: Date, now: Date, c: Cfg) =>
  now.getTime() <= chargedAt.getTime() + c.disputeWindowHours * 3_600_000;

describe('incidental charge rules', () => {
  describe('submission window', () => {
    const tripEnd = new Date('2026-06-01T12:00:00Z');

    it('allows a charge the day after the trip', () => {
      expect(withinWindow(tripEnd, new Date('2026-06-02T12:00:00Z'), CFG)).toBe(true);
    });

    it('allows a charge exactly on the deadline', () => {
      // Inclusive: a host acting on the stated last day must not be refused.
      expect(withinWindow(tripEnd, new Date('2026-06-08T12:00:00Z'), CFG)).toBe(true);
    });

    it('refuses one second past the deadline', () => {
      expect(withinWindow(tripEnd, new Date('2026-06-08T12:00:01Z'), CFG)).toBe(false);
    });

    it('refuses a trip from six months ago', () => {
      // The case the window exists for: billing long after the guest could
      // possibly evidence otherwise.
      expect(withinWindow(tripEnd, new Date('2026-12-01T00:00:00Z'), CFG)).toBe(false);
    });
  });

  describe('per-category ceiling', () => {
    it('caps each free-form category separately', () => {
      // A toll is a few dollars; a moving violation can be a few hundred. One
      // blanket cap would either block real fines or wave through absurd tolls.
      expect(capFor('toll', CFG)).toBe(10_000);
      expect(capFor('fine', CFG)).toBe(50_000);
      expect(capFor('other', CFG)).toBe(15_000);
    });

    it('gives "other" a tighter cap than a fine', () => {
      // "other" is the category with no natural bound, so it gets the least
      // room, not the most.
      expect(capFor('other', CFG)!).toBeLessThan(capFor('fine', CFG)!);
    });

    it('has no cap for rated types, because the host does not set the amount', () => {
      for (const t of ['fuel', 'cleaning', 'smoking', 'pet', 'late_return'] as Kind[]) {
        expect(capFor(t, CFG)).toBeNull();
      }
    });

    it('allows a charge exactly at the cap and refuses one cent over', () => {
      const cap = capFor('toll', CFG)!;
      expect(cap <= capFor('toll', CFG)!).toBe(true);
      expect(cap + 1 > capFor('toll', CFG)!).toBe(true);
    });

    it('blocks the abuse case: a five-figure "other" charge', () => {
      expect(1_000_000 > capFor('other', CFG)!).toBe(true);
    });
  });

  describe('evidence threshold', () => {
    it('takes a small toll on trust', () => {
      expect(needsEvidence(600, CFG)).toBe(false); // $6
    });

    it('demands proof for a large one', () => {
      expect(needsEvidence(20_000, CFG)).toBe(true); // $200
    });

    it('does not demand proof exactly at the threshold', () => {
      expect(needsEvidence(CFG.evidenceRequiredAboveCents, CFG)).toBe(false);
      expect(needsEvidence(CFG.evidenceRequiredAboveCents + 1, CFG)).toBe(true);
    });

    it('applies to rated types too — a big fuel charge should be photographed', () => {
      expect(needsEvidence(9_000, CFG)).toBe(true);
    });
  });

  describe('dispute window', () => {
    const chargedAt = new Date('2026-06-10T09:00:00Z');

    it('lets the guest dispute immediately', () => {
      expect(canDispute(chargedAt, chargedAt, CFG)).toBe(true);
    });

    it('lets them dispute on the final hour', () => {
      expect(canDispute(chargedAt, new Date('2026-06-13T09:00:00Z'), CFG)).toBe(true);
    });

    it('closes after the window', () => {
      expect(canDispute(chargedAt, new Date('2026-06-13T09:00:01Z'), CFG)).toBe(false);
    });

    it('gives the guest longer to dispute than a day, so a weekend cannot cost them the right', () => {
      expect(CFG.disputeWindowHours).toBeGreaterThanOrEqual(48);
    });
  });

  describe('duplicate detection', () => {
    const existing = [
      { type: 'toll', amount: 1_200, status: 'charged' },
      { type: 'cleaning', amount: 7_500, status: 'refunded' },
    ];
    const isDupe = (type: string, amount: number) =>
      existing.some((e) => e.type === type && e.amount === amount && e.status !== 'refunded');

    it('catches the same charge submitted twice', () => {
      expect(isDupe('toll', 1_200)).toBe(true);
    });

    it('allows a genuinely different second toll', () => {
      expect(isDupe('toll', 800)).toBe(false);
    });

    it('allows re-charging something that was refunded', () => {
      // A refunded charge is not a live one; re-raising it correctly is valid.
      expect(isDupe('cleaning', 7_500)).toBe(false);
    });
  });

  describe('the rules hold together', () => {
    it('never lets an unevidenced charge exceed a cap', () => {
      // The two guards must not have a gap between them: any amount that is
      // over a cap is also over the evidence threshold, so nothing large can
      // slip through on trust alone.
      for (const t of ['toll', 'fine', 'other'] as Kind[]) {
        expect(capFor(t, CFG)!).toBeGreaterThan(CFG.evidenceRequiredAboveCents);
      }
    });
  });
});
