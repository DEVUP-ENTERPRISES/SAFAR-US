import { TaxRuleModel, type TaxRuleDoc } from '../infrastructure/tax-rule.model';
import { NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { money, type Money } from '../../../core/types/money';

/** Where the car is handed over — what decides which authorities can tax it. */
export interface TaxContext {
  /** Two-letter state code, e.g. TX. */
  state?: string;
  city?: string;
  /** Airport code when the handover is at a terminal, e.g. DFW. */
  airportCode?: string;
  days: number;
}

/** One tax line as the guest sees it, and as finance remits it. */
export interface TaxLine {
  ruleId: string;
  label: string;
  kind: string;
  scope: string;
  /** Rate applied, for the receipt. 0 when the line is a flat fee. */
  rateBps: number;
  amount: number;
}

/**
 * Rental tax, resolved from where the car actually changes hands.
 *
 * Previously the only "tax" in the system was a rate applied to our own
 * commission and taken out of host earnings — which is a platform accounting
 * concept, not the tax a US rental attracts. Real rental tax is charged to the
 * guest on top of the rental and remitted by the platform to several different
 * authorities, and it is jurisdiction-specific: under-collecting is a liability
 * that compounds quietly on every booking.
 */
export class TaxService {
  /**
   * Every tax that applies here, as separate lines.
   *
   * Layers stack — state sales tax AND state excise AND a city surcharge can all
   * apply to the same trip — so matching rules are summed rather than resolved to
   * a single most-specific winner, which is how commission rules work but is
   * exactly wrong for tax.
   */
  async quote(taxable: Money, ctx: TaxContext): Promise<{ lines: TaxLine[]; total: Money }> {
    const now = new Date();
    const wanted = [
      { scope: 'country', value: '*' },
      ctx.state ? { scope: 'state', value: ctx.state.toUpperCase() } : null,
      ctx.city ? { scope: 'city', value: ctx.city.toUpperCase() } : null,
      ctx.airportCode ? { scope: 'airport', value: ctx.airportCode.toUpperCase() } : null,
    ].filter(Boolean) as { scope: string; value: string }[];

    const rules = await TaxRuleModel.find({
      active: true,
      deletedAt: null,
      effectiveFrom: { $lte: now },
      $and: [
        { $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gte: now } }] },
        { $or: wanted.map((w) => ({ scope: w.scope, matchValue: w.value })) },
      ],
    }).lean<TaxRuleDoc[]>();

    const lines: TaxLine[] = [];
    for (const r of rules) {
      const amount =
        Math.round((taxable.amount * r.rateBps) / 10000) +
        r.perDayCents * Math.max(1, ctx.days) +
        r.perTripCents;
      if (amount <= 0) continue;
      lines.push({
        ruleId: r._id,
        label: r.label,
        kind: r.kind,
        scope: r.scope,
        rateBps: r.rateBps,
        amount,
      });
    }

    // Most specific last, so a receipt reads country → state → city → airport.
    const order = { country: 0, state: 1, city: 2, airport: 3 } as Record<string, number>;
    lines.sort((a, b) => (order[a.scope] ?? 9) - (order[b.scope] ?? 9));

    return {
      lines,
      total: money(lines.reduce((s, l) => s + l.amount, 0), taxable.currency),
    };
  }

  // ── Admin ───────────────────────────────────────────────────────────

  async list(opts: { scope?: string; active?: boolean } = {}): Promise<TaxRuleDoc[]> {
    const filter: Record<string, unknown> = { deletedAt: null };
    if (opts.scope) filter.scope = opts.scope;
    if (opts.active !== undefined) filter.active = opts.active;
    return TaxRuleModel.find(filter).sort({ scope: 1, matchValue: 1 }).lean<TaxRuleDoc[]>();
  }

  async create(input: Partial<TaxRuleDoc>): Promise<TaxRuleDoc> {
    this.assertCoherent(input);
    const doc = await TaxRuleModel.create(input);
    return doc.toObject();
  }

  async update(id: string, patch: Partial<TaxRuleDoc>): Promise<TaxRuleDoc> {
    const existing = await TaxRuleModel.findOne({ _id: id, deletedAt: null }).lean<TaxRuleDoc>();
    if (!existing) throw new NotFoundError('Tax rule');
    this.assertCoherent({ ...existing, ...patch });
    await TaxRuleModel.updateOne({ _id: id }, patch);
    return (await TaxRuleModel.findById(id).lean<TaxRuleDoc>())!;
  }

  async remove(id: string): Promise<void> {
    const res = await TaxRuleModel.updateOne({ _id: id, deletedAt: null }, { deletedAt: new Date() });
    if (res.matchedCount === 0) throw new NotFoundError('Tax rule');
  }

  /** A rule that charges nothing is a rule someone forgot to finish. */
  private assertCoherent(r: Partial<TaxRuleDoc>): void {
    if (!r.rateBps && !r.perDayCents && !r.perTripCents) {
      throw new ValidationError('A tax rule needs a rate, a per-day amount, or a per-trip amount');
    }
    if (r.effectiveFrom && r.effectiveTo && new Date(r.effectiveFrom) >= new Date(r.effectiveTo)) {
      throw new ValidationError('The end date must be after the start date');
    }
  }
}

export const taxService = new TaxService();
