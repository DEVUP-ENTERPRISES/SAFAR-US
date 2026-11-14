'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Car, ShieldAlert, UserCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useAuthStore } from '@/features/auth/store';
import { driverApi, DRIVER_STATUS } from '@/features/bookings/drivers';
import { ApiError } from '@/lib/api/types';
import { formatDate } from '@/lib/utils/format';

export default function DriverInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const qc = useQueryClient();
  const router = useRouter();
  const auth = useAuthStore((s) => s.status);
  const here = `/drivers/invite/${token}`;
  const q = useQuery({ queryKey: ['driver-invite', token, auth], queryFn: () => driverApi.invitePreview(token), enabled: auth !== 'loading', retry: false });
  const done = (data: unknown) => qc.setQueryData(['driver-invite', token, auth], data);
  const accept = useMutation({ meta: { silentError: true }, mutationFn: () => driverApi.accept(token), onSuccess: done });
  const check = useMutation({ meta: { silentError: true }, mutationFn: () => driverApi.check(token), onSuccess: done });
  const error = (accept.error ?? check.error) as unknown;

  if (auth === 'loading' || q.isLoading) return <div className="container max-w-xl space-y-4 py-10"><Skeleton className="h-48 w-full rounded-lg" /></div>;
  if (q.isError || !q.data) {
    return (
      <div className="container max-w-xl py-10">
        <ErrorState message={q.error instanceof ApiError ? q.error.message : 'We couldn’t open this invite.'} />
      </div>
    );
  }

  const i = q.data;
  const signedIn = auth === 'authenticated';
  const mine = signedIn && i.yours !== false;
  const taken = signedIn && i.yours === false;

  return (
    <div className="container max-w-xl space-y-5 py-10">
      <div>
        <p className="text-sm font-semibold text-primary">Driver invite</p>
        <h1 className="display mt-1 text-2xl">{i.guestFirstName} added you as a driver</h1>
      </div>
      <Card>
        <CardContent className="space-y-2 p-5 text-sm">
          <p className="flex items-center gap-2 font-semibold"><Car className="h-4 w-4 text-primary" aria-hidden /> {i.car}</p>
          <p className="tabular-nums text-muted-foreground">{formatDate(i.start)} to {formatDate(i.end)}</p>
          <p><Badge tone={DRIVER_STATUS[i.status].tone}>{DRIVER_STATUS[i.status].label}</Badge></p>
        </CardContent>
      </Card>

      {i.status === 'approved' ? (
        <Card className="border-success/40 bg-success/5">
          <CardContent className="flex items-start gap-3 p-5 text-sm">
            <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
            <span><span className="block font-semibold">You’re approved to drive.</span>Bring your driver’s license to pickup. The host checks it before handing over the keys.</span>
          </CardContent>
        </Card>
      ) : !signedIn ? (
        <Card>
          <CardContent className="space-y-3 p-5 text-sm">
            <p>To drive, sign in or create a free CatoDrive account. Then check your driver’s license and take a quick selfie. It takes about 3 minutes.</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => router.push(`/register?next=${encodeURIComponent(here)}`)}>Create account</Button>
              <Button variant="outline" onClick={() => router.push(`/login?next=${encodeURIComponent(here)}`)}>Sign in</Button>
            </div>
          </CardContent>
        </Card>
      ) : taken ? (
        <ErrorState message="This invite was accepted by another account. Sign in with the account you used, or ask the guest to send a new invite." />
      ) : i.status === 'invited' ? (
        <Card>
          <CardContent className="space-y-3 p-5 text-sm">
            <p>You’ll be added to this trip once your license and selfie check passes. You won’t be charged anything.</p>
            <Button loading={accept.isPending} onClick={() => accept.mutate()}><UserCheck className="h-4 w-4" /> Accept invite</Button>
          </CardContent>
        </Card>
      ) : i.status === 'verifying' && mine ? (
        <Card>
          <CardContent className="space-y-3 p-5 text-sm">
            {i.needs.length ? (
              <>
                <p className="font-semibold">To finish:</p>
                <ul className="list-disc space-y-1 ps-5">{i.needs.map((n) => <li key={n}>{n}</li>)}</ul>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => router.push(`/account/verify-identity?next=${encodeURIComponent(here)}`)}>Check my license</Button>
                  <Button variant="outline" loading={check.isPending} onClick={() => check.mutate()}>I’ve finished</Button>
                </div>
              </>
            ) : (
              <>
                <p>We’re finishing your check. This page updates when it’s done.</p>
                <Button variant="outline" loading={check.isPending} onClick={() => check.mutate()}>Check again</Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : i.status === 'declined' ? (
        <Card className="border-destructive/40">
          <CardContent className="space-y-3 p-5 text-sm">
            <p className="flex items-center gap-2 font-semibold"><ShieldAlert className="h-4 w-4 text-destructive" aria-hidden /> You weren’t approved to drive on this trip.</p>
            {i.declineReasons?.length ? <p className="text-muted-foreground">{i.declineReasons.join(' ')}</p> : null}
            {i.canRetry && mine && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => router.push(`/account/verify-identity?next=${encodeURIComponent(here)}`)}>Fix my license check</Button>
                <Button loading={check.isPending} onClick={() => check.mutate()}>Try again</Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : i.status === 'payment_failed' ? (
        <Card><CardContent className="p-5 text-sm">You passed the check. {i.guestFirstName} needs to finish payment, then you’re on the trip.</CardContent></Card>
      ) : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error instanceof ApiError ? error.message : 'That didn’t go through. Try again.'}</p> : null}
    </div>
  );
}
