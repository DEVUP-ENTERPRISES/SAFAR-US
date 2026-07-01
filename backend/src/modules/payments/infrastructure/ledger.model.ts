import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/**
 * Append-only, immutable ledger entries. Each financial transaction writes
 * a balanced set of entries under one txnId where Σdebits === Σcredits.
 * Entries are NEVER updated or deleted — corrections are new entries.
 */
export interface LedgerEntryDoc {
  _id: string;
  txnId: string;
  account: string;
  direction: 'debit' | 'credit';
  amount: number;
  currency: string;
  refType: string;
  refId: string;
  description: string;
  postedAt: Date;
  createdAt: Date;
}

const ledgerSchema = new Schema<LedgerEntryDoc>(
  {
    _id: { type: String, default: () => uuid() },
    txnId: { type: String, required: true },
    account: { type: String, required: true },
    direction: { type: String, required: true, enum: ['debit', 'credit'] },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true },
    refType: { type: String, required: true },
    refId: { type: String, required: true },
    description: { type: String, default: '' },
    postedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: { createdAt: true, updatedAt: false }, _id: false },
);

ledgerSchema.index({ txnId: 1 });
ledgerSchema.index({ account: 1, postedAt: -1 });
ledgerSchema.index({ refType: 1, refId: 1 });

export const LedgerModel = model<LedgerEntryDoc>('LedgerEntry', ledgerSchema);
