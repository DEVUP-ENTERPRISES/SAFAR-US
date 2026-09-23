import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

export interface FleetDeliveryPolicy {
  airport?: boolean;
  home?: boolean;
  hotel?: boolean;
  business?: boolean;
  fee?: number; // flat delivery fee (minor units)
}

export interface FleetLocationPolicy {
  lat: number;
  lng: number;
  address: string;
  city: string;
}

export interface FleetDoc {
  _id: string;
  hostId: string;
  name: string;
  region?: string;
  group?: string; // Optional field for grouping fleets
  /**
   * Fleet-wide defaults a host sets once and pushes to every vehicle, instead
   * of repeating the same delivery/pickup setup per listing.
   */
  defaultDelivery?: FleetDeliveryPolicy;
  defaultLocation?: FleetLocationPolicy;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

const schema = new Schema<FleetDoc>(
  {
    _id: { type: String, default: () => uuid() },
    hostId: { type: String, required: true },
    name: { type: String, required: true },
    region: String,
    group: String,
    defaultDelivery: {
      airport: Boolean,
      home: Boolean,
      hotel: Boolean,
      business: Boolean,
      fee: Number,
    },
    defaultLocation: {
      lat: Number,
      lng: Number,
      address: String,
      city: String,
    },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, _id: false },
);

schema.index({ hostId: 1 });

export const FleetModel = model<FleetDoc>('Fleet', schema);
