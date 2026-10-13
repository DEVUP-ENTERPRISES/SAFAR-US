'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, Car, Handshake } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { WORKSPACE_HOME, useWorkspaceChoice, useWorkspaces } from '@/features/partner/workspaces';
import { goToSite } from '@/lib/sites';

const PATHS = [
  { icon: Car, title: 'Host your own cars', body: 'List cars you own, set your prices, and run trips yourself.', href: '/host' },
  { icon: Handshake, title: 'Asset Partner programme', body: 'We run your car for you and pay you monthly.', guestPath: '/asset-partners' },
  { icon: Building2, title: 'Corporate travel', body: 'Set up your company to book and approve business trips.', href: '/corporate' },
];

/** Opens the account's workspace (the one last used, else the first); an account with none sees how to become a partner. */
function WorkspaceRouter() {
  const router = useRouter();
  const { ready, available } = useWorkspaces();
  const chosen = useWorkspaceChoice((s) => s.current);

  useEffect(() => {
    if (!ready || available.length === 0) return;
    const target = chosen && available.includes(chosen) ? chosen : available[0];
    router.replace(WORKSPACE_HOME[target]);
  }, [ready, available, chosen, router]);

  if (!ready || available.length > 0) return <Skeleton className="h-48 w-full rounded-2xl" />;

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <header className="space-y-2">
        <h1 className="display text-3xl">Welcome to CatoDrive Partners</h1>
        <p className="text-muted-foreground">This account doesn’t have a partner workspace yet. Choose how you’d like to work with CatoDrive.</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-3">
        {PATHS.map((p) => {
          const body = (
            <Card className="h-full transition-colors hover:border-primary/40">
              <CardContent className="space-y-2 p-5">
                <p.icon className="h-6 w-6 text-primary" />
                <p className="font-semibold">{p.title}</p>
                <p className="text-sm text-muted-foreground">{p.body}</p>
              </CardContent>
            </Card>
          );
          return p.href ? (
            <Link key={p.title} href={p.href}>{body}</Link>
          ) : (
            <button key={p.title} type="button" className="text-start" onClick={() => void goToSite('guest', p.guestPath!)}>{body}</button>
          );
        })}
      </div>
    </div>
  );
}

export default function PartnerHome() {
  return (
    <AuthGuard>
      <WorkspaceRouter />
    </AuthGuard>
  );
}
