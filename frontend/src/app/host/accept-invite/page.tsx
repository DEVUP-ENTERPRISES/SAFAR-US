'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Check, ShieldCheck, Car } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { captainApi, ABILITY_LABELS } from '@/features/host/team-api';
import { tokenStore } from '@/lib/api/token-store';
import { useAuthStore } from '@/features/auth/store';
import { ApiError } from '@/lib/api/types';

function AcceptInner() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const authStatus = useAuthStore((s) => s.status);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const preview = useQuery({
    queryKey: ['captain-invite', token],
    queryFn: () => captainApi.invitePreview(token),
    enabled: !!token,
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => captainApi.accept(token, preview.data?.needsPassword ? password : undefined),
    onSuccess: (res) => {
      if (res.tokens) tokenStore.set(res.tokens.accessToken, res.tokens.refreshToken);
      setUser(null);
      router.replace('/captain');
    },
  });

  if (!token) return <ErrorState message="This link is missing its invite code. Open the link from your email again." />;
  if (preview.isPending) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (preview.isError) {
    return (
      <ErrorState
        message={
          preview.error instanceof ApiError
            ? preview.error.message
            : "Couldn't load this invite. Check your connection and try again."
        }
        retry={() => preview.refetch()}
      />
    );
  }

  const inv = preview.data;
  const mismatch = inv.needsPassword && confirm.length > 0 && password !== confirm;
  // An existing account must be signed in as that person; the link alone never signs anyone in.
  const needsSignIn = !inv.needsPassword && authStatus !== 'authenticated';
  const canSubmit = needsSignIn ? false : inv.needsPassword ? password.length >= 8 && password === confirm : true;

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center py-8">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <ShieldCheck className="h-7 w-7" />
        </span>
        <div>
          <h1 className="display text-3xl">You&apos;re a Captain</h1>
          <p className="text-sm text-muted-foreground">
            {inv.fleetName} added you to their team{inv.title ? ` as ${inv.title}` : ''}.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-5 pt-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">What you can do</p>
            <ul className="mt-3 space-y-2.5">
              {inv.abilities.map((a) => (
                <li key={a} className="flex items-start gap-3 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>
                    <span className="font-medium">{ABILITY_LABELS[a].label}</span>
                    <span className="block text-xs text-muted-foreground">{ABILITY_LABELS[a].detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
            <Car className="h-4 w-4 shrink-0" />
            {inv.vehicleCount === 0
              ? 'Every car in the fleet, including ones added later'
              : `${inv.vehicleCount} ${inv.vehicleCount === 1 ? 'car' : 'cars'} assigned to you`}
          </p>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              accept.mutate();
            }}
          >
            <Field label="Your sign-in email" htmlFor="email">
              <Input id="email" value={inv.email} readOnly disabled />
            </Field>

            {inv.needsPassword ? (
              <>
                <Field
                  label="Choose a password"
                  htmlFor="pw"
                  hint="At least 8 characters. You'll use this with the email above."
                >
                  <Input
                    id="pw"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
                <Field label="Confirm password" htmlFor="pw2" error={mismatch ? 'Passwords do not match' : undefined}>
                  <Input
                    id="pw2"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </Field>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                You already have a CatoDrive account with this email — accepting links it to this fleet. Your
                existing password keeps working.
              </p>
            )}

            {accept.isError && (
              <p role="alert" className="text-sm text-destructive">
                {accept.error instanceof ApiError ? accept.error.message : "Couldn't accept this invite"}
              </p>
            )}

            {needsSignIn && (
              <p className="rounded-xl bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
                You already have an account with this email. Sign in first, then come back to this link to accept.{' '}
                <Link href={`/login?next=${encodeURIComponent(`/host/accept-invite?token=${token}`)}`} className="font-semibold text-primary underline">
                  Sign in
                </Link>
              </p>
            )}
            <Button type="submit" className="w-full" size="lg" disabled={!canSubmit} loading={accept.isPending}>
              Accept and start
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <AcceptInner />
    </Suspense>
  );
}
