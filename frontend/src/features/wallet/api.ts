import { api } from '@/lib/api/client';

export interface WalletBalance {
  balance: number; // minor units
  currency: string;
}

export interface LedgerEntry {
  _id: string;
  direction: 'debit' | 'credit';
  amount: number;
  currency: string;
  refType: string;
  refId: string;
  description: string;
  postedAt: string;
}

export const walletApi = {
  balance: () => api.get<WalletBalance>('/wallet'),
  transactions: () => api.get<LedgerEntry[]>('/wallet/transactions'),
  topup: (amount: number) => api.post<{ balance: number }>('/wallet/topup', { amount }),
};
