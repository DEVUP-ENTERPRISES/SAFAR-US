export type ClaimTone = 'success' | 'warning' | 'destructive' | 'muted' | 'default';

/** Badge colour per status in the claims list. */
export const CLAIM_LIST_TONE: Record<string, ClaimTone> = {
  opened: 'warning', investigating: 'default', approved: 'success', settled: 'success', rejected: 'destructive', closed: 'muted',
};

/** Badge colour per status on a claim's own page. */
export const CLAIM_DETAIL_TONE: Record<string, ClaimTone> = {
  opened: 'warning', investigating: 'warning', assigned: 'warning', approved: 'success', settled: 'success', rejected: 'destructive', closed: 'muted',
};

/** What each claim status means for the person who filed it. */
export const CLAIM_STATUS_COPY: Record<string, string> = {
  opened: 'Filed and waiting for our team to pick it up.',
  investigating: 'Our team is reviewing the evidence.',
  assigned: 'Assigned to a specialist for review.',
  approved: 'Upheld - settlement is being processed.',
  settled: 'Resolved and settled.',
  rejected: 'Reviewed and not upheld.',
  closed: 'Closed.',
};
