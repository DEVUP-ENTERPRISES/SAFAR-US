'use client';

import { useState, type ReactNode } from 'react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api/types';
import { useHostMe, useOnboardHost } from '@/features/host/hooks';
import { HostNav } from '@/features/host/components/host-nav';

function HostShell({ children }: { children: ReactNode }) {
  const hostQuery = useHostMe();
  const onboard = useOnboardHost();
  const [displayName, setDisplayName] = useState('');

  if (hostQuery.isLoading) return <Skeleton className="h-64 w-full" />;

  // Not a host yet → onboarding.
  if (hostQuery.isError && hostQuery.error instanceof ApiError && hostQuery.error.status === 404) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle>Become a KIEDO host</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            List your vehicles, set your prices, and start earning. Set up takes a minute.
          </p>
          <Field label="Display name" htmlFor="dn" hint="Shown to guests on your listings.">
            <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          <Button
            className="w-full"
            disabled={!displayName}
            loading={onboard.isPending}
            onClick={() => onboard.mutate(displayName)}
          >
            Start hosting
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <HostNav />
      {children}
    </div>
  );
}

export default function HostLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <HostShell>{children}</HostShell>
    </AuthGuard>
  );
}
