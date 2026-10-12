import type { BadgeTone } from '@catodrive/ui';
import type { PartnerTone } from '@catodrive/core/web/features/asset-partners/status';

const MAP: Record<PartnerTone, BadgeTone> = { success: 'success', warning: 'warning', destructive: 'destructive', muted: 'neutral', default: 'primary' };

/** The website's partner badge tones in the app's badge palette. */
export const partnerBadge = (tone: PartnerTone): BadgeTone => MAP[tone];

/** 1st, 2nd, 3rd, 11th… */
export function ordinal(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'st';
  if (n % 10 === 2 && n % 100 !== 12) return 'nd';
  if (n % 10 === 3 && n % 100 !== 13) return 'rd';
  return 'th';
}
