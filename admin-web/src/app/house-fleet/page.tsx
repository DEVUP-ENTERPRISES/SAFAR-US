'use client';

import { useMutation } from '@tanstack/react-query';
import { Car, ExternalLink, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/types';
import { adminApi } from '@/features/admin/api';

/**
 * Launches the House Fleet Host dashboard — CatoDrive's own vehicles, run
 * through the existing Host tooling rather than a second dashboard.
 *
 * The session is minted server-side (platform:manage) and handed to the
 * consumer app once via URL, because the two apps are separate origins and
 * don't share localStorage.
 */
const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

export default function HouseFleetPage() {
  const toast = useToast();

  const launch = useMutation({
    mutationFn: () => adminApi.houseFleetSession(),
    onSuccess: (res) => {
      const url = new URL('/host/bridge', WEB_URL);
      url.searchParams.set('at', res.tokens.accessToken);
      url.searchParams.set('rt', res.tokens.refreshToken);
      window.open(url.toString(), '_blank', 'noopener');
    },
    onError: (e) =>
      toast({
        tone: 'error',
        title:
          e instanceof ApiError && e.code === 'NOT_CONFIGURED'
            ? 'House Fleet is not seeded yet'
            : e instanceof ApiError
              ? e.message
              : 'Could not open the House Fleet dashboard',
      }),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="House Fleet"
        title="CatoDrive's own vehicles"
        description="The fleet CatoDrive owns and operates directly — managed through the same Host tooling guests' cars use, not a separate dashboard."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Car className="h-4 w-4 text-primary" /> Open the fleet dashboard
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Opens Listings, Fleet, Operations, Trips and Captains for the House Fleet account in a new tab.
            Everything you onboard there is bookable by guests immediately.
          </p>
          <Button loading={launch.isPending} onClick={() => launch.mutate()}>
            <ExternalLink className="h-4 w-4" /> Open House Fleet dashboard
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" /> How this account works
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">No public sign-up.</span> The account is seeded from
            the server environment and can only be opened from here.
          </p>
          <p>
            <span className="font-medium text-foreground">Revenue stays in CatoDrive&apos;s balance.</span> No
            Stripe Connect account is attached, so guest payments for these cars land in the platform&apos;s own
            Stripe balance — there is no payout to arrange and nothing to reconcile.
          </p>
          <p>
            <span className="font-medium text-foreground">Captains are invited from inside.</span> Use the
            Captains section of the dashboard to add the ops staff who run these vehicles day to day.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
