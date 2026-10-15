/**
 * Logical accounts in the double-entry ledger. Scoped accounts (wallet,
 * host payable) embed the owner id. Balances are DERIVED by summing entries
 * — there is no mutable balance field that can drift.
 */
export const Account = {
  gatewayClearing: () => 'gateway_clearing',
  platformRevenue: () => 'platform_revenue',
  platformTax: () => 'platform_tax',
  promoExpense: () => 'promo_expense',
  claimsExpense: () => 'claims_expense', // what the platform/insurer pays out on claims
  /**
   * What the rebooking guarantee costs us: the price difference covered when a
   * host strands a guest. Kept separate from promo spend so the true cost of
   * the promise is visible on its own line — and offset by host penalties.
   */
  guaranteeExpense: () => 'guarantee_expense',
  depositHeld: () => 'deposit_held',
  cardFunding: () => 'card_funding', // external card inflow contra-account (wallet top-ups)
  userWallet: (userId: string) => `user_wallet:${userId}`,
  hostPayable: (hostId: string) => `host_payable:${hostId}`,
};

export type LedgerDirection = 'debit' | 'credit';

export interface LedgerLeg {
  account: string;
  direction: LedgerDirection;
  amount: number; // minor units
}
