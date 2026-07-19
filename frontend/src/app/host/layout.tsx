'use client';

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Store, Check } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api/types';
import { useHostMe, useOnboardHost } from '@/features/host/hooks';
import { HostSidebar } from '@/features/host/components/host-sidebar';

function HostShell({ children }: { children: ReactNode }) {
  const hostQuery = useHostMe();
  const onboard = useOnboardHost();
  const [displayName, setDisplayName] = useState('');

  if (hostQuery.isLoading) return <Skeleton className="h-64 w-full" />;

  // Not a host yet → onboarding.
  if (hostQuery.isError && hostQuery.error instanceof ApiError && hostQuery.error.status === 404) {
    return (
      <div className="mx-auto grid max-w-5xl items-center gap-10 py-8 lg:grid-cols-2">
        {/* Pitch */}
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <Store className="h-3.5 w-3.5 text-primary" /> Hosting on CATO
          </span>
          <h1 className="display mt-5 text-display">
            Your car can pay
            <br />
            <span className="text-muted-foreground">for itself.</span>
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            List in minutes, set your own price, and keep control of your calendar. Set-up takes
            about a minute.
          </p>
          <ul className="mt-7 space-y-3">
            {[
              'You set the price — or let Smart Price do it for you',
              'Cash out instantly, or on the standard payout schedule',
              'Every guest is verified before they can book',
            ].map((b) => (
              <li key={b} className="flex items-start gap-3 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Form */}
        <Card className="rounded-2xl shadow-float">
          <CardHeader>
            <CardTitle>Become a CATO host</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Display name" htmlFor="dn" hint="Shown to guests on your listings.">
              <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </Field>
            <Button
              className="w-full"
              size="lg"
              disabled={!displayName}
              loading={onboard.isPending}
              onClick={() => onboard.mutate(displayName)}
            >
              Start hosting
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Free to list. You only pay when you earn.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex gap-8 pb-24 md:pb-0">
      <HostSidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export default function HostLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The host login page is public — everything else requires a session.
  if (pathname === '/host/login') return <>{children}</>;
  return (
    <AuthGuard loginPath="/host/login">
      <HostShell>{children}</HostShell>
    </AuthGuard>
  );
}
