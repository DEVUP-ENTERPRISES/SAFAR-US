'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Handshake } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsAssetPartner } from '@/features/asset-partners/hooks';
import { goToSite } from '@/lib/sites';

/** Opens the Asset Partner dashboard; an account that isn't a partner yet sees how to join. */
function PartnerRouter() {
  const router = useRouter();
  const isAssetPartner = useIsAssetPartner();

  useEffect(() => {
    if (isAssetPartner) router.replace('/dashboard');
  }, [isAssetPartner, router]);

  if (isAssetPartner !== false) return <Skeleton className="h-48 w-full rounded-2xl" />;

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <header className="space-y-2">
        <h1 className="display text-3xl">Welcome to CatoDrive Partners</h1>
        <p className="text-muted-foreground">This account isn’t an Asset Partner yet.</p>
      </header>
      <button type="button" className="block w-full text-start sm:max-w-sm" onClick={() => void goToSite('guest', '/asset-partners')}>
        <Card className="h-full transition-colors hover:border-primary/40">
          <CardContent className="space-y-2 p-5">
            <Handshake className="h-6 w-6 text-primary" />
            <p className="font-semibold">Asset Partner programme</p>
            <p className="text-sm text-muted-foreground">We run your car for you and pay you monthly.</p>
          </CardContent>
        </Card>
      </button>
    </div>
  );
}

export default function PartnerHome() {
  return (
    <AuthGuard loginPath="/sign-in">
      <PartnerRouter />
    </AuthGuard>
  );
}
