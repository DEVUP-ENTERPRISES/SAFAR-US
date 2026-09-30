import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';
import type { SealedSecret } from './credential-vault';

export type TollAgency = 'ntta';

/** A toll agency account the fleet's cars run on, and the cars linked to it. */
export interface TollAccountDoc {
  _id: string;
  agency: TollAgency;
  nickname: string;
  /** Host the account belongs to; the CatoDrive fleet for now. */
  hostId?: string;
  /** Login for the agency site, sealed; never returned by the API. */
  credentials?: { username: SealedSecret; password: SealedSecret; savedAt: Date; savedBy: string };
  /** connected: the last automatic fetch worked; manual: statements are imported by hand; disconnected: the login stopped working. */
  status: 'manual' | 'connected' | 'disconnected';
  lastImportAt?: Date;
  lastFetchAt?: Date;
  lastError?: string;
  vehicleIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export type TollStatus = 'matched' | 'no_trip' | 'unknown_car' | 'billed' | 'waived' | 'too_late';

/** One toll charge from an agency statement, and where it landed. */
export interface TollTransactionDoc {
  _id: string;
  agency: TollAgency;
  accountId?: string;
  /** The agency's own transaction ID; the same one is never stored twice. */
  externalId: string;
  postedAt: Date;
  occurredAt: Date;
  location: string;
  tagId?: string;
  plate?: string;
  plateState?: string;
  amountCents: number;
  status: TollStatus;
  vehicleId?: string;
  bookingId?: string;
  /** The booking charge this toll was billed in. */
  incidentalId?: string;
  billedAt?: Date;
  note?: string;
  importedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const sealed = { _id: false, iv: String, tag: String, data: String };

const accountSchema = new Schema<TollAccountDoc>(
  {
    _id: { type: String, default: () => uuid() },
    agency: { type: String, enum: ['ntta'], required: true },
    nickname: { type: String, required: true },
    hostId: String,
    credentials: {
      type: { _id: false, username: sealed, password: sealed, savedAt: Date, savedBy: String },
      default: undefined,
    },
    status: { type: String, enum: ['manual', 'connected', 'disconnected'], default: 'manual' },
    lastImportAt: Date,
    lastFetchAt: Date,
    lastError: String,
    vehicleIds: { type: [String], default: [] },
  },
  { timestamps: true, _id: false },
);

const transactionSchema = new Schema<TollTransactionDoc>(
  {
    _id: { type: String, default: () => uuid() },
    agency: { type: String, enum: ['ntta'], required: true },
    accountId: String,
    externalId: { type: String, required: true },
    postedAt: Date,
    occurredAt: { type: Date, required: true },
    location: String,
    tagId: String,
    plate: String,
    plateState: String,
    amountCents: { type: Number, required: true },
    status: { type: String, enum: ['matched', 'no_trip', 'unknown_car', 'billed', 'waived', 'too_late'], required: true },
    vehicleId: String,
    bookingId: String,
    incidentalId: String,
    billedAt: Date,
    note: String,
    importedBy: String,
  },
  { timestamps: true, _id: false },
);

transactionSchema.index({ agency: 1, externalId: 1 }, { unique: true });
transactionSchema.index({ status: 1, bookingId: 1 });
transactionSchema.index({ vehicleId: 1, occurredAt: -1 });

export const TollAccountModel = model<TollAccountDoc>('TollAccount', accountSchema);
export const TollTransactionModel = model<TollTransactionDoc>('TollTransaction', transactionSchema);
