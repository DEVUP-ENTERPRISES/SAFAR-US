'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck, IdCard, ScanFace, LockKeyhole, CheckCircle2, XCircle, Clock, ArrowLeft, Camera, RefreshCw,
} from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/utils/format';
import { accountApi } from '@/features/account/api';
import { kycApi, type KycStatusView } from '@/features/kyc/api';
import { openIdentityModal, STRIPE_PUBLISHABLE_KEY } from '@/features/kyc/stripe-identity';
import { ApiError } from '@/lib/api/types';

const isDev = process.env.NODE_ENV !== 'production';

/** The three checks Stripe runs, shown up front so there are no surprises. */
const STEPS = [
  { icon: IdCard, title: "Photograph your driver's license", detail: 'Front and back. Make sure the text is sharp and glare-free.' },
  { icon: ScanFace, title: 'Take a quick selfie', detail: 'We match your face to the license to confirm it’s really you.' },
  { icon: LockKeyhole, title: 'We confirm and secure it', detail: 'Your documents go straight to our verification partner — we never store the images.' },
];

function VerifyIdentity() {
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const me = useQuery({ queryKey: ['me'], queryFn: () => accountApi.me() });

  const status = useQuery({
    queryKey: ['kyc-status'],
    queryFn: () => kycApi.status(),
    // While a decision is pending, poll so the webhook result lands on-screen.
    refetchInterval: (q) => ((q.state.data as KycStatusView | undefined)?.status === 'pending' ? 5000 : false),
  });

  const [confirmed, setConfirmed] = useState(false);
  const [devSession, setDevSession] = useState(false);

  const refreshStatus = () => qc.invalidateQueries({ queryKey: ['kyc-status'] });

  const start = useMutation({
    mutationFn: async () => {
      const session = await kycApi.startVerification();
      // Live Stripe Identity: open the hosted capture modal in place.
      if (session.clientSecret && STRIPE_PUBLISHABLE_KEY) {
        const outcome = await openIdentityModal(session.clientSecret);
        return { outcome } as const;
      }
      // Hosted redirect (Stripe can also return a URL).
      if (session.url && session.url !== 'about:blank') {
        window.location.assign(session.url);
        return { outcome: 'redirect' } as const;
      }
      // Dev stub (no live provider): reveal the offline decision controls.
      return { outcome: 'stub' } as const;
    },
    onSuccess: (r) => {
      if (r.outcome === 'completed') { refreshStatus(); toast({ title: 'Submitted for review', tone: 'success' }); }
      else if (r.outcome === 'stub') setDevSession(true);
      else if (r.outcome === 'canceled') toast({ title: 'Verification canceled', tone: 'info' });
    },
    onError: (e) => toast({ title: e instanceof ApiError ? e.message : (e as Error).message, tone: 'error' }),
  });

  // Dev-only: force a decision so the flow completes without a real webhook.
  const decide = useMutation({
    mutationFn: (d: 'verified' | 'rejected') => kycApi.devDecide(d, d === 'rejected' ? 'documents_unreadable' : undefined),
    onSuccess: () => { setDevSession(false); refreshStatus(); },
  });

  if (status.isLoading || me.isLoading) {
    return <div className="mx-auto max-w-2xl space-y-4 p-6"><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  const s = status.data?.status ?? 'not_started';
  const profile = me.data;
  const nameKnown = !!(profile?.firstName && profile?.lastName);
  const primaryAddress = profile?.addresses?.find((a) => a.isDefault) ?? profile?.addresses?.[0];

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <Link href="/account" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to account
      </Link>

      <PageHeader
        title="Verify your identity"
        description="A one-time check before your first booking — it keeps the community safe and unlocks trips."
      />

      {/* ── Terminal & in-progress states ─────────────────────────── */}
      {s === 'approved' && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <CheckCircle2 className="h-12 w-12 text-success" />
            <h2 className="text-xl font-bold">You’re verified</h2>
            <p className="max-w-sm text-sm text-muted-foreground">Your identity is confirmed. You’re all set to book.</p>
            <Button onClick={() => router.push('/search')} className="mt-2">Find a car</Button>
          </CardContent>
        </Card>
      )}

      {s === 'pending' && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Clock className="h-12 w-12 text-warning" />
            <h2 className="text-xl font-bold">Under review</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              We’ve got your documents and are reviewing them now. Most checks finish in a few minutes — we’ll notify you the moment it’s done.
            </p>
            <Button variant="outline" onClick={refreshStatus} className="mt-2"><RefreshCw className="h-4 w-4" /> Check again</Button>
          </CardContent>
        </Card>
      )}

      {(s === 'not_started' || s === 'rejected') && (
        <>
          {s === 'rejected' && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardContent className="flex items-start gap-3 py-5">
                <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-semibold text-destructive">Your last check didn’t pass</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {reasonLabel(status.data?.reason)} You can try again — a clear, well-lit photo of a valid license usually does it.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Why we need this */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-5 w-5 text-primary" /> Why we ask
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Every driver is verified so hosts know exactly who’s behind the wheel — and so you can trust the guests and hosts you meet. It takes about two minutes.</p>
              <p>Your license images are handled by our verification partner and are never shared with hosts or stored on your profile.</p>
            </CardContent>
          </Card>

          {/* What to expect */}
          <Card>
            <CardHeader><CardTitle className="text-lg">What you’ll do</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {STEPS.map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <step.icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-medium">{step.title}</p>
                    <p className="text-sm text-muted-foreground">{step.detail}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Personal-info confirmation */}
          <Card>
            <CardHeader><CardTitle className="text-lg">Confirm your details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">These must match the license you’re about to scan.</p>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Detail label="Legal name" value={nameKnown ? `${profile!.firstName} ${profile!.lastName}` : '—'} />
                <Detail label="Date of birth" value={profile?.dateOfBirth ? formatDate(profile.dateOfBirth) : '—'} />
                <Detail
                  label="Address"
                  value={primaryAddress ? `${primaryAddress.line1}, ${primaryAddress.city}, ${primaryAddress.state} ${primaryAddress.zip}` : '—'}
                  full
                />
              </dl>
              {(!nameKnown || !profile?.dateOfBirth) && (
                <p className="text-sm text-warning">
                  Add your legal name and date of birth on your{' '}
                  <Link href="/account" className="font-medium underline">account page</Link> first.
                </p>
              )}
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 accent-[hsl(var(--primary))]"
                />
                <span>The details above match my government-issued ID, and I’m ready to scan it.</span>
              </label>

              {!STRIPE_PUBLISHABLE_KEY && !isDev && (
                <p className="text-sm text-destructive">Identity verification is temporarily unavailable. Please try again later.</p>
              )}

              <Button
                className="w-full"
                size="lg"
                loading={start.isPending}
                disabled={!confirmed || (!nameKnown || !profile?.dateOfBirth) || (!STRIPE_PUBLISHABLE_KEY && !isDev)}
                onClick={() => start.mutate()}
              >
                <Camera className="h-4 w-4" /> {s === 'rejected' ? 'Try again' : 'Start verification'}
              </Button>

              {/* Dev-only offline decision (no live provider configured). */}
              {isDev && devSession && (
                <div className="rounded-lg border border-dashed border-border p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Dev: no live provider — simulate a decision</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" loading={decide.isPending} onClick={() => decide.mutate('verified')}>Approve</Button>
                    <Button size="sm" variant="outline" loading={decide.isPending} onClick={() => decide.mutate('rejected')}>Reject</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Badge tone="default" className="gap-1"><LockKeyhole className="h-3 w-3" /> Encrypted</Badge>
        Powered by Stripe Identity
      </p>
    </div>
  );
}

function Detail({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

function reasonLabel(reason?: string): string {
  const map: Record<string, string> = {
    documents_unreadable: 'The document photo wasn’t clear enough.',
    document_expired: 'The license appears to be expired.',
    selfie_mismatch: 'The selfie didn’t match the license photo.',
    verification_failed: 'We couldn’t confirm the details.',
  };
  return reason ? (map[reason] ?? 'We couldn’t confirm the details.') : 'We couldn’t confirm the details.';
}

export default function Page() {
  return (
    <AuthGuard>
      <VerifyIdentity />
    </AuthGuard>
  );
}
