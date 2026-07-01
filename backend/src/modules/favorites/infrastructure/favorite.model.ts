import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

export interface FavoriteDoc {
  _id: string;
  userId: string;
  vehicleId: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<FavoriteDoc>(
  {
    _id: { type: String, default: () => uuid() },
    userId: { type: String, required: true },
    vehicleId: { type: String, required: true },
  },
  { timestamps: true, _id: false },
);

schema.index({ userId: 1, vehicleId: 1 }, { unique: true });
schema.index({ userId: 1, createdAt: -1 });

export const FavoriteModel = model<FavoriteDoc>('Favorite', schema);
