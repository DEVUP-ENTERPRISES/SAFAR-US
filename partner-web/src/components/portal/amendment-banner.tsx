'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { FileSignature } from 'lucide-react';
import { assetPartnerApi } from '@/features/asset-partners/api';

/** Shown on every portal page while a change to the partner's terms waits for their signature. */
export function AmendmentBanner() {
  const pathname = usePathname();
  const q = useQuery({ queryKey: ['partner-amendment'], queryFn: () => assetPartnerApi.amendment(), refetchInterval: 5 * 60_000, retry: false });
  if (!q.data || pathname === '/terms-change') return null;
  return (
    <div role="status" className="mb-6 flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <FileSignature className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div className="text-sm">
          <p className="font-semibold">CatoDrive has proposed a change to your terms</p>
          <p className="text-muted-foreground">Nothing changes until you review and sign it.</p>
        </div>
      </div>
      <Link href="/terms-change" className="inline-flex h-10 shrink-0 items-center justify-center rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
        Review the change
      </Link>
    </div>
  );
}
