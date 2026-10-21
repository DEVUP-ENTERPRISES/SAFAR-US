import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

export type FuelLevel = 'full' | 'three_quarters' | 'half' | 'quarter';

/** Agreement Exhibit A: the car's condition at intake, signed by CatoDrive and acknowledged by the partner. */
export interface AssetPartnerIntakeDoc {
  _id: string;
  partnerId: string;
  applicationId?: string;
  vehicleId?: string;
  vehicle: { year: string; make: string; model: string; trim?: string; color?: string; vin: string; plate: string };
  odometer: number;
  estimatedMarketValue?: string;
  listingUrl?: string;
  intakeDate: Date;
  location: string;
  fuelLevel: FuelLevel;
  preExistingDamage: string;
  conditionNotes?: string;
  photos: { url: string; key?: string; label?: string }[];
  catodriveSignature: { name: string; title: string; signedAt: Date; userId: string };
  partnerResponse?: { kind: 'acknowledged' | 'objected'; signedName?: string; objection?: string; at: Date; ip?: string };
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<AssetPartnerIntakeDoc>(
  {
    _id: { type: String, default: () => uuid() },
    partnerId: { type: String, required: true },
    applicationId: String,
    vehicleId: String,
    vehicle: {
      year: { type: String, required: true },
      make: { type: String, required: true },
      model: { type: String, required: true },
      trim: String,
      color: String,
      vin: { type: String, required: true },
      plate: { type: String, required: true },
    },
    odometer: { type: Number, required: true },
    estimatedMarketValue: String,
    listingUrl: String,
    intakeDate: { type: Date, required: true },
    location: { type: String, required: true },
    fuelLevel: { type: String, required: true, enum: ['full', 'three_quarters', 'half', 'quarter'] },
    preExistingDamage: { type: String, required: true },
    conditionNotes: String,
    photos: { type: [{ _id: false, url: String, key: String, label: String }], default: [] },
    catodriveSignature: {
      name: { type: String, required: true },
      title: { type: String, required: true },
      signedAt: { type: Date, required: true },
      userId: { type: String, required: true },
    },
    partnerResponse: {
      type: new Schema({ kind: String, signedName: String, objection: String, at: Date, ip: String }, { _id: false }),
      default: undefined,
    },
  },
  { timestamps: true, _id: false },
);

schema.index({ partnerId: 1, createdAt: -1 });

export const AssetPartnerIntakeModel = model<AssetPartnerIntakeDoc>('AssetPartnerIntake', schema);
