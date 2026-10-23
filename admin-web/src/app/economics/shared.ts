import { IdCard, Car, UserSearch, Umbrella } from 'lucide-react';
import type { PlatformConfig } from '@/features/admin/api';

export interface TabProps {
  draft: PlatformConfig;
  set: (fn: (d: PlatformConfig) => void) => void;
}

/** cents <-> dollars, kept explicit so we never float-round money into the API. */
export const toDollars = (cents: number) => (cents / 100).toFixed(2);
export const toCents = (dollars: string) => Math.round(Number(dollars) * 100);
export const toPct = (bps: number) => (bps / 100).toString();
export const toBps = (pct: string) => Math.round(Number(pct) * 100);

/** When each verification check fires — the admin-facing labels. */
export const TRIGGER_LABEL: Record<string, string> = {
  on_signup: 'Once at signup',
  on_first_booking: 'On first booking',
  on_every_booking: 'Every booking',
  manual: 'Manual (ops only)',
};

/** Presentation for each configurable verification service. */
export const VERIFICATION_META = {
  identity: { label: 'Identity', hint: 'Government ID + selfie.', icon: IdCard },
  mvr: { label: 'Driving record (MVR)', hint: 'Motor-vehicle report.', icon: Car },
  background: { label: 'Background check', hint: 'Criminal / watchlist screen.', icon: UserSearch },
  insurance: { label: 'Insurance', hint: 'Proof of personal coverage.', icon: Umbrella },
} as const;
