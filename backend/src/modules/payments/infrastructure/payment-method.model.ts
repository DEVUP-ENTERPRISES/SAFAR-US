import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/** A saved card. Only non-sensitive metadata + the gateway token are stored. */
export interface PaymentMethodDoc {
  _id: string;
  userId: string;
  provider: 'mock' | 'stripe';
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  stripePaymentMethodId?: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<PaymentMethodDoc>(
  {
    _id: { type: String, default: () => uuid() },
    userId: { type: String, required: true },
    provider: { type: String, enum: ['mock', 'stripe'], default: 'mock' },
    brand: { type: String, required: true },
    last4: { type: String, required: true },
    expMonth: { type: Number, required: true },
    expYear: { type: Number, required: true },
    stripePaymentMethodId: String,
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true, _id: false },
);
schema.index({ userId: 1 });

export const PaymentMethodModel = model<PaymentMethodDoc>('PaymentMethod', schema);
