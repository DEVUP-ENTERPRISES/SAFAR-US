'use client';

import { Info } from 'lucide-react';
import { usePlatformConfig } from '@/features/platform/config';

/** The testing notice; admin only switches it on and off in Platform Economics. */
export function SiteNotice() {
  if (!usePlatformConfig().data?.siteNotice?.enabled) return null;
  return (
    <div role="status" className="mb-6 flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm sm:items-center">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary sm:mt-0" aria-hidden />
      <p className="min-w-0">We’re testing CatoDrive right now. Prices you see are test values, not our real rates. Thanks for your patience while we get everything ready.</p>
    </div>
  );
}
