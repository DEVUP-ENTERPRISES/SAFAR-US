import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/**
 * One jurisdiction's tax on a rental.
 *
 * US car rental is taxed in layers that stack: a state sales tax, a state motor
 * vehicle rental excise, a city surcharge, and — if the car is handed over at an
 * airport — a concession recovery fee. They are levied by different authorities
 * at different rates and remitted separately, so they are modelled as separate
 * rules rather than collapsed into one percentage. A guest is entitled to see
 * the breakdown, and finance has to remit each line to a different body.
 */
export type TaxScope = 'country' | 'state' | 'city' | 'airport';
export type TaxKind = 'sales_tax' | 'rental_excise' | 'airport_concession' | 'surcharge';

export interface TaxRuleDoc {
  _id: string;
  /** Shown to the guest on the price breakdown, e.g. "TX motor vehicle rental tax". */
  label: string;
  scope: TaxScope;
  /**
   * What this rule matches, compared case-insensitively: a state code (TX), a
   * city name (Dallas), an airport code (DFW), or '*' for country-wide.
   */
  matchValue: string;
  kind: TaxKind;
  /** Rate in basis points. 825 = 8.25%. */
  rateBps: number;
  /** A flat per-day amount instead of, or on top of, a rate. Minor units. */
  perDayCents: number;
  /** A flat per-trip amount. Minor units. */
  perTripCents: number;
  active: boolean;
  /** Rates change by legislation; a rule only applies inside its dates. */
  effectiveFrom: Date;
  effectiveTo?: Date;
  /** Free-text note for whoever has to defend this figure to an auditor. */
  note?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

const schema = new Schema<TaxRuleDoc>(
  {
    _id: { type: String, default: () => uuid() },
    label: { type: String, required: true },
    scope: { type: String, enum: ['country', 'state', 'city', 'airport'], required: true },
    matchValue: { type: String, required: true, uppercase: true, trim: true },
    kind: {
      type: String,
      enum: ['sales_tax', 'rental_excise', 'airport_concession', 'surcharge'],
      default: 'sales_tax',
    },
    rateBps: { type: Number, default: 0 },
    perDayCents: { type: Number, default: 0 },
    perTripCents: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    effectiveFrom: { type: Date, default: () => new Date() },
    effectiveTo: { type: Date },
    note: { type: String },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, _id: false },
);

schema.index({ scope: 1, matchValue: 1, active: 1 });

export const TaxRuleModel = model<TaxRuleDoc>('TaxRule', schema);
