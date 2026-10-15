'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Handshake, ShieldCheck } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsAssetPartner } from '@/features/asset-partners/hooks';
import { insurerApi } from '@/features/insurers/api';
import { useAuthStore } from '@/features/auth/store';
import { goToSite } from '@/lib/sites';

/** Opens the Asset Partner dashboard (or the insurer portal); an account with neither sees how to join. */
function PartnerRouter() {
  const router = useRouter();
  const signedIn = useAuthStore((s) => s.status === 'authenticated');
  const isAssetPartner = useIsAssetPartner();
  const insurer = useQuery({ queryKey: ['insurer-me'], queryFn: () => insurerApi.me(), enabled: signedIn && isAssetPartner === false, retry: false });
  const target = isAssetPartner ? '/dashboard' : insurer.data ? '/insurers/portal' : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  if (isAssetPartner === undefined || target || (isAssetPartner === false && insurer.isPending)) {
    return <Skeleton className="h-48 w-full rounded-2xl" />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <header className="space-y-2">
        <h1 className="display text-3xl">Welcome to CatoDrive Partners</h1>
        <p className="text-muted-foreground">This account isn’t a partner yet. Choose how you’d like to work with CatoDrive.</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        <button type="button" className="text-start" onClick={() => void goToSite('guest', '/asset-partners')}>
          <Card className="h-full transition-colors hover:border-primary/40">
            <CardContent className="space-y-2 p-5">
              <Handshake className="h-6 w-6 text-primary" />
              <p className="font-semibold">Asset Partner programme</p>
              <p className="text-sm text-muted-foreground">We run your car for you and pay you monthly.</p>
            </CardContent>
          </Card>
        </button>
        <Link href="/insurers/portal">
          <Card className="h-full transition-colors hover:border-primary/40">
            <CardContent className="space-y-2 p-5">
              <ShieldCheck className="h-6 w-6 text-primary" />
              <p className="font-semibold">Insurance partner</p>
              <p className="text-sm text-muted-foreground">Sell your protection plans to guests at checkout.</p>
            </CardContent>
          </Card>
        </Link>
      </div>
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
