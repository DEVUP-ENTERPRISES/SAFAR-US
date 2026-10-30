'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Users } from 'lucide-react';
import { assetPartnerApi } from '@/features/asset-partners/api';

/** Things only the partner can fix: answering an "are you there?" notice, and adding an emergency contact. */
export function AttentionBanner() {
  const returns = useQuery({ queryKey: ['asset-partner-returns'], queryFn: () => assetPartnerApi.returns(), staleTime: 60_000, retry: false });
  const profile = useQuery({ queryKey: ['asset-partner-profile'], queryFn: () => assetPartnerApi.profile(), staleTime: 5 * 60_000, retry: false });
  const notice = returns.data?.exits.find((e) => e.canRespond);
  const noContact = profile.data && !profile.data.profile?.emergencyContacts?.length;
  if (!notice && !noContact) return null;
  return (
    <div className="mb-6 space-y-3">
      {notice && (
        <Link href="/returns" className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm hover:bg-warning/15">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span><span className="font-semibold">We’ve been trying to reach you.</span> Open Returns and press “I’m here” so we can keep looking after your car.</span>
        </Link>
      )}
      {noContact && (
        <Link href="/profile#emergency" className="flex items-start gap-3 rounded-lg border border-border bg-muted/50 p-4 text-sm hover:bg-muted">
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span><span className="font-semibold">Add an emergency contact.</span> We only call them if something happens to your car and we can’t reach you.</span>
        </Link>
      )}
    </div>
  );
}
