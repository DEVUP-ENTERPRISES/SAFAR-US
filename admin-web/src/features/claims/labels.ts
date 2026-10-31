export const CLAIM_TONE: Record<string, 'success' | 'warning' | 'destructive' | 'muted' | 'default'> = {
  opened: 'warning', investigating: 'default', approved: 'success', settled: 'success', rejected: 'destructive', closed: 'muted',
};
export const CLAIM_TYPE: Record<string, string> = { damage: 'Damage', insurance: 'Insurance', dispute: 'Dispute' };
