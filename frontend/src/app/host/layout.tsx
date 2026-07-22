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
import { ErrorState } from '@/components/ui/states';
import { useHostMe, useOnboardHost, isNotAHost } from '@/features/host/hooks';
import { HostSidebar } from '@/features/host/components/host-sidebar';

function HostShell({ children }: { children: ReactNode }) {
  const hostQuery = useHostMe();
  const onboard = useOnboardHost();
  const [displayName, setDisplayName] = useState('');

  const notAHost = isNotAHost(hostQuery.error);

  // Still deciding. `isPending` covers the first load; `isFetching` covers a
  // revalidation after a cached error — without it, React Query reports the old
  // error instantly and an existing host sees the signup screen flash.
  if (hostQuery.isPending || (hostQuery.isError && hostQuery.isFetching)) {
    return <Skeleton className="h-64 w-full" />;
  }

  // A real failure (network / 5xx / expired session) is NOT "you're not a host".
  // Say so and offer a retry instead of rendering an empty dashboard.
  if (hostQuery.isError && !notAHost) {
    return (
      <ErrorState
        message="Couldn't load your host profile. Check your connection and try again."
        retry={() => hostQuery.refetch()}
      />
    );
  }

  // Confirmed not a host → onboarding.
  if (notAHost) {
    return (
      <div className="mx-auto grid max-w-5xl items-center gap-10 py-8 lg:grid-cols-2">
        {/* Pitch */}
        <div className="space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-primary">
            <Store className="h-4 w-4" /> Hosting on CATO
          </span>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.05]">
            Your car can pay
            <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-muted-foreground to-muted-foreground/40">for itself.</span>
          </h1>
          <p className="max-w-md text-xl leading-relaxed text-muted-foreground font-medium">
            List in minutes, set your own price, and keep control of your calendar. Set-up takes
            about a minute.
          </p>
          <ul className="space-y-4 pt-4">
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
        <Card className="rounded-[2.5rem] shadow-soft bg-card/80 backdrop-blur border-border/50">
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
