'use client';

import { Info } from 'lucide-react';
import { usePlatformConfig } from '@/features/platform/config';

/** The notice admin switches on in Platform Economics, shown at the top of every page while it is on. */
export function SiteNotice() {
  const notice = usePlatformConfig().data?.siteNotice;
  if (!notice?.message) return null;
  return (
    <div role="status" className="mb-6 flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm sm:items-center">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary sm:mt-0" aria-hidden />
      <p className="min-w-0">{notice.message}</p>
    </div>
  );
}
